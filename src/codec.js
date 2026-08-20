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

  // ── JS mirror of the wasm encode, with per-path byte offsets ───────────────
  // Returns { bytes: Uint8Array, ranges: Map<pathKey, [start,end)> } so the hex
  // view can highlight the range of any tag and map clicks back to paths.
  // Format mirrors nbt_utils.cpp encodeModel/encodeTag exactly.

  function writeStringModUTF8(out, s) {
    const w = [];
    for (let i = 0; i < s.length; i++) {
      const u = s.charCodeAt(i);
      if (u >= 0x0001 && u <= 0x007F) w.push(u);
      else if (u <= 0x07FF) { w.push(0xC0 | (u >> 6), 0x80 | (u & 0x3F)); }
      else { w.push(0xE0 | (u >> 12), 0x80 | ((u >> 6) & 0x3F), 0x80 | (u & 0x3F)); }
    }
    pushU16(out, w.length);
    for (const b of w) out.push(b);
  }

  function pushU16(out, v) { out.push((v >> 8) & 0xff, v & 0xff); }
  function pushU32(out, v) { out.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff); }
  function pushU64(out, v) {
    for (let i = 7; i >= 0; i--) out.push(Number((v >> BigInt(i * 8)) & 0xffn));
  }

  function b64ToArray(v) { return b64ToBytes(v); }

  function encodeTagOffset(out, m, withName, ranges, pathKey) {
    const start = out.length;
    if (withName) writeStringModUTF8(out, String(m.n || ''));
    const t = m.t;
    switch (t) {
      case 1: out.push(Number(m.v) & 0xff); break;
      case 2: pushU16(out, Number(m.v) & 0xffff); break;
      case 3: pushU32(out, Number(m.v) >>> 0); break;
      case 4: pushU64(out, BigInt(m.v)); break;
      case 5: { const buf = new ArrayBuffer(4); new DataView(buf).setFloat32(0, Number(m.v), false); out.push(...new Uint8Array(buf)); break; }
      case 6: { const buf = new ArrayBuffer(8); new DataView(buf).setFloat64(0, Number(m.v), false); out.push(...new Uint8Array(buf)); break; }
      case 8: writeStringModUTF8(out, String(m.v)); break;
      case 7: { const arr = b64ToArray(m.v); pushU32(out, arr.length); for (const b of arr) out.push(b); break; }
      case 11: { const arr = m.v || []; pushU32(out, arr.length); for (const v of arr) pushU32(out, Number(v) >>> 0); break; }
      case 12: { const arr = m.v || []; pushU32(out, arr.length); for (const v of arr) pushU64(out, BigInt(v)); break; }
      case 9: {
        const et = m.et === undefined ? 0 : m.et;
        out.push(et);
        const arr = m.v || [];
        pushU32(out, arr.length);
        for (let i = 0; i < arr.length; i++) {
          encodeTagOffset(out, arr[i], false, ranges, childKey(pathKey, i));
        }
        break;
      }
      case 10: {
        const pairs = m.v || [];
        for (let i = 0; i < pairs.length; i++) {
          const [k, child] = pairs[i];
          out.push(child.t);
          writeStringModUTF8(out, String(k));
          encodeTagOffset(out, child, false, ranges, childKey(pathKey, k));
        }
        out.push(0); // T_End
        break;
      }
      default: throw new Error('encode: unsupported tag type ' + t);
    }
    const end = out.length;
    ranges.set(pathKey || '', [start, end]);
    return out.length;
  }

  // Encode a model into bytes + offset map. Returns { bytes, ranges }.
  // ranges keys use the same \u001f-joined paths as the tree widget.
  const SEP = '\u001f';
  function childKey(pathKey, seg) { return pathKey ? pathKey + SEP + seg : String(seg); }

  function encodeWithOffsets(model) {
    const out = [];
    const ranges = new Map();
    out.push(model.t);
    encodeTagOffset(out, model, true, ranges, '');
    // include the leading type byte in the root's range
    const rootRange = ranges.get('');
    if (rootRange) ranges.set('', [0, rootRange[1]]);
    return { bytes: new Uint8Array(out), ranges };
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
    encodeWithOffsets,
  };

  return ns;
})(window.NBT || {});