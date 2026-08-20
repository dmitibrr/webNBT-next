/* ─────────────────────────────────────────────────────────────────────────────
 * model.js — in-browser NBT model.
 *
 * A tag is a plain object:
 *   { t: tagType, n: name|null, v: value, et?: entryType }
 *   Compound  → v: [ [key, childTag], ... ]   (order preserved)
 *   List      → et: entry type, v: [ childTag, ... ]
 *   ByteArray → v: base64 string
 *   IntArray  → v: number[]
 *   LongArray → v: bigint[]
 *   Long      → v: bigint
 *   others    → v: number | string
 * ───────────────────────────────────────────────────────────────────────────── */

window.NBT = (function (ns) {
  'use strict';

  const T = {
    End: 0, Byte: 1, Short: 2, Int: 3, Long: 4, Float: 5, Double: 6,
    ByteArray: 7, String: 8, List: 9, Compound: 10, IntArray: 11, LongArray: 12,
  };

  const TYPE_NAMES = {
    0: 'End', 1: 'Byte', 2: 'Short', 3: 'Int', 4: 'Long', 5: 'Float', 6: 'Double',
    7: 'ByteArray', 8: 'String', 9: 'List', 10: 'Compound', 11: 'IntArray', 12: 'LongArray',
  };

  function typeName(t) {
    if (ns.I18N && ns.I18N.localizeTypes) {
      const loc = ns.t('type.' + t);
      if (loc && loc.indexOf('type.') !== 0) return loc;
    }
    return TYPE_NAMES[t] || ('Tag#' + t);
  }

  const ARRAY_TYPES = { 7: true, 11: true, 12: true };
  const NUMERIC = { 1: true, 2: true, 3: true, 4: true, 5: true, 6: true };

  function isCompound(tag) { return tag && tag.t === T.Compound; }
  function isList(tag) { return tag && tag.t === T.List; }
  function isContainer(tag) { return isCompound(tag) || isList(tag); }

  // Fresh, empty tag of a type.
  function createTag(type, name) {
    const t = { t: type, n: name || '' };
    switch (type) {
      case T.Byte: case T.Short: case T.Int: t.v = 0; break;
      case T.Long: t.v = 0n; break;
      case T.Float: case T.Double: t.v = 0; break;
      case T.String: t.v = ''; break;
      case T.ByteArray: t.v = ''; break;         // empty base64
      case T.IntArray: t.v = []; break;
      case T.LongArray: t.v = []; break;
      case T.List: t.et = T.End; t.v = []; break;
      case T.Compound: t.v = []; break;
      default: t.v = null; break;
    }
    return t;
  }

  // Deep clone; bigint-safe (structuredClone rejects BigInt in some engines).
  function clone(v) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(clone);
    const o = {};
    for (const k in v) o[k] = clone(v[k]);
    return o;
  }

  // Walk every tag (pre-order). cb(tag, pathChain).
  function walk(tag, cb, chain) {
    chain = chain || [];
    cb(tag, chain);
    if (isCompound(tag)) {
      for (const [k, child] of tag.v) { chain.push(k); walk(child, cb, chain); chain.pop(); }
    } else if (isList(tag)) {
      for (let i = 0; i < tag.v.length; i++) { chain.push(i); walk(tag.v[i], cb, chain); chain.pop(); }
    }
  }

  function countTags(tag) { let n = 0; walk(tag, () => n++); return n; }

  function byteSizeOfModel(tag) {
    // approximate: 1..12 per boundary + payload
    // precise size needs encoding; cheap heuristic used for status line only.
    let n = 0;
    walk(tag, (t) => {
      n += 4;
      if (typeof t.n === 'string') n += 2 + t.n.length;
      switch (t.t) {
        case T.Byte: n += 1; break;
        case T.Short: n += 2; break;
        case T.Int: case T.Float: n += 4; break;
        case T.Long: case T.Double: n += 8; break;
        case T.String: n += 2 + t.v.length; break;
        default: break;
      }
    });
    return n;
  }

  // ── container helpers ───────────────────────────────────────────────────────

  // Path: array of keys/indices from root tag to the target (exclusive of root).
  function getByPath(root, path) {
    let cur = root;
    for (const seg of path) {
      if (isCompound(cur)) cur = cur.v.find(([k]) => k === seg)?.[1];
      else if (isList(cur)) cur = cur.v[seg];
      if (!cur) return null;
    }
    return cur;
  }

  // Locate a tag inside the model by object reference; returns { parent, key?, index? }
  function locate(root, target) {
    if (root === target) return { parent: null, key: null, index: null };
    if (isCompound(root)) {
      for (let i = 0; i < root.v.length; i++) {
        const [k, child] = root.v[i];
        if (child === target) return { parent: root, key: k, index: i };
        const r = locate(child, target);
        if (r.parent) return r;
      }
    } else if (isList(root)) {
      for (let i = 0; i < root.v.length; i++) {
        if (root.v[i] === target) return { parent: root, key: null, index: i };
        const r = locate(root.v[i], target);
        if (r.parent) return r;
      }
    }
    return { parent: null, key: null, index: null };
  }

  // list of {key: string, tag} — the tree layer renders from this path
  function childEntries(tag) {
    if (isCompound(tag)) return tag.v.map(([k, child]) => ({ key: k, tag: child }));
    if (isList(tag)) return tag.v.map((child, i) => ({ key: String(i), tag: child }));
    return [];
  }

  // Structural diff between two models.
  // Returns [{ path, kind: 'same'|'add'|'remove'|'change', a?, b? }].
  // A leaf value compare is "different" when JSON differs.
  function diff(a, b) {
    const out = [];
    const seen = new Set();

    function leafVal(tag) {
      if (!tag) return undefined;
      if (tag.t === T.ByteArray) return tag.v;
      if (tag.t === T.Long) return String(tag.v);
      if (Array.isArray(tag.v)) return tag.v.map((x) => typeof x === 'bigint' ? String(x) : x);
      return tag.v;
    }

    function isLeaf(tag) { return !isContainer(tag); }

    function walkPair(pa, pb, path) {
      const pk = path.join('\u001f');
      const aLeaf = pa && isLeaf(pa), bLeaf = pb && isLeaf(pb);
      if (aLeaf || bLeaf) {
        const la = leafVal(pa), lb = leafVal(pb);
        if (pa && pb && aLeaf && bLeaf) {
          const same = JSON.stringify(la) === JSON.stringify(lb);
          if (!same) out.push({ path: path.slice(), kind: 'change', a: pa, b: pb });
          else out.push({ path: path.slice(), kind: 'same', a: pa, b: pb });
        } else if (pa && !pb) out.push({ path: path.slice(), kind: 'remove', a: pa });
        else if (!pa && pb) out.push({ path: path.slice(), kind: 'add', b: pb });
        return;
      }
      // both containers (or one missing)
      if (!pa && pb) { out.push({ path: path.slice(), kind: 'add', b: pb }); return; }
      if (pa && !pb) { out.push({ path: path.slice(), kind: 'remove', a: pa }); return; }
      // container type mismatch
      if (pa.t !== pb.t) { out.push({ path: path.slice(), kind: 'change', a: pa, b: pb }); return; }

      const ea = childEntries(pa), eb = childEntries(pb);
      const keys = new Set([...ea.map((e) => e.key), ...eb.map((e) => e.key)]);
      for (const k of keys) {
        const ca = ea.find((e) => e.key === k);
        const cb = eb.find((e) => e.key === k);
        walkPair(ca && ca.tag, cb && cb.tag, path.concat([k]));
      }
    }

    walkPair(a, b, []);
    return out;
  }

  ns.diff = diff;

  ns.T = T;
  ns.typeName = typeName;
  ns.isCompound = isCompound;
  ns.isList = isList;
  ns.isContainer = isContainer;
  ns.createTag = createTag;
  ns.clone = clone;
  ns.walk = walk;
  ns.countTags = countTags;
  ns.byteSize = byteSizeOfModel;
  ns.getByPath = getByPath;
  ns.locate = locate;
  ns.childEntries = childEntries;

  return ns;
})(window.NBT || {});