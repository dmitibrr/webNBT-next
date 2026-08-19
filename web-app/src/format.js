/* ─────────────────────────────────────────────────────────────────────────────
 * format.js — SNBT (de)serialization + typed-JSON converter.
 * ───────────────────────────────────────────────────────────────────────────── */

window.NBT = (function (ns) {
  'use strict';
  const { T, typeName } = ns;

  function quote(s) {
    return '"' + s
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      .replace(/\x08/g, '\\b')
      .replace(/\x0c/g, '\\f') + '"';
  }

  function safeKey(k) {
    return /^[a-zA-Z_][a-zA-Z0-9._+-]*$/.test(k) ? k : quote(k);
  }

  function numStr(v, isFloat) {
    if (Number.isNaN(v)) return 'NaN';
    if (v === Infinity) return 'Infinity';
    if (v === -Infinity) return '-Infinity';
    if (isFloat) {
      if (Number.isInteger(v) && Math.abs(v) < 1e15) return v.toFixed(1);
      return String(v);
    }
    return String(v);
  }

  function toSNBT(tag, opts) {
    opts = opts || {};
    const indent = opts.indent ? 2 : 0;
    let depth = 0;
    const nl = indent ? '\n' : '';
    const pad = () => ' '.repeat(indent * depth);
    const padIn = () => ' '.repeat(indent * (depth + 1));

    function stringify(tag) {
      const v = tag.v;
      switch (tag.t) {
        case T.Byte: return numStr(v, false) + 'b';
        case T.Short: return numStr(v, false) + 's';
        case T.Int: return numStr(v, false);
        case T.Long: return String(v) + 'L';
        case T.Float: return numStr(v, true) + 'f';
        case T.Double: return numStr(v, true) + 'd';
        case T.String: return quote(v);
        case T.ByteArray: return '[B; ' + ns.codec.b64ToBytes(v).join(', ') + ']';
        case T.IntArray: return '[I; ' + v.join(', ') + ']';
        case T.LongArray: return '[L; ' + v.map((x) => String(x)).join(', ') + ']';
        case T.List: {
          if (v.length === 0) return '[]';
          depth++;
          const out = v.map((c) => padIn() + stringify(c));
          depth--;
          return '[' + nl + out.join(',' + nl) + nl + pad() + ']';
        }
        case T.Compound: {
          if (v.length === 0) return '{}';
          depth++;
          const out = v.map(([k, c]) => padIn() + safeKey(k) + ': ' + stringify(c));
          depth--;
          return '{' + nl + out.join(',' + nl) + nl + pad() + '}';
        }
        default: return '<' + typeName(tag.t) + '>';
      }
    }
    return stringify(tag);
  }

  function parseSNBT(text) {
    let pos = 0;
    const src = text;

    function error(msg) { throw new Error('SNBT parse error at ' + pos + ': ' + msg); }
    function skipWS() { while (pos < src.length && /\s/.test(src[pos])) pos++; }
    function peek() { return pos < src.length ? src[pos] : ''; }
    function expect(ch) { skipWS(); if (src[pos] !== ch) error("expected '" + ch + "', got '" + peek() + "'"); pos++; }
    function readIdent() {
      let s = '';
      while (pos < src.length && /[A-Za-z0-9._+\-]/.test(src[pos])) s += src[pos++];
      return s;
    }
    function readString() {
      skipWS();
      const q = src[pos];
      if (q === '"' || q === "'") {
        pos++;
        let s = '';
        while (pos < src.length) {
          const c = src[pos++];
          if (c === q) break;
          if (c === '\\') {
            const e = src[pos++];
            if (e === 'n') s += '\n'; else if (e === 'r') s += '\r'; else if (e === 't') s += '\t';
            else if (e === 'b') s += '\b'; else if (e === 'f') s += '\f';
            else if (e === "\\") s += '\\'; else if (e === '"') s += '"';
            else if (e === "'") s += "'"; else s += e;
          } else s += c;
        }
        return s;
      }
      const id = readIdent();
      if (id === '') error('expected string');
      return id;
    }
    function readNumberToken() {
      skipWS();
      let s = '';
      if (peek() === '-' || peek() === '+') s += src[pos++];
      let hasDot = false, hasExp = false;
      while (pos < src.length) {
        const c = src[pos];
        if (/[0-9]/.test(c)) { s += c; pos++; }
        else if (c === '.' && !hasDot && !hasExp) { hasDot = true; s += c; pos++; }
        else if ((c === 'e' || c === 'E') && !hasExp) { hasExp = true; s += c; pos++; if (peek() === '-' || peek() === '+') s += src[pos++]; }
        else break;
      }
      return { s, hasDot };
    }
    function parseElement() {
      skipWS();
      const c = peek();
      if (c === '{') return parseCompound();
      if (c === '[') return parseListOrArray();
      if (c === '"' || c === "'") {
        const tag = ns.createTag(T.String);
        tag.v = readString();
        return tag;
      }
      // number or ident / true/false
      const head = readNumberToken();
      if (head.hasDot || head.s === '' || /^[+-]?\./.test(head.s)) {
        // could be ident like EOF? no
      }
      const rest = readIdent();
      skipWS();
      // larger-than-int number?
      const token = head.s + rest;
      let suffix = 'i';
      const m = token.match(/([bBsSlLfFdD]|\b)$/);
      if (rest) suffix = rest[rest.length - 1].toLowerCase();

      const numStr2 = token.replace(/[bBsSlLfFdD]$/, '');
      if (token === 'true') { const t = ns.createTag(T.Byte); t.v = 1; return t; }
      if (token === 'false') { const t = ns.createTag(T.Byte); t.v = 0; return t; }
      if (token === 'NaN' || token === 'Infinity' || token === '-Infinity') {
        const num = token === 'NaN' ? NaN : token === 'Infinity' ? Infinity : -Infinity;
        if (suffix === 'f') { const t = ns.createTag(T.Float); t.v = num; return t; }
        const t = ns.createTag(T.Double); t.v = num; return t;
      }

      if (head.hasDot || suffix === 'f' || suffix === 'd') {
        const t = ns.createTag(suffix === 'f' ? T.Float : T.Double);
        t.v = parseFloat(numStr2);
        return t;
      }
      switch (suffix) {
        case 'b': { const t = ns.createTag(T.Byte); t.v = parseInt(numStr2, 10); return t; }
        case 's': { const t = ns.createTag(T.Short); t.v = parseInt(numStr2, 10); return t; }
        case 'l': { const t = ns.createTag(T.Long); t.v = BigInt(numStr2.trim()); return t; }
        default: {
          if (/^\d{10,}$/.test(numStr2.trim())) { const t = ns.createTag(T.Long); t.v = BigInt(numStr2.trim()); return t; }
          const t = ns.createTag(T.Int); t.v = parseInt(numStr2, 10); return t;
        }
      }
    }
    function parseCompound() {
      expect('{');
      const tag = ns.createTag(T.Compound);
      skipWS();
      if (peek() === '}') { pos++; return tag; }
      while (true) {
        skipWS();
        const key = readString();
        expect(':');
        const child = parseElement();
        child.n = key;
        tag.v.push([key, child]);
        skipWS();
        const cc = peek();
        if (cc === ',') { pos++; continue; }
        if (cc === '}') { pos++; break; }
        error("expected ',' or '}'");
      }
      return tag;
    }
    function parseListOrArray() {
      expect('[');
      skipWS();
      if (peek() === 'B' && src[pos + 1] === ';') { pos += 2; skipWS(); const arr = readArrInts('b'); return arr; }
      if (peek() === 'I' && src[pos + 1] === ';') { pos += 2; skipWS(); return readArrInts('i'); }
      if (peek() === 'L' && src[pos + 1] === ';') { pos += 2; skipWS(); return readArrLongs(); }

      const tag = ns.createTag(T.List);
      tag.et = T.End;
      skipWS();
      if (peek() === ']') { pos++; return tag; }
      while (true) {
        const child = parseElement();
        tag.v.push(child);
        tag.et = child.t;
        skipWS();
        const cc = peek();
        if (cc === ',') { pos++; continue; }
        if (cc === ']') { pos++; break; }
        error("expected ',' or ']'");
      }
      return tag;

      function readArrInts(kind) {
        const tag = ns.createTag(kind === 'b' ? T.ByteArray : T.IntArray);
        const out = [];
        skipWS();
        if (peek() === ']') { pos++; return tag; }
        while (true) {
          const t = parseElement();
          out.push(t.v);
          skipWS();
          const cc = peek();
          if (cc === ',') { pos++; continue; }
          if (cc === ']') { pos++; break; }
          error("expected ',' or ']'");
        }
        if (kind === 'b') tag.v = ns.codec.bytesToB64(new Uint8Array(out));
        else tag.v = out;
        return tag;
      }
      function readArrLongs() {
        const tag = ns.createTag(T.LongArray);
        const out = [];
        skipWS();
        if (peek() === ']') { pos++; return tag; }
        while (true) {
          const t = parseElement();
          out.push(typeof t.v === 'bigint' ? t.v : BigInt(t.v));
          skipWS();
          const cc = peek();
          if (cc === ',') { pos++; continue; }
          if (cc === ']') { pos++; break; }
          error("expected ',' or ']'");
        }
        tag.v = out;
        return tag;
      }
    }

    skipWS();
    const tag = parseElement();
    skipWS();
    if (pos < src.length) error('unexpected trailing content');
    return tag;
  }

  // ── typed JSON ──────────────────────────────────────────────────────────────

  function toJSON(tag, name) {
    function ser(t, isRoot) {
      const o = { type: typeName(t.t) };
      if (isRoot && t.n) o.name = t.n;
      switch (t.t) {
        case T.Compound: {
          const val = {};
          for (const [k, c] of t.v) val[k] = ser(c, false);
          o.value = val;
          break;
        }
        case T.List: o.value = t.v.map((c) => ser(c, false)); break;
        case T.ByteArray: o.value = t.v; o.length = ns.codec.b64ToBytes(t.v).length; break;
        case T.IntArray: o.value = t.v; o.length = t.v.length; break;
        case T.LongArray: o.value = t.v.map((x) => String(x)); o.length = t.v.length; break;
        case T.Long: o.value = String(t.v); break;
        case T.String: o.value = t.v; break;
        case T.Byte: case T.Short: case T.Int: case T.Float: case T.Double: o.value = t.v; break;
        default: o.value = null; break;
      }
      return o;
    }
    return ser(tag, true);
  }

  function fromJSON(obj) {
    const toNum = (v) => (typeof v === 'number' ? v : parseFloat(v));
    function parse(o) {
      let tag;
      switch (o.type) {
        case 'Compound': tag = ns.createTag(T.Compound);
          for (const k in o.value) { const c = parse(o.value[k]); c.n = k; tag.v.push([k, c]); }
          break;
        case 'List': {
          tag = ns.createTag(T.List);
          tag.et = T.End;
          for (const c of o.value) { const cc = parse(c); tag.v.push(cc); tag.et = cc.t; }
          break;
        }
        case 'ByteArray': tag = ns.createTag(T.ByteArray); tag.v = o.value || ''; break;
        case 'IntArray': tag = ns.createTag(T.IntArray); tag.v = (o.value || []).map(toNum); break;
        case 'LongArray': tag = ns.createTag(T.LongArray); tag.v = (o.value || []).map((x) => BigInt(typeof x === 'bigint' ? x : String(x))); break;
        case 'Byte': tag = ns.createTag(T.Byte); tag.v = toNum(o.value); break;
        case 'Short': tag = ns.createTag(T.Short); tag.v = toNum(o.value); break;
        case 'Int': tag = ns.createTag(T.Int); tag.v = toNum(o.value); break;
        case 'Long': tag = ns.createTag(T.Long); tag.v = BigInt(typeof o.value === 'bigint' ? o.value : (Number.isFinite(o.value) ? String(o.value) : o.value)); break;
        case 'Float': tag = ns.createTag(T.Float); tag.v = toNum(o.value); break;
        case 'Double': tag = ns.createTag(T.Double); tag.v = toNum(o.value); break;
        case 'String': tag = ns.createTag(T.String); tag.v = String(o.value); break;
        default: throw new Error('unknown JSON type: ' + o.type);
      }
      if (o.name) tag.n = o.name;
      return tag;
    }
    const tag = parse(obj);
    return tag;
  }

  ns.toSNBT = toSNBT;
  ns.parseSNBT = parseSNBT;
  ns.toJSON = toJSON;
  ns.fromJSON = fromJSON;

  return ns;
})(window.NBT || {});