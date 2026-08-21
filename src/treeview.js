/* ─────────────────────────────────────────────────────────────────────────────
 * treeview.js — lightweight custom NBT tree widget (no library).
 * Renders from JS model; paths are arrays of keys/indices from the root.
 * ───────────────────────────────────────────────────────────────────────────── */

window.NBT = (function (ns) {
  'use strict';
  const { T, isCompound, isList, childEntries } = ns;
  const t = ns.t, tpl = ns.tpl;

  const SEP = '\u001f';
  function pkey(path) { return path.join(SEP); }
  function pathFromKey(k) { return k === '' ? [] : k.split(SEP); }

  const ICON_ATTR = {
    1: { c: '#7cb7e5', g: 'b1' }, 2: { c: '#7cb7e5', g: 'b2' }, 3: { c: '#7cb7e5', g: 'b4' },
    4: { c: '#7cb7e5', g: 'b8' }, 5: { c: '#8fd1a8', g: 'f4' }, 6: { c: '#8fd1a8', g: 'f8' },
    7: { c: '#d4a7d5', g: '[B]' }, 8: { c: '#c3d38c', g: '""' }, 9: { c: '#f0c674', g: '≡' },
    10: { c: '#f09a73', g: '{}' }, 11: { c: '#d4a7d5', g: '[I]' }, 12: { c: '#d4a7d5', g: '[L]' },
  };

  // Lucide-style SVG icon per NBT tag type.
  const TYPE_ICON = {
    1: 'hash', 2: 'hash', 3: 'hash', 4: 'hash',
    5: 'divide', 6: 'divide',
    7: 'brackets', 11: 'brackets', 12: 'brackets',
    8: 'type', 9: 'list', 10: 'braces',
  };

  function iconSvg(t) {
    const a = ICON_ATTR[t];
    const name = TYPE_ICON[t];
    if (!name || !a) return '<span class="icon" style="color:var(--text-faint)">?</span>';
    return '<span class="icon" style="color:' + a.c + '">' + ns.svgIcon(name, 13) + '</span>';
  }

  function valueText(tag) {
    switch (tag.t) {
      case T.Compound: return '';
      case T.List: return '[' + tag.v.length + ']';
      case T.ByteArray: case T.IntArray: case T.LongArray: return '[' + tag.v.length + ']';
      case T.String: {
        const disp = tag.v.length > 40 ? tag.v.slice(0, 40) + '…' : tag.v;
        return '"' + disp.replace(/\n/g, '␤') + '"';
      }
      case T.Long: return String(tag.v) + 'L';
      case T.Byte: return String(tag.v) + 'b';
      case T.Short: return String(tag.v) + 's';
      case T.Float: return String(tag.v) + 'f';
      case T.Double: return String(tag.v) + 'd';
      default: return String(tag.v);
    }
  }

  function Tree(opts) {
    this.root = opts.root;
    this.opts = opts;
    this.onSelect = opts.onSelect;
    this.onCommit = opts.onCommit;
    this.onMove = opts.onMove;
    this.onContextMenu = opts.onContextMenu;
    this.movable = opts.movable !== false;

    this.openPaths = new Set(opts.openPaths || ['']);
    this.selectedPath = null;
    this.multiSel = new Set();   // extra selected path keys (ctrl+click)
    this.query = '';
    this.searchResults = [];
    this.searchIdx = 0;

    this.el = opts.el;
    this.bindGlobal();
  }

  Tree.prototype.clearMulti = function () {
    this.multiSel.clear();
    this.syncSelection();
  };

  Tree.prototype.multiSelected = function () {
    const out = this.selectedPath ? [pathFromKey(this.selectedPath)] : [];
    for (const k of this.multiSel) out.push(pathFromKey(k));
    return out;
  };

  Tree.prototype.bindGlobal = function () {
    const self = this;
    this.el.addEventListener('click', (e) => {
      const caret = e.target.closest('.caret');
      if (caret) {
        const li = e.target.closest('li');
        const path = pathFromKey(li.dataset.path);
        const key = pkey(path);
        if (this.openPaths.has(key)) this.openPaths.delete(key);
        else this.openPaths.add(key);
        this.refresh();
        e.stopPropagation();
        return;
      }
      const node = e.target.closest('li');
      if (node) {
        const path = pathFromKey(node.dataset.path);
        if (e.ctrlKey || e.metaKey) {
          const key = pkey(path);
          if (this.multiSel.has(key)) this.multiSel.delete(key);
          else this.multiSel.add(key);
          this.syncSelection();
          e.stopPropagation();
          return;
        }
        if (!(e.ctrlKey || e.metaKey) && this.multiSel.size) this.clearMulti();
        this.select(path, true);
        e.stopPropagation();
      }
    });

    this.el.addEventListener('dblclick', (e) => {
      const li = e.target.closest('li');
      if (!li) return;
      const path = pathFromKey(li.dataset.path);
      const tag = this.getAt(path);
      if (tag && !isContainer(tag)) this.beginValueEdit(path, tag);
      else if (tag) this.select(path, true);
    });

    this.el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const li = e.target.closest('li');
      if (li) {
        const path = pathFromKey(li.dataset.path);
        const key = pkey(path);
        if (!this.multiSel.has(key)) this.select(path, false);
        if (this.onContextMenu) this.onContextMenu(path, e.clientX, e.clientY);
      } else if (this.onContextMenu) {
        this.onContextMenu([], e.clientX, e.clientY);
      }
    });
  };

  function isContainer(t) { return isCompound(t) || isList(t); }

  Tree.prototype.select = function (path, notify) {
    this.selectedPath = pkey(path);
    this.syncSelection();
    if (path.length) this.openPaths.add(pkey(path.slice(0, -1)));
    if (notify && this.onSelect) this.onSelect(path);
  };

  Tree.prototype.syncSelection = function () {
    this.el.querySelectorAll('li.selected').forEach((li) => li.classList.remove('selected'));
    const sel = new Set(this.multiSel || []);
    if (this.selectedPath) sel.add(this.selectedPath);
    sel.forEach((key) => {
      const li = this.el.querySelector('li[data-path="' + CSS.escape(key) + '"]');
      if (li) li.classList.add('selected');
    });
  };

  Tree.prototype.getAt = function (path) {
    return ns.getByPath(this.root, path);
  };

  Tree.prototype.matches = function (tag, path, q) {
    if (!q) return false;
    // structured: "/path/glob/**"  or  "@Type"
    if (q[0] === '/') return this.matchPath(tag, path, q);
    if (q[0] === '@') {
      const want = q.slice(1).trim().toLowerCase();
      return ns.typeName(tag.t).toLowerCase() === want ||
        (String(tag.t) === want);
    }
    const key = String(path.length ? path[path.length - 1] : (tag.n || ''));
    const text = (key + ' ' + ns.typeName(tag.t) + ' ' + valueText(tag)).toLowerCase();
    return text.indexOf(q.toLowerCase()) !== -1;
  };

  // Glob over path segments: '*' = one segment, '**' = any number, exact names otherwise.
  Tree.prototype.matchPath = function (tag, path, q) {
    let pat = q.slice(1);
    // trailing slash means "anything below"
    if (pat.endsWith('/')) pat += '**';
    const parts = pat.split('/').filter((s) => s !== '');
    if (parts.length === 0) return true;
    const names = path.map((s) => String(s));
    if (parts[parts.length - 1] === '**') {
      return matchSegments(parts.slice(0, -1), names, true);
    }
    return matchSegments(parts, names, false);
  };

  function matchSegments(pat, names, trailingStar) {
    const plen = pat.length, nlen = names.length;
    // simple non-'**' case
    if (!pat.includes('**')) {
      if (nlen < plen) return false;
      for (let i = 0; i < plen; i++) {
        if (pat[i] !== '*' && pat[i] !== names[i]) return false;
      }
      return trailingStar ? nlen >= plen : nlen === plen;
    }
    // recursive glob with '**'
    const memo = {};
    const go = (pi, ni) => {
      const k = pi + ':' + ni;
      if (memo[k] !== undefined) return memo[k];
      if (pi === plen) return trailingStar ? ni <= nlen : ni === nlen;
      if (pat[pi] === '**') {
        for (let skip = 0; skip <= nlen - ni; skip++) {
          if (go(pi + 1, ni + skip)) return memo[k] = true;
        }
        return memo[k] = false;
      }
      if (ni >= nlen) return memo[k] = false;
      const ok = pat[pi] === '*' || pat[pi] === names[ni];
      return memo[k] = ok ? go(pi + 1, ni + 1) : false;
    };
    return go(0, 0);
  }

  Tree.prototype.applySearch = function (q) {
    this.query = q || '';
    if (!this.query) {
      this.searchResults = [];
      this.searchIdx = 0;
    } else {
      this.searchResults = [];
      const collect = (tag, path) => {
        if (this.matches(tag, path, this.query)) this.searchResults.push(path.concat());
        if (isCompound(tag)) for (const [k, c] of tag.v) { path.push(k); collect(c, path); path.pop(); }
        else if (isList(tag)) for (let i = 0; i < tag.v.length; i++) { path.push(i); collect(tag.v[i], path); path.pop(); }
      };
      collect(this.root, []);
      this.searchIdx = 0;
      if (this.searchResults.length === 0) this.openPaths = new Set(['']);
      else {
        for (const p of this.searchResults) {
          for (let i = 0; i <= p.length; i++) this.openPaths.add(pkey(p.slice(0, i)));
        }
      }
    }
    this.refresh();
    this.focusSearch(this.searchIdx);
  };

  Tree.prototype.focusSearch = function (idx) {
    if (this.searchResults.length === 0) return;
    idx = ((idx % this.searchResults.length) + this.searchResults.length) % this.searchResults.length;
    this.searchIdx = idx;
    const p = this.searchResults[idx];
    this.select(p, true);
    const li = this.el.querySelector('li[data-path="' + CSS.escape(pkey(p)) + '"]');
    if (li) li.scrollIntoView({ block: 'nearest' });
  };

  Tree.prototype.beginNameEdit = function (path, tag) {
    const li = this.el.querySelector('li[data-path="' + CSS.escape(pkey(path)) + '"]');
    const nameSpan = li && li.querySelector('.entry-name');
    if (!nameSpan) return;

    const input = document.createElement('input');
    input.className = 'name-input';
    input.value = path.length ? String(path[path.length - 1]) : (tag.n || '');
    nameSpan.replaceWith(input);
    input.focus();
    input.select();

    const self = this;
    const commit = () => {
      const newName = input.value;
      if (self.opts.onRename) self.opts.onRename(tag, path, newName);
      self.refresh();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit();
      else if (e.key === 'Escape') self.refresh();
      e.stopPropagation();
    });
    input.addEventListener('blur', commit);
    input.addEventListener('click', (e) => e.stopPropagation());
  };

  Tree.prototype.beginValueEdit = function (path, tag) {
    const li = this.el.querySelector('li[data-path="' + CSS.escape(pkey(path)) + '"]');
    const chip = li && li.querySelector('.entry-val');
    if (!chip) return;

    const input = document.createElement('input');
    input.className = 'name-input';
    input.style.width = Math.min(260, Math.max(90, chip.textContent.length * 7)) + 'px';
    input.value = this.inputValueFor(tag);
    chip.replaceWith(input);
    input.focus();
    input.select();

    const self = this;
    const commit = () => {
      const parsed = self.parseInput(tag, input.value);
      if (parsed !== undefined && parsed !== tag.v) {
        tag.v = parsed;
        if (self.onCommit) self.onCommit(tag);
      }
      self.refresh();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit();
      else if (e.key === 'Escape') self.refresh();
      e.stopPropagation();
    });
    input.addEventListener('blur', commit);
    input.addEventListener('click', (e) => e.stopPropagation());
  };

  Tree.prototype.inputValueFor = function (tag) {
    switch (tag.t) {
      case T.Float: case T.Double: case T.Byte: case T.Short: case T.Int: return String(tag.v);
      case T.Long: return String(tag.v);
      case T.String: return tag.v;
      default: return '';
    }
  };

  Tree.prototype.parseInput = function (tag, raw) {
    switch (tag.t) {
      case T.Byte: { const n = parseInt(raw, 10); return isNaN(n) ? undefined : (n & 0xff) << 24 >> 24; }
      case T.Short: { const n = parseInt(raw, 10); return isNaN(n) ? undefined : (n & 0xffff) << 16 >> 16; }
      case T.Int: { const n = parseInt(raw, 10); return isNaN(n) ? undefined : n | 0; }
      case T.Long: { const t = raw.trim(); if (!/^[+-]?\d+$/.test(t)) return undefined; try { return BigInt(t); } catch (e) { return undefined; } }
      case T.Float: { const n = parseFloat(raw); return isNaN(n) ? undefined : n; }
      case T.Double: { const n = parseFloat(raw); return isNaN(n) ? undefined : n; }
      case T.String: return raw;
      default: return undefined;
    }
  };

  // ── rendering ───────────────────────────────────────────────────────────────

  Tree.prototype.refresh = function () {
    this.el.textContent = '';
    this.el.appendChild(this.buildNode(this.root, [], true));
    this.syncSelection();
  };

  Tree.prototype.buildNode = function (tag, path, isRoot) {
    const li = document.createElement('li');
    li.dataset.path = pkey(path);
    if (this.selectedPath === pkey(path)) li.classList.add('selected');
    if (this.matches(tag, path, this.query)) li.classList.add('match');
    li.draggable = this.movable && !isRoot;

    const node = document.createElement('div');
    node.className = 'node';

    const container = isContainer(tag);
    const open = this.openPaths.has(pkey(path));

    const caret = document.createElement('span');
    caret.className = 'caret' + (open ? ' open' : '') + (container ? '' : ' leaf');
    caret.textContent = container ? '▶' : ' ';
    node.appendChild(caret);

    node.insertAdjacentHTML('beforeend', iconSvg(tag.t));

    const name = document.createElement('span');
    name.className = 'entry-name';
    if (isRoot) {
      name.textContent = tag.n || t('tree.unnamed');
      if (!tag.n) name.classList.add('unnamed');
    } else {
      name.textContent = String(path[path.length - 1]);
    }
    node.appendChild(name);

    if (!container) {
      const val = document.createElement('span');
      val.className = 'entry-val ' + (tag.t === T.String ? 'str' : 'mono');
      val.textContent = valueText(tag);
      node.appendChild(val);
    } else {
      const cntEl = document.createElement('span');
      cntEl.className = 'badge';
      cntEl.textContent = isCompound(tag) ? tpl('tree.badge.tags', tag.v.length) : tpl('tree.badge.items', tag.v.length);
      node.appendChild(cntEl);
    }

    li.appendChild(node);

    if (container && open) {
      const ul = document.createElement('ul');
      ul.className = 'tree';
      const entries = childEntries(tag);
      for (const entry of entries) {
        ul.appendChild(this.buildNode(entry.tag, path.concat([entry.key]), false));
      }
      if (entries.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'leaf-empty';
        empty.textContent = t('tree.empty');
        ul.appendChild(empty);
      }
      li.appendChild(ul);
    }

    this.attachDrag(li, node, path, container);
    return li;
  };

  Tree.prototype.attachDrag = function (li, node, path, container) {
    const self = this;
    li.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', pkey(path));
      // cross-tab/--window payload: full tag JSON
      try {
        const tag = this.getAt(path);
        e.dataTransfer.setData('application/x-webnbt-tag', JSON.stringify(tag));
      } catch (err) { /* ignore */ }
      e.dataTransfer.effectAllowed = 'move';
      self._dragPath = path;
    });
    li.addEventListener('dragover', (e) => {
      if (!self._dragPath) return;
      const fp = pkey(self._dragPath);
      const dp = pkey(path);
      if (dp === fp || dp.startsWith(fp + SEP)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'none';
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = node.getBoundingClientRect();
      const h = rect.height;
      const r = h / 3;
      li.classList.remove('drop-top', 'drop-mid', 'drop-bottom');
      if (e.clientY < rect.top + r) li.classList.add('drop-top');
      else if (e.clientY > rect.bottom - r) li.classList.add('drop-bottom');
      else if (container) li.classList.add('drop-mid');
      else li.classList.add(e.clientY < rect.top + h / 2 ? 'drop-top' : 'drop-bottom');
    });
    li.addEventListener('dragleave', () => {
      li.classList.remove('drop-top', 'drop-mid', 'drop-bottom');
    });
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      li.classList.remove('drop-top', 'drop-mid', 'drop-bottom');
      const fromPath = self._dragPath;
      self._dragPath = null;
      if (!fromPath) {
        // external (cross-window) tag drop?
        const ext = e.dataTransfer && e.dataTransfer.getData('application/x-webnbt-tag');
        if (ext && self.opts.onExternalDrop) {
          try {
            const tag = JSON.parse(ext);
            self.opts.onExternalDrop(tag, path, container);
          } catch (err) { /* ignore */ }
        }
        return;
      }
      const dest = path;
      const zone = (() => {
        const rect = node.getBoundingClientRect();
        const r = rect.height / 3;
        if (e.clientY < rect.top + r) return 'top';
        if (e.clientY > rect.bottom - r) return container ? 'mid' : 'bottom';
        return container ? 'mid' : (e.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom');
      })();
      if (self.onMove) self.onMove({
        fromPath, destPath: dest, zone,
        destIsContainer: container,
      });
    });
  };

  ns.Tree = Tree;
  ns.valueText = valueText;
  ns.iconSvg = iconSvg;

  return ns;
})(window.NBT || {});