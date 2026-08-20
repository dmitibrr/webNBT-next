/* ─────────────────────────────────────────────────────────────────────────────
 * region.js — Minecraft region files (.mca / .mcr).
 *
 * 8 KiB header:   1024 location entries [3-byte sector offset + 1-byte size]
 *                 1024 timestamp  entries (u32)
 * Each chunk:     [u32 length][u8 compression][payload]
 *   compression:   0/1 → gzip, 2 → zlib, 3 → uncompressed
 * ───────────────────────────────────────────────────────────────────────────── */

window.NBT = (function (ns) {
  'use strict';
  const { T } = ns;

  function u32be(dv, o) { return dv.getUint32(o, false); }
  function setU32be(dv, o, v) { dv.setUint32(o, v, false); }

  function createRegion(bytes) {
    const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const chunks = new Map();   // "x,z" → { x, z, time, sectorOff, sectorCount, raw }
    const models = new Map();   // "x,z" → { model, compression } for edited chunks
    const original = bytes;

    for (let i = 0; i < 1024; i++) {
      const loc = u32be(header, i * 4);
      const x = i % 32, z = Math.floor(i / 32);
      const sectorOff = loc >> 8;
      const sectorCount = loc & 0xff;
      if (sectorOff === 0 || sectorCount === 0) continue;
      chunks.set(x + ',' + z, {
        x, z,
        time: u32be(header, 4096 + i * 4),
        sectorOff, sectorCount,
      });
    }

    function sliceChunk(c) {
      const start = c.sectorOff * 4096;
      const end = start + c.sectorCount * 4096;
      if (start >= original.length) return null;
      const data = original.subarray(start, Math.min(end, original.length));
      if (data.length < 5) return null;
      const length = ((data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3]) >>> 0;
      const compression = data[4];
      // length includes the 1-byte compression field; payload is after it
      const payload = data.subarray(5, Math.min(4 + length, data.length));
      return { compression, payload, raw: data };
    }

    // Read a chunk as an editable NBT model (cached).
    async function chunkModel(x, z) {
      const key = x + ',' + z;
      if (models.has(key)) return models.get(key).model;
      const c = chunks.get(key);
      if (!c) return null;
      const sliced = sliceChunk(c);
      if (!sliced) return null;

      let payload = sliced.payload;
      switch (sliced.compression) {
        case 2: payload = await ns.codec.decompressKind(payload, 'deflate'); break;     // zlib
        case 3: break;                                                                   // uncompressed
        default:
          try { payload = await ns.codec.decompressKind(payload, 'gzip'); }
          catch (e) { return null; }
          if (!ns.codec.hasGzipMagic(sliced.payload)) {
            try { payload = await ns.codec.decompressKind(sliced.payload, 'deflate-raw'); } catch (e) { /* keep */ }
          }
          break;
      }
      const b64 = ns.codec.bytesToB64(payload);
      const wasm = await ns.codec.ready();
      const res = wasm.decode(b64, true);
      if (!res.ok && !res.root) return null;
      return res.root;
    }

    function chunkModelSync(x, z) {
      const key = x + ',' + z;
      if (models.has(key)) return models.get(key).model;
      const c = chunks.get(key);
      if (!c) return null;
      const sliced = sliceChunk(c);
      if (!sliced) return null;
      // uncompressed marker not yet (async); simplest: only cache-aware
      return null;
    }

    function isDirty(x, z) { return models.has(x + ',' + z); }
    function setChunkModel(x, z, model, compression) {
      models.set(x + ',' + z, { model, compression: compression || 2 });
    }
    function removeChunk(x, z) {
      chunks.delete(x + ',' + z);
      models.delete(x + ',' + z);
    }
    function listChunks() {
      return Array.from(chunks.values()).map((c) => ({ x: c.x, z: c.z, time: c.time }));
    }

    async function pack() {
      // gather entries: edited → re-encode; pristine → reuse original bytes
      const entries = [];
      for (const c of chunks.values()) {
        const key = c.x + ',' + c.z;
        let data;
        let compression = 2;
        if (models.has(key)) {
          const { model, compression: comp } = models.get(key);
          const raw = await ns.codec.compileModel(model, comp === 3 ? 'none' : (comp === 1 ? 'gzip' : 'zlib'));
          compression = comp;
          if (raw.length === 0) continue;
          data = raw;
        } else {
          const sliced = sliceChunk(c);
          if (!sliced) continue;
          data = sliced.payload;
          compression = sliced.compression;
        }
        entries.push({ x: c.x, z: c.z, time: models.has(key) ? Date.now() / 1000 | 0 : c.time, data, compression });
      }

      const totalSectors = entries.reduce((a, e) => a + Math.max(1, Math.ceil((e.data.length + 5) / 4096)), 0);
      const out = new Uint8Array(8192 + totalSectors * 4096);
      const dv = new DataView(out.buffer);
      let cursor = 8192;
      for (const e of entries) {
        const sectorCount = Math.max(1, Math.ceil((e.data.length + 5) / 4096));
        const idx = e.x + e.z * 32;
        setU32be(dv, idx * 4, ((cursor / 4096) << 8) | sectorCount);
        setU32be(dv, 4096 + idx * 4, e.time >>> 0);
        const len = e.data.length + 1;
        out[cursor] = (len >>> 24) & 0xff;
        out[cursor + 1] = (len >>> 16) & 0xff;
        out[cursor + 2] = (len >>> 8) & 0xff;
        out[cursor + 3] = len & 0xff;
        out[cursor + 4] = e.compression;
        out.set(e.data, cursor + 5);
        cursor += sectorCount * 4096;
      }
      return out;
    }

    return {
      kind: 'region',
      listChunks, chunkModel, chunkModelSync, isDirty, setChunkModel, removeChunk, pack,
    };
  }

  // Cheap probe: file is a multiple of 4096, ≥ 8 KiB, and first location is sane.
  function probeRegion(bytes) {
    if (bytes.length < 8192 || bytes.length % 4096 !== 0) return false;
    const dv = new DataView(bytes.buffer, 0, Math.min(bytes.byteLength, 8192));
    let found = 0;
    for (let i = 0; i < 1024 && found < 3; i++) {
      const loc = u32be(dv, i * 4);
      const off = (loc >>> 8) * 4096;
      const count = loc & 0xff;
      if (off > 0 && count > 0 && off + count * 4096 <= bytes.length) found++;
      else if (loc !== 0) return false;
    }
    return found > 0;
  }

  ns.region = { create: createRegion, probe: probeRegion };

  return ns;
})(window.NBT || {});