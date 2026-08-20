/* ─────────────────────────────────────────────────────────────────────────────
 * codec.js — wasm glue + compression + load/save pipeline.
 *
 * Compression is handled with the platform CompressionStream/DecompressionStream
 * (gzip / zlib "deflate" / raw "deflate-raw"), the wasm layer is a pure NBT codec.
 * ───────────────────────────────────────────────────────────────────────────── */

window.NBT = (function (ns) {
  'use strict';

  const MODES = {
    gzip: { label: 'gzip', stream: 'gzip' },
    zlib: { label: 'zlib', stream: 'deflate' },
    raw: { label: 'raw deflate', stream: 'deflate-raw' },
    none: { label: 'uncompressed', stream: null },
  };

  let _ready;
  let _module = null;

  function ready() {
    if (_ready) return _ready;
    _ready = new Promise((resolve, reject) => {
      const start = performance.now();
      const loader = () => {
        if (typeof createNBTModule !== 'function') {
          if (performance.now() - start > 15000) { reject(new Error('NBT codec failed to load')); return; }
          setTimeout(loader, 20);
          return;
        }
        createNBTModule().then((m) => { _module = m; ns.codec._module = m; resolve(m); }).catch(reject);
      };
      loader();
    });
    return _ready;
  }

  // ── base64 helpers ─────────────────────────────────────────────────────────

  function bytesToB64(bytes) {
    let bin = '';
    const len = bytes.length;
    for (let i = 0; i < len; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // ── compression (async) ─────────────────────────────────────────────────────

  async function readAll(stream) {
    const reader = stream.getReader();
    const chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const size = chunks.reduce((a, c) => a + c.length, 0);
    const out = new Uint8Array(size);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }

  async function decompressKind(bytes, kind) {
    if (!kind) return bytes;
    const ds = new DecompressionStream(kind);
    return readAll(new Blob([bytes]).stream().pipeThrough(ds));
  }

  function hasGzipMagic(b) { return b.length > 2 && b[0] === 0x1f && b[1] === 0x8b; }

  // Return { modeKey } for a raw buffer, cheaply.
  function sniffMode(bytes) {
    if (hasGzipMagic(bytes)) return 'gzip';
    if (bytes.length > 2 && bytes[0] === 0x78) return 'zlib';       // common zlib headers
    return 'unknown';                                                // raw or uncompressed
  }

  // Try decompress candidates for a file buffer, returning the best
  // { data, mode } — the mode whose decode is cleanest.
  async function loadBuffer(rawBytes) {
    const wasm = await ready();
    const candidates = [];

    if (hasGzipMagic(rawBytes)) candidates.push({ mode: 'gzip', kind: 'gzip' });
    candidates.push({ mode: 'zlib', kind: 'deflate' });
    candidates.push({ mode: 'raw', kind: 'deflate-raw' });
    // uncompressed always last and never fails to "decompress"

    async function tryDecode(data) {
      try {
        const res = wasm.decode(bytesToB64(data), true);
        return res;
      } catch (e) {
        return { ok: false, errors: [String(e && e.message || e)], root: null };
      }
    }

    let best = null;
    for (const c of candidates) {
      let data;
      try {
        data = c.kind ? await decompressKind(rawBytes, c.kind) : rawBytes;
      } catch (err) {
        continue; // this candidate doesn't inflate
      }
      const res = await tryDecode(data);
      if (res.ok && res.root) {
        const score = { mode: c.mode, data, res, errCount: (res.errors || []).length, decoded: true };
        if (score.errCount === 0) return score;
        if (!best || score.errCount < best.errCount) best = score;
      }
    }

    if (best) return best;

    // try uncompressed anyway if nothing inflated
    const res = await tryDecode(rawBytes);
    if (res.ok && res.root) {
      return { mode: 'none', data: rawBytes, res, errCount: (res.errors || []).length, decoded: true };
    }
    return { mode: null, data: null, res: null, errCount: Infinity, decoded: false };
  }

  // Compile a model to the requested compression mode → Uint8Array.
  async function compileModel(model, mode) {
    const wasm = await ready();
    const b64 = wasm.encode(model);            // may throw on malformed model
    const raw = b64ToBytes(b64);
    const kind = MODES[mode] ? MODES[mode].stream : null;
    if (!kind) return raw;
    const cs = new CompressionStream(kind);
    return readAll(new Blob([raw]).stream().pipeThrough(cs));
  }

  function download(bytes, filename, mime) {
    const blob = new Blob([bytes], { type: mime || 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || 'out.dat';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }

  ns.codec = {
    ready, loadBuffer, compileModel, download,
    bytesToB64, b64ToBytes, sniffMode, MODES,
    decompressKind, hasGzipMagic,
  };

  return ns;
})(window.NBT || {});