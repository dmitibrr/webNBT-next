/* ─────────────────────────────────────────────────────────────────────────────
 * inspector.js — side panel: edit values, arrays, smart structure cards.
 * Mutations go through api.commit(tag) so the app can push history + refresh.
 * ───────────────────────────────────────────────────────────────────────────── */

window.NBT = (function (ns) {
  'use strict';
  const { T, typeName, isCompound, isList } = ns;
  const t = ns.t, tpl = ns.tpl;

  const IA_TYPES = [T.ByteArray, T.IntArray, T.LongArray];

  function Inspector(api) {
    this.api = api;
    this.el = api.el;
    this.cur = null; // { tag, path }
  }

  function el(tagName, cls, text) {
    const n = document.createElement(tagName);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function field(label) {
    const f = el('div', 'field');
    f.appendChild(el('label', null, label));
    return f;
  }

  Inspector.prototype.render = function (tag, path) {
    this.cur = { tag, path };
    const box = this.el;
    box.textContent = '';

    const api = this.api;

    // header
    const h = el('div', 'insp');
    const h2 = el('h2');
    h2.appendChild(el('span', 'type-chip', typeName(tag.t)));
    h2.appendChild(el('span', null, tag.n || nameFromPath(path)));
    // rename button for any tag
    if (!(path.length === 0)) {
      const rn = el('button', null, t('insp.rename'));
      rn.onclick = () => api.renameTag(path);
      h2.appendChild(rn);
    }
    h.appendChild(h2);
    h.appendChild(this.renderBreadcrumb(path));

    // smart card
    if (api.smartEnabled && !path.length === false) {
      const smart = ns.mcdata.smartFor(tag, path);
      if (smart) h.appendChild(this.renderSmart(smart));
    }

    // value editors
    switch (tag.t) {
      case T.Byte: case T.Short: case T.Int: case T.Long: case T.Float: case T.Double:
        h.appendChild(this.renderNumber(tag));
        break;
      case T.String:
        h.appendChild(this.renderString(tag));
        break;
      case T.IntArray: case T.LongArray:
        h.appendChild(this.renderArray(tag));
        break;
      case T.ByteArray:
        h.appendChild(this.renderByteArray(tag));
        break;
      case T.List:
        h.appendChild(this.renderList(tag));
        break;
      case T.Compound:
        h.appendChild(this.renderCompound(tag));
        break;
      default: break;
    }

    // common actions
    const acts = el('div', 'actions');
    const addTypeBtn = el('button', null, t('insp.newTag'));
    addTypeBtn.onclick = () => api.addTag(path);
    acts.appendChild(addTypeBtn);
    const dupBtn = el('button', null, t('insp.duplicate'));
    dupBtn.onclick = () => api.duplicate(tag, path);
    acts.appendChild(dupBtn);
    if (path.length > 0) {
      const delBtn = el('button', null, t('insp.delete'));
      delBtn.className = 'danger';
      delBtn.onclick = () => api.deleteTag(tag, path);
      acts.appendChild(delBtn);
    }
    // always offer change type
    const ctBtn = el('button', null, t('insp.changeType'));
    ctBtn.onclick = () => api.changeType(tag, path);
    acts.appendChild(ctBtn);
    const expBtn = el('button', null, t('insp.exportSNBT'));
    expBtn.onclick = () => api.exportSNBT(tag, path);
    acts.appendChild(expBtn);
    const snbtBtn = el('button', null, 'SNBT');
    snbtBtn.className = this._snbtOpen ? 'active' : '';
    snbtBtn.onclick = () => {
      this._snbtOpen = !this._snbtOpen;
      this.render(tag, path);
    };
    acts.appendChild(snbtBtn);

    h.appendChild(acts);

    // SNBT preview (feature: live preview)
    if (this._snbtOpen) {
      try {
        const text = ns.toSNBT(tag, { indent: true });
        const pre = el('pre', 'snbt-preview', text);
        h.appendChild(pre);
      } catch (e) {
        h.appendChild(el('div', 'snbt-preview err', String(e)));
      }
    }

    box.appendChild(h);
  };

  function nameFromPath(path) {
    return path.length ? String(path[path.length - 1]) : t('insp.root');
  }

  // clickable breadcrumb path (feature: breadcrumb)
  Inspector.prototype.renderBreadcrumb = function (path) {
    const crumb = el('div', 'crumb');
    const root = el('button', 'crumb-seg', t('insp.root'));
    root.onclick = () => this.api.selectPath && this.api.selectPath([]);
    crumb.appendChild(root);
    for (let i = 0; i < path.length; i++) {
      const sep = el('span', 'crumb-sep', '/');
      crumb.appendChild(sep);
      const seg = el('button', 'crumb-seg' + (i === path.length - 1 ? ' last' : ''), String(path[i]));
      seg.onclick = () => this.api.selectPath && this.api.selectPath(path.slice(0, i + 1));
      crumb.appendChild(seg);
    }
    return crumb;
  };

  // ── scalar editors ──────────────────────────────────────────────────────────

  Inspector.prototype.renderNumber = function (tag) {
    const wrap = document.createElement('section');

    const f = field(t('field.value'));
    const input = el('input', 'in');
    input.value = String(tag.v);
    input.spellcheck = false;

    const commit = () => {
      const parsed = ns.Tree && treeParse(tag, input.value);
      if (parsed !== undefined && Number(parsed) !== Number(tag.v)) {
        tag.v = parsed;
        api.commit(tag);
        this.render(tag, this.cur.path);
      }
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); });
    input.addEventListener('blur', commit);
    f.appendChild(input);

    const chips = el('div', 'chips');
    switch (tag.t) {
      case T.Byte: {
        const b = Number(tag.v) & 0xff;
        chips.appendChild(chip(t('chip.unsigned'), b));
        chips.appendChild(chip(t('chip.hex'), '0x' + b.toString(16).padStart(2, '0')));
        chips.appendChild(chip(t('chip.char'), b >= 32 && b < 127 ? String.fromCharCode(b) : '·'));
        if (b === 0 || b === 1) {
          const set = (v) => () => { tag.v = v; api.commit(tag); this.render(tag, this.cur.path); };
          const b1 = el('button', 'chip', t('chip.false'));
          b1.onclick = set(0);
          const b2 = el('button', 'chip', t('chip.true'));
          b2.onclick = set(1);
          chips.appendChild(b1); chips.appendChild(b2);
        }
        break;
      }
      case T.Short: {
        const s = Number(tag.v) & 0xffff;
        chips.appendChild(chip(t('chip.unsigned'), s));
        chips.appendChild(chip(t('chip.hex'), '0x' + s.toString(16).padStart(4, '0')));
        break;
      }
      case T.Int: {
        const u = Number(tag.v) >>> 0;
        chips.appendChild(chip(t('chip.unsigned'), u));
        chips.appendChild(chip(t('chip.hex'), '0x' + (Number(tag.v) >>> 0).toString(16)));
        break;
      }
      case T.Long: {
        chips.appendChild(chip(t('chip.hex'), '0x' + (BigInt(tag.v) & 0xffffffffffffffffn).toString(16)));
        chips.appendChild(chip(t('chip.unsigned'), String(BigInt(tag.v) & 0xffffffffffffffffn)));
        break;
      }
      case T.Float: case T.Double:
        chips.appendChild(chip(t('chip.exact'), String(tag.v)));
        break;
      default: break;
    }
    f.appendChild(chips);

    // Minecraft-specific value validation (ranges, coords, palette etc.)
    const warns = ns.mcdata && ns.mcdata.validateValue && ns.mcdata.validateValue(tag, this.cur.path);
    if (warns && warns.length) {
      const notice = el('div', 'notice warn');
      notice.textContent = warns.join(' · ');
      wrap.appendChild(notice);
    }

    wrap.appendChild(f);
    return wrap;
  };

  function treeParse(tag, raw) {
    switch (tag.t) {
      case T.Byte: { const n = parseInt(raw, 10); return isNaN(n) ? undefined : (n & 0xff) << 24 >> 24; }
      case T.Short: { const n = parseInt(raw, 10); return isNaN(n) ? undefined : (n & 0xffff) << 16 >> 16; }
      case T.Int: { const n = parseInt(raw, 10); return isNaN(n) ? undefined : n | 0; }
      case T.Long: { const t = raw.trim(); if (!/^[+-]?\d+$/.test(t)) return undefined; try { return BigInt(t); } catch (e) { return undefined; } }
      case T.Float: { const n = parseFloat(raw); return isNaN(n) ? undefined : n; }
      case T.Double: { const n = parseFloat(raw); return isNaN(n) ? undefined : n; }
      default: return undefined;
    }
  }

  Inspector.prototype.renderString = function (tag) {
    const wrap = document.createElement('section');
    const f = field(t('field.string'));
    const ta = el('textarea', 'in');
    ta.value = tag.v;
    ta.spellcheck = false;
    const size = el('div', 'chip', t('str.length', tag.v.length, nc(tag.v)));
    const commit = () => { if (ta.value !== tag.v) { tag.v = ta.value; api.commit(tag); } };
    ta.addEventListener('change', commit);
    f.appendChild(ta);
    f.appendChild(size);

    // JSON pretty preview if it parses
    try {
      const parsed = JSON.parse(tag.v);
      const pretty = JSON.stringify(parsed, null, 2);
      const jbtn = el('button', 'chip', t('str.prettyJson'));
      jbtn.onclick = () => { ta.value = pretty; commit(); };
      f.appendChild(jbtn);
    } catch (e) { /* not JSON */ }
    wrap.appendChild(f);
    return wrap;

    function nc(s) { return new TextEncoder().encode(s).length + ' bytes'; }
  };

  // ── array editors ───────────────────────────────────────────────────────────

  Inspector.prototype.renderArray = function (tag) {
    const wrap = document.createElement('section');
    const title = el('div', 'section-title', tag.t === T.IntArray ? t('array.intTitle', tag.v.length) : t('array.longTitle', tag.v.length));
    wrap.appendChild(title);

    const table = el('table', 'array-table');
    const addRow = () => {
      tag.v.push(tag.t === T.LongArray ? 0n : 0);
      api.commit(tag);
      this.render(tag, this.cur.path);
    };
    const delRow = (i) => {
      tag.v.splice(i, 1);
      api.commit(tag);
      this.render(tag, this.cur.path);
    };
    const saveRow = (i) => {
      const inp = table.rows[i + 1].querySelector('input');
      const parsed = tag.t === T.LongArray ? parseLong(inp.value) : parseInt(inp.value, 10);
      if (parsed !== undefined && !(parsed === tag.v[i])) {
        tag.v[i] = parsed;
        api.commit(tag);
      }
    };

    tag.v.forEach((val, i) => {
      const tr = el('tr');
      tr.appendChild(el('td', 'idx', String(i)));
      const td = el('td');
      const inp = el('input');
      inp.value = String(val);
      inp.dataset.idx = i;
      inp.addEventListener('change', () => saveRow(i));
      td.appendChild(inp);
      tr.appendChild(td);
      const del = el('button', 'row-del', '✕');
      del.onclick = () => delRow(i);
      const tdd = el('td'); tdd.appendChild(del);
      tr.appendChild(tdd);
      table.appendChild(tr);
    });
    wrap.appendChild(table);
    const add = el('button', null, t('array.addRow'));
    add.onclick = addRow;
    wrap.appendChild(add);
    return wrap;

    function parseLong(s) {
      const t = String(s).trim();
      if (!/^[+-]?\d+$/.test(t)) return undefined;
      try { return BigInt(t); } catch (e) { return undefined; }
    }
  };

  Inspector.prototype.renderByteArray = function (tag) {
    const wrap = document.createElement('section');
    const bytes = ns.codec.b64ToBytes(tag.v);
    wrap.appendChild(el('div', 'section-title', t('array.byteTitle', bytes.length)));

    const preview = el('div', 'hex-mini', hexRows(bytes));
    wrap.appendChild(preview);

    // image sniff
    const imgDetect = detectImage(bytes);
    if (imgDetect) {
      const img = el('img', 'preview-img');
      img.src = imgDetect;
      const inners = imgDetect; // data url
      void inners;
      wrap.appendChild(img);
    }

    const f = field(t('field.replaceBytes'));
    const ta = el('textarea', 'in');
    ta.value = toHexWords(bytes);
    const commit = () => {
      const nb = parseByteList(ta.value);
      if (nb !== null) {
        tag.v = ns.codec.bytesToB64(nb);
        api.commit(tag);
        this.render(tag, this.cur.path);
      }
    };
    ta.addEventListener('change', commit);
    f.appendChild(ta);
    wrap.appendChild(f);
    return wrap;
  };

  function hexRows(bytes, perRow) {
    perRow = perRow || 16;
    let out = '';
    for (let i = 0; i < bytes.length; i += perRow) {
      out += i.toString(16).padStart(6, '0') + '  ';
      for (let j = i; j < i + perRow && j < bytes.length; j++) {
        out += bytes[j].toString(16).padStart(2, '0') + ' ';
      }
      out += '  ';
      for (let j = i; j < i + perRow && j < bytes.length; j++) {
        out += (bytes[j] >= 32 && bytes[j] < 127) ? String.fromCharCode(bytes[j]) : '.';
      }
      out += '\n';
    }
    return out === '' ? t('hex.empty') : out;
  }

  function toHexWords(bytes) {
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join(' ');
  }

  function parseByteList(text) {
    const words = text.trim().split(/[\s,;_]+/).filter(Boolean);
    if (words.length === 0) return null;
    const out = new Uint8Array(words.length);
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const n = /^0x/i.test(w) ? parseInt(w, 16) : parseInt(w, 10);
      if (isNaN(n) || n < 0 || n > 255) return null;
      out[i] = n;
    }
    return out;
  }

  function detectImage(bytes) {
    const isPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const isJpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (!isPng && !isJpeg) return null;
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return 'data:image/' + (isPng ? 'png' : 'jpeg') + ';base64,' + btoa(bin);
  }

  // ── list & compound ─────────────────────────────────────────────────────────

  Inspector.prototype.renderList = function (tag) {
    const wrap = document.createElement('section');
    wrap.appendChild(el('div', 'section-title', t('list.title', typeName(tag.et), tag.v.length)));

    const f = field(t('list.entryType'));
    const sel = el('select', 'in');
    for (const t of [1, 2, 3, 4, 5, 6, 8, 10]) {
      const o = document.createElement('option');
      o.value = t; o.textContent = typeName(t);
      if (t === tag.et) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => {
      if (tag.allowedLong) { /* noop */ }
      // warn when changing entry type on non-empty list
      if (tag.v.length > 0) { tag.v = []; }
      tag.et = parseInt(sel.value, 10);
      api.commit(tag);
    });
    f.appendChild(sel);
    wrap.appendChild(f);

    const add = el('button', null, t('list.add', typeName(tag.et)));
    add.onclick = () => {
      const child = ns.createTag(tag.et, '');
      tag.v.push(child);
      api.commit(tag);
    };
    wrap.appendChild(add);
    return wrap;
  };

  Inspector.prototype.renderCompound = function (tag) {
    const wrap = document.createElement('section');
    wrap.appendChild(el('div', 'section-title', tpl('compound.title', tag.v.length)));
    const add = el('button', null, t('compound.add'));
    add.onclick = () => this.api.addTag(this.cur.path);
    wrap.appendChild(add);
    return wrap;
  };

  // ── smart cards ─────────────────────────────────────────────────────────────

  Inspector.prototype.renderSmart = function (smart) {
    const card = el('div', 'smart-card');
    const head = el('div', 'sc-head');
    head.appendChild(el('span', 'big', smart.title));
    card.appendChild(head);

    if (smart.kv) {
      const grid = el('div', 'sc-grid');
      for (const k in smart.kv) {
        const kv = el('div', 'sc-kv');
        kv.appendChild(el('b', null, k));
        kv.appendChild(el('span', null, String(smart.kv[k])));
        grid.appendChild(kv);
      }
      card.appendChild(grid);
    }

    if (smart.inventory) this.renderInventory(card, smart.inventory, t('smart.items'));
    if (smart.items) this.renderInventory(card, smart.items, t('smart.inventory'));
    if (smart.kind === 'itemStack' && smart.item) {
      const inv = el('div', 'smart-inv');
      inv.appendChild(this.itemRow(smart.item));
      card.appendChild(inv);
    }
    return card;
  };

  Inspector.prototype.renderInventory = function (card, items, title) {
    const inv = el('div', 'smart-inv');
    inv.appendChild(el('div', 'section-title', title));
    for (const it of items) inv.appendChild(this.itemRow(it));
    card.appendChild(inv);
  };

  Inspector.prototype.itemRow = function (it) {
    const row = el('div', 'slot');
    const cnt = el('span', 'count', it.count !== undefined ? 'x' + it.count : '');
    row.appendChild(cnt);
    row.appendChild(el('span', 'name', it.displayName));
    const extra = el('span', 'extra', String(it.id));
    row.appendChild(extra);
    return row;
  };

  function chip(label, value) {
    const c = el('span', 'chip');
    c.appendChild(el('b', null, label));
    c.appendChild(document.createTextNode(': ' + value));
    return c;
  }

  ns.Inspector = Inspector;
  ns.arrayTypeIs = (t) => IA_TYPES.includes(t);
  ns.detectImage = detectImage;
  ns.hexRows = hexRows;
  ns.parseByteList = parseByteList;

  return ns;
})(window.NBT || {});