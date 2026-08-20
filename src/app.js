/* ─────────────────────────────────────────────────────────────────────────────
 * app.js — application shell: documents, history, toolbar, menus, region.
 * ───────────────────────────────────────────────────────────────────────────── */

window.App = (function (ns) {
  'use strict';
  const { T, isCompound, isList, clone } = ns;
  const t = ns.t, tpl = ns.tpl;

  const A = {
    doc: null,          // { kind:'nbt'|'chunk', filename, model, mode, region?, x?, z?, compression? }
    region: null,       // { container, filename } for open region documents
    hist: [], future: [],
    clipboard: null,
    selectedPath: null,
    hexOn: true, smartOn: true, theme: 'dark',
    inspector: null, tree: null,
  };

  // ── dom ─────────────────────────────────────────────────────────────────────

  let $ = (s) => document.querySelector(s);
  let refs = {};

  function grab() {
    refs = {
      tree: $('#tree'), inspector: $('#inspector'),
      hex: $('#hexview'), status: {
        file: $('#st-file'), mode: $('#st-mode'), count: $('#st-count'),
        errors: $('#st-errors'), history: $('#st-history'),
      },
      shade: $('#loading-shade'), loading: $('#loading-text'),
      empty: $('#empty-state'), file: $('#file-input'), drop: $('#drop-zone'),
      search: $('#search-field'),
    };
  }

  // ── history ─────────────────────────────────────────────────────────────────

  function pushHistory() {
    if (!A.doc || A.doc.kind !== 'nbt' && A.doc.kind !== 'chunk') return;
    A.hist.push(clone(A.doc.model));
    if (A.hist.length > 200) A.hist.shift();
    A.future.length = 0;
    A.refreshHistory();
  }

  function undo() {
    if (!A.hist.length) return;
    A.future.push(clone(A.doc.model));
    A.doc.model = A.hist.pop();
    A.refreshAll();
  }

  function redo() {
    if (!A.future.length) return;
    A.hist.push(clone(A.doc.model));
    A.doc.model = A.future.pop();
    A.refreshAll();
  }

  // ── tree wiring ─────────────────────────────────────────────────────────────

  function makeTree() {
    A.tree = new ns.Tree({
      el: refs.tree,
      root: A.doc ? A.doc.model : null,
      movable: true,
      onSelect: (path) => {
        A.selectedPath = path;
        renderInspector();
      },
      onCommit: (tag) => { commitEdit(); },
      onRename: (tag, path, newName) => { commitRename(tag, path, newName); },
      onMove: (info) => { moveTag(info); },
      onContextMenu: (path, x, y) => { showContextMenu(path, x, y); },
    });
    renderInspector();
  }

  function commitEdit() {
    pushHistory();
    A.refreshAll();
  }

  function commitRename(tag, path, newName) {
    if (!A.doc) return;
    pushHistory();
    if (path.length === 0) {
      tag.n = newName;
    } else {
      const parent = ns.getByPath(A.doc.model, path.slice(0, -1));
      const key = path[path.length - 1];
      if (isCompound(parent)) {
        const pair = parent.v.find(([k]) => k === key);
        if (pair) { pair[0] = newName; tag.n = newName; }
      } else if (isList(parent)) {
        tag.n = newName; // list children have no key; name is informational
      }
    }
    A.refreshAll();
  }

  // ── refresh ─────────────────────────────────────────────────────────────────

  function refreshAll() {
    if (A.doc && (A.doc.kind === 'nbt' || A.doc.kind === 'chunk')) {
      A.tree.root = A.doc.model;
      refs.tree.classList.remove('hidden');
      A.refreshTree();
      renderInspector();
      updateHex();
      A.refreshStatus();
      A.refreshButtons();
    } else if (A.doc && A.doc.kind === 'region') {
      refs.tree.classList.add('hidden');
      renderRegionGrid();
    }
  }

  // ── inspector ───────────────────────────────────────────────────────────────

  function currentTag() {
    if (!A.doc || A.doc.kind === 'region') return null;
    if (!A.selectedPath) return null;
    return ns.getByPath(A.doc.model, A.selectedPath);
  }

  function renderInspector() {
    if (!A.inspector) {
      A.inspector = new ns.Inspector({
        el: refs.inspector,
        smartEnabled: () => A.smartOn,
        commit: () => commitEdit(),
        addTag: (path) => addTag(path),
        renameTag: (path) => {
          const tag = ns.getByPath(A.doc.model, path);
          if (tag) A.tree.beginNameEdit(path, tag);
        },
        deleteTag: (tag, path) => deleteTag(path),
        duplicate: (tag, path) => duplicateTag(tag, path),
        changeType: (tag, path) => changeTypeMenu(tag, path),
        exportSNBT: (tag, path) => exportSNBT(tag),
      });
    }
    const tag = currentTag();
    if (!tag) { refs.inspector.innerHTML = '<div class="panel-empty">' + t('panel.empty') + '</div>'; return; }
    A.inspector.render(tag, A.selectedPath);
  }

  // ── structural ops ──────────────────────────────────────────────────────────

  function parentOf(path) {
    return path.length ? ns.getByPath(A.doc.model, path.slice(0, -1)) : null;
  }

  function addTag(path) {
    if (!A.doc) return;
    pushHistory();
    const target = ns.getByPath(A.doc.model, path);
    const container = target && (isCompound(target) || isList(target)) ? target : parentOf(path);
    if (!container) return;
    const newPath = [];
    if (isCompound(container)) {
      const name = nextFreeKey(container, 'new_tag');
      const child = ns.createTag(T.Compound, name);
      container.v.push([name, child]);
      newPath.push(...path, name);
    } else if (isList(container)) {
      const child = ns.createTag(container.et, '');
      container.v.push(child);
      newPath.push(...path, String(container.v.length - 1));
    }
    A.refreshAll();
    if (newPath.length) { A.selectedPath = newPath; A.tree.select(newPath, true); }
  }

  function nextFreeKey(container, base) {
    let name = base, i = 1;
    while (container.v.some(([k]) => k === name)) name = base + '_' + (i++);
    return name;
  }

  function deleteTag(path) {
    if (!A.doc || path.length === 0) return;
    pushHistory();
    const parent = ns.getByPath(A.doc.model, path.slice(0, -1));
    const key = path[path.length - 1];
    if (!parent) return;
    if (isCompound(parent)) {
      const i = parent.v.findIndex(([k]) => k === key);
      if (i >= 0) parent.v.splice(i, 1);
    } else if (isList(parent)) {
      parent.v.splice(Number(key), 1);
    }
    A.selectedPath = path.slice(0, -1);
    A.refreshAll();
  }

  function duplicateTag(tag, path) {
    if (!A.doc) return;
    pushHistory();
    const parent = ns.getByPath(A.doc.model, path.slice(0, -1));
    const key = path[path.length - 1];
    const copy = clone(tag);
    if (isCompound(parent)) {
      const name = nextFreeKey(parent, key + '_copy');
      parent.v.push([name, copy]);
      copy.n = name;
      A.selectedPath = path.slice(0, -1).concat([name]);
    } else if (isList(parent)) {
      parent.v.splice(Number(key) + 1, 0, copy);
      A.selectedPath = path.slice(0, -1).concat([String(Number(key) + 1)]);
    } else return;
    A.refreshAll();
  }

  function changeTypeMenu(tagObj, path) {
    const x = 0, y = 0;
    const items = [1, 2, 3, 4, 5, 6, 8, 7, 9, 10, 11, 12].map((t) => ({
      label: ns.typeName(t), icon: ns.iconSvg(t),
      action: () => changeType(path, t),
    }));
    showMenu(x, y, items);
  }

  function changeType(path, newType) {
    if (!A.doc) return;
    pushHistory();
    const tag = ns.getByPath(A.doc.model, path);
    if (!tag) return;
    const oldT = tag.t;
    tag.t = newType;
    tag.et = undefined;
    const fresh = ns.createTag(newType, tag.n);
    tag.v = fresh.v;
    if (isList(tag)) tag.et = fresh.et;
    // try convert numeric values
    if (isNumeric(oldT) && isNumeric(newType) && !isLong(oldT) && !isLong(newType)) {
      tag.v = oldT === newType ? tag.v : Number(tag.v);
    }
    if (newType === T.Long && isNumeric(oldT) && !isLong(oldT)) tag.v = BigInt(Math.trunc(Number(tag.v)));
    if (oldT === T.Long && isNumeric(newType)) { /* can't safely shrink; leave as-is */ tag.v = Number(tag.v); }
    A.refreshAll();
  }

  function isNumeric(t) { return t >= T.Byte && t <= T.Double; }
  function isLong(t) { return t === T.Long; }

  // ── tree dnd create handler ────────────────────────────────────────────────

  function moveTag(info) {
    if (!A.doc) return;
    const { fromPath, destPath, zone, destIsContainer } = info;

    const parent = parentOf(fromPath);
    const key = fromPath[fromPath.length - 1];
    if (!parent) return;

    // prevent self-contain
    const fp = fromPath.join('\u001f'), dp = destPath.join('\u001f');
    if (dp.startsWith(fp + '\u001f')) return;

    pushHistory();
    // detach
    let tag;
    if (isCompound(parent)) {
      const i = parent.v.findIndex(([k]) => k === key);
      tag = parent.v[i][1];
      parent.v.splice(i, 1);
    } else {
      tag = parent.v.splice(Number(key), 1)[0];
    }

    const insertAt = (container, index, moved) => {
      if (isCompound(container)) {
        const name = nextFreeKey(container, tag.n || 'new_tag');
        container.v.splice(index, 0, [name, moved]);
        moved.n = name;
      } else {
        // list: keep uniform type
        if (isList(container)) {
          if (container.et !== T.End && container.et !== moved.t) {
            if (container.v.length === 0) container.et = moved.t;
            else { A.refreshAll(); toast(t('toast.cannotMove', ns.typeName(moved.t), ns.typeName(container.et)), 'err'); return; }
          }
          if (container.v.length === 0) container.et = moved.t;
        }
        container.v.splice(index, 0, moved);
      }
    };

    if (zone === 'mid' && destIsContainer) {
      const dest = ns.getByPath(A.doc.model, destPath);
      insertAt(dest, 0, tag);
      A.selectedPath = destPath.concat([compoundKey(dest, 0, tag)]);
    } else {
      const destParent = parentOf(destPath);
      const dKey = destPath[destPath.length - 1];
      let index;
      if (isCompound(destParent)) {
        index = destParent.v.findIndex(([k]) => k === dKey);
      } else {
        index = Number(dKey);
      }
      if (index < 0) index = 0;
      if (zone === 'bottom') index += 1;
      insertAt(destParent, index, tag);
      A.selectedPath = destPath.slice(0, -1).concat([compoundKey(destParent, index < destParent.v.length ? index : index, tag)]);
    }

    A.refreshAll();
  }

  function compoundKey(container, i, tag) {
    return isCompound(container) ? container.v[i] && container.v[i][0] : String(i);
  }

  // ── menus ───────────────────────────────────────────────────────────────────

  function showContextMenu(path, x, y) {
    if (!A.doc) return;
    const tag = ns.getByPath(A.doc.model, path);
    if (!tag) return;

    const items = [];
    if (path.length > 0) {
      items.push({ label: t('menu.rename'), key: 'F2', action: () => A.tree.beginNameEdit(path, tag) });
      items.push({ label: t('menu.duplicate'), action: () => duplicateTag(tag, path) });
      items.push({ label: t('menu.copy'), key: 'Ctrl+C', action: () => copyTag(tag) });
      if (A.clipboard) items.push({ label: t('menu.pasteAfter'), key: 'Ctrl+V', action: () => pasteAfter(path) });
    } else {
      items.push({ label: t('menu.rename'), action: () => A.tree.beginNameEdit(path, tag) });
    }
    items.push({ sep: true });

    if (isCompound(tag)) {
      items.push({
        label: t('menu.new'), submenu: [
          [1, 2, 3, 4, 5, 6, 8, 7, 11, 12, 9, 10].map((t) => ({
            label: ns.typeName(t), icon: ns.iconSvg(t),
            action: () => { pushHistory(); const name = nextFreeKey(tag, 'new_tag'); const c = ns.createTag(t, name); tag.v.push([name, c]); A.refreshAll(); },
          })),
        ],
      });
      items.push({ label: t('menu.sortKeys'), action: () => { pushHistory(); tag.v.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0); A.refreshAll(); } });
    }
    if (isList(tag)) {
      items.push({
        label: t('menu.addElement'), action: () => {
          pushHistory();
          const c = ns.createTag(tag.et === T.End ? T.Int : tag.et, '');
          tag.v.push(c);
          if (tag.et === T.End) tag.et = c.t;
          A.refreshAll();
        },
      });
      items.push({
        label: t('menu.elementType'), submenu: [
          [1, 2, 3, 4, 5, 6, 8, 10].map((t) => ({
            label: ns.typeName(t), icon: ns.iconSvg(t),
            action: () => { pushHistory(); if (tag.v.length) tag.v = []; tag.et = t; A.refreshAll(); },
          })),
        ],
      });
    }
    if (path.length > 0) {
      items.push({ label: t('menu.delete'), key: 'Del', danger: true, action: () => deleteTag(path) });
    }

    items.push({ sep: true });
    items.push({ label: t('menu.changeType'), submenu: [
      [1, 2, 3, 4, 5, 6, 8, 7, 11, 12, 9, 10].map((t) => ({
        label: ns.typeName(t), icon: ns.iconSvg(t), action: () => changeType(path, t),
      })),
    ] });

    showMenu(x, y, items);
  }

  function showMenu(x, y, items) {
    closeMenus();
    const menu = el2('div'); menu.className = 'menu';
    for (const it of items) {
      if (it.sep) { menu.appendChild(el2('div')); menu.lastChild.className = 'sep'; continue; }
      if (it.submenu) {
        const sub = el2('div'); sub.className = 'sub';
        const mi = el2('div'); mi.className = 'mi';
        mi.innerHTML = it.label;
        sub.appendChild(mi);
        const child = el2('div'); child.className = 'sub-child';
        for (const c of it.submenu[0]) {
          const ci = el2('div'); ci.className = 'mi';
          if (c.icon) ci.insertAdjacentHTML('beforeend', c.icon);
          ci.appendChild(document.createTextNode(c.label));
          ci.onclick = () => { closeMenus(); c.action(); };
          child.appendChild(ci);
        }
        sub.appendChild(child);
        menu.appendChild(sub);
        continue;
      }
      const mi = el2('div'); mi.className = 'mi' + (it.danger ? ' danger' : '');
      mi.appendChild(document.createTextNode(it.label));
      if (it.key) { const k = el2('span'); k.className = 'mk'; k.textContent = it.key; mi.appendChild(k); }
      mi.onclick = () => { closeMenus(); it.action(); };
      menu.appendChild(mi);
    }
    document.body.appendChild(menu);
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
    setTimeout(() => document.addEventListener('click', closeMenus, { once: true }), 10);
  }

  function closeMenus() {
    document.querySelectorAll('.menu').forEach((m) => m.remove());
  }

  function el2(tag) { return document.createElement(tag); }

  // ── clipboard ───────────────────────────────────────────────────────────────

  function copyTag(tag) { A.clipboard = clone(tag); toast(t('toast.copied', ns.typeName(tag.t))); }

  function pasteAfter(path) {
    if (!A.doc || !A.clipboard) return;
    pushHistory();
    const parent = parentOf(path);
    if (isCompound(parent)) {
      const key = path[path.length - 1];
      const i = parent.v.findIndex(([k]) => k === key);
      const copy = clone(A.clipboard);
      const name = nextFreeKey(parent, 'copy_' + key);
      copy.n = name;
      parent.v.splice(i + 1, 0, [name, copy]);
    } else if (isList(parent)) {
      const copy = clone(A.clipboard);
      parent.v.splice(Number(path[path.length - 1]) + 1, 0, copy);
    } else return;
    A.refreshAll();
  }

  // ── files ───────────────────────────────────────────────────────────────────

  async function openFile(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    // region probe
    if (ns.region.probe(buf) || /\.(mca|mcr)$/i.test(file.name)) {
      A.region = { container: ns.region.create(buf), filename: file.name };
      A.doc = { kind: 'region', filename: file.name };
      refs.empty.classList.add('hidden');
      A.refreshStatus();
      refreshAll();
      return;
    }
    const loaded = await ns.codec.loadBuffer(buf);
    if (!loaded.decoded) {
      toast(t('err.parse'), 'err');
      return;
    }
    A.doc = {
      kind: 'nbt', filename: file.name, model: loaded.res.root, mode: loaded.mode,
    };
    A.hist = []; A.future = [];
    A.selectedPath = null;
    refs.empty.classList.add('hidden');
    A.refreshStatus();
    refreshAll();
    if ((loaded.res.errors || []).length) {
      toast(t('warn.parseIssues', loaded.res.errors.length), 'warn');
    }
  }

  async function saveDoc() {
    if (!A.doc) return;
    if (A.doc.kind === 'region') {
      const bytes = await A.region.container.pack();
      ns.codec.download(bytes, A.region.filename);
      toast(t('toast.savedRegion'));
      return;
    }
    if (A.doc.kind === 'chunk' && A.doc.region) {
      // write back to region container (dirty chunk)
      if (A.doc.region && A.doc.region.container) {
        A.doc.region.container.setChunkModel(A.doc.x, A.doc.z, A.doc.model, 2);
      }
      toast(t('toast.stagedChunk', A.doc.x, A.doc.z), 'warn');
      return;
    }
    const bytes = await ns.codec.compileModel(A.doc.model, A.doc.mode || 'gzip');
    ns.codec.download(bytes, A.doc.filename);
    toast(t('toast.saved', A.doc.filename));
  }

  // ── region grid ─────────────────────────────────────────────────────────────

  function renderRegionGrid() {
    const c = A.region.container;
    const chunks = c.listChunks();
    const box = el2('div');
    box.style.cssText = 'padding:14px;overflow:auto;height:100%';
    box.innerHTML = '<h2 style="margin-bottom:8px">' + tpl('region.title', chunks.length) + '</h2>';
    const grid = el2('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:6px';
    if (chunks.length === 0) {
      box.appendChild(grid);
      const none = el2('div');
      none.textContent = t('region.empty');
      box.appendChild(none);
      refs.tree.innerHTML = '';
      refs.tree.appendChild(box);
      return;
    }
    for (const chunk of chunks) {
      const cell = el2('button');
      cell.textContent = 'r.' + chunk.x + '.' + chunk.z;
      cell.style.cssText = 'text-align:left;padding:6px';
      cell.onclick = async () => {
        const model = await c.chunkModel(chunk.x, chunk.z);
        if (!model) { toast(t('err.chunkUnreadable'), 'err'); return; }
        A.doc = { kind: 'chunk', filename: chunk.x + '.' + chunk.z + '.nbt', model, mode: 'zlib', region: c, x: chunk.x, z: chunk.z };
        A.hist = []; A.future = [];
        A.selectedPath = null;
        refs.tree.classList.remove('hidden');
        A.refreshStatus();
        refreshAll();
      };
      grid.appendChild(cell);
    }
    box.appendChild(grid);
    // save region button
    const saveBtn = el2('button');
    saveBtn.textContent = t('region.saveBtn');
    saveBtn.style.marginTop = '12px';
    saveBtn.onclick = async () => {
      if (A.doc.kind === 'chunk') {
        A.region.container.setChunkModel(A.doc.x, A.doc.z, A.doc.model, 2);
        A.doc = { kind: 'region', filename: A.region.filename };
        refreshAll();
        await new Promise((r) => setTimeout(r, 30));
      }
      const bytes = await A.region.container.pack();
      ns.codec.download(bytes, A.region.filename);
      toast(t('toast.savedRegion'));
    };
    refs.tree.innerHTML = '';
    refs.tree.appendChild(box);
  }

  // ── hex ─────────────────────────────────────────────────────────────────────

  function updateHex() {
    if (!A.hexOn) return;
    if (!A.doc || A.doc.kind === 'region') { refs.hex.textContent = ''; return; }
    try {
      const wasm = ns.codec._module;
      const b64 = wasm.encode(A.doc.model);
      const bytes = ns.codec.b64ToBytes(b64);
      refs.hex.textContent = ns.hexRows(bytes, 16);
    } catch (e) { refs.hex.textContent = '…'; }
  }

  // ── status / buttons ────────────────────────────────────────────────────────

  function refreshStatus() {
    const s = refs.status;
    if (!A.doc) return;
    s.file.textContent = A.doc.filename || '—';
    if (A.doc.kind === 'region') {
      s.mode.textContent = tpl('status.region', A.region.container.listChunks().length);
      s.count.textContent = '';
      s.errors.textContent = '';
    } else {
      const mode = A.doc.kind === 'chunk' ? (t('status.chunk', A.doc.x, A.doc.z) + ' ') : '';
      s.mode.textContent = mode + (ns.codec.MODES[A.doc.mode] ? ns.codec.MODES[A.doc.mode].label : '');
      s.count.textContent = tpl('status.tags', ns.countTags(A.doc.model));
      s.errors.textContent = '';
      if (A.doc.model && A.doc.n) {}
    }
    refreshHistory();
  }

  function refreshHistory() {
    refs.status.history.textContent = A.hist.length ? t('status.hist', A.hist.length) : '';
  }

  function refreshButtons() {
    const has = !!(A.doc && A.doc.kind !== 'region');
    $('#btn-undo').disabled = A.hist.length === 0;
    $('#btn-redo').disabled = A.future.length === 0;
    $('#btn-delete').disabled = !has || !A.selectedPath || A.selectedPath.length === 0;
    $('#btn-duplicate').disabled = !has || !A.selectedPath;
  }

  // ── formats ─────────────────────────────────────────────────────────────────

  function exportSNBT(tag) {
    const text = ns.toSNBT(tag, { indent: true });
    ns.codec.download(new TextEncoder().encode(text), 'tag.snbt', 'text/plain');
  }

  function exportCurrentSNBT() {
    if (!A.doc || A.doc.kind === 'region') return;
    const text = ns.toSNBT(A.doc.model, { indent: true });
    ns.codec.download(new TextEncoder().encode(text), A.doc.filename.replace(/\.[^.]+$/, '') + '.snbt', 'text/plain');
  }

  function exportCurrentJSON() {
    if (!A.doc || A.doc.kind === 'region') return;
    const text = JSON.stringify(ns.toJSON(A.doc.model), null, 2);
    ns.codec.download(new TextEncoder().encode(text), A.doc.filename.replace(/\.[^.]+$/, '') + '.json', 'application/json');
  }

  async function importText(file) {
    const text = await file.text();
    try {
      const tag = ns.parseSNBT(text);
      A.doc = { kind: 'nbt', filename: file.name.replace(/\.(snbt|txt|nbt)$/i, '.dat'), model: tag, mode: 'gzip' };
      A.hist = []; A.future = [];
      A.selectedPath = null;
      refs.empty.classList.add('hidden');
      A.refreshStatus();
      refreshAll();
      toast(t('toast.importedSNBT'));
    } catch (e) {
      try {
        const obj = JSON.parse(text);
        const tag = ns.fromJSON(obj);
        A.doc = { kind: 'nbt', filename: file.name.replace(/\.json$/i, '.dat'), model: tag, mode: 'gzip' };
        A.hist = []; A.future = [];
        A.selectedPath = null;
        refs.empty.classList.add('hidden');
        A.refreshStatus();
        refreshAll();
        toast(t('toast.importedJSON'));
      } catch (e2) {
        toast(t('err.importFailed', e.message), 'err');
      }
    }
  }

  function showFormatsMenu(x, y) {
    const items = [
      { label: t('formats.exportSNBT'), action: exportCurrentSNBT },
      { label: t('formats.exportJSON'), action: exportCurrentJSON },
      { sep: true },
      { label: t('formats.import'), action: () => refs.file.click() },
    ];
    showMenu(x, y, items);
  }

  // ── toast ───────────────────────────────────────────────────────────────────

  let toastsBox = null;
  function toast(msg, kind) {
    if (!toastsBox) { toastsBox = el2('div'); toastsBox.id = 'toasts'; document.body.appendChild(toastsBox); }
    const t = el2('div'); t.className = 'toast ' + (kind || '');
    t.textContent = msg;
    toastsBox.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  // ── theme ───────────────────────────────────────────────────────────────────

  function applyTheme() {
    document.documentElement.dataset.theme = A.theme;
    try { localStorage.setItem('webnbt-theme', A.theme); } catch (e) {}
  }

  // ── events ──────────────────────────────────────────────────────────────────

  function wire() {
    $('#btn-open').onclick = () => refs.file.click();
    $('#btn-save').onclick = saveDoc;
    $('#btn-undo').onclick = () => { undo(); A.refreshButtons && A.refreshButtons(); };
    $('#btn-redo').onclick = () => { redo(); };
    $('#btn-delete').onclick = () => A.selectedPath && deleteTag(A.selectedPath);
    $('#btn-duplicate').onclick = () => {
      const tag = currentTag();
      if (tag && A.selectedPath) duplicateTag(tag, A.selectedPath);
    };
    $('#btn-add').onclick = () => { const p = A.selectedPath || []; addTag(p); };
    $('#btn-hex').onclick = (e) => {
      A.hexOn = !A.hexOn;
      e.target.classList.toggle('active', A.hexOn);
      refs.hex.classList.toggle('hidden', !A.hexOn);
      if (A.hexOn) updateHex();
      document.body.classList.toggle('no-right-inset', !A.hexOn);
    };
    $('#btn-smart').onclick = (e) => {
      A.smartOn = !A.smartOn;
      e.target.classList.toggle('active', A.smartOn);
      renderInspector();
    };
    $('#btn-theme').onclick = () => {
      A.theme = A.theme === 'dark' ? 'light' : 'dark';
      applyTheme();
    };
    $('#btn-export').onclick = (e) => {
      const r = e.target.getBoundingClientRect();
      showFormatsMenu(r.left, r.bottom);
    };

    refs.file.addEventListener('change', (e) => {
      for (const f of e.target.files) openFile(f);
      refs.file.value = '';
    });

    // drag & drop
    let dragDepth = 0;
    window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; document.body.classList.add('dragging'); });
    window.addEventListener('dragleave', (e) => { e.preventDefault(); if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
    window.addEventListener('dragover', (e) => e.preventDefault());
    refs.drop.addEventListener('drop', (e) => {
      e.preventDefault();
      dragDepth = 0;
      document.body.classList.remove('dragging');
      for (const f of e.dataTransfer.files) openFile(f);
    });

    // search
    let searchTimer = null;
    refs.search.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => A.tree && A.tree.applySearch(refs.search.value.trim()), 180);
    });
    refs.search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && A.tree) { e.preventDefault(); A.tree.focusSearch(A.tree.searchIdx + 1); }
      if (e.key === 'Escape') { refs.search.value = ''; A.tree && A.tree.applySearch(''); }
    });

    $('#empty-open').onclick = () => refs.file.click();

    // keyboard
    window.addEventListener('keydown', (e) => {
      const tgt = e.target;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) {
        if (e.key === 'Escape') { closeMenus(); refs.tree.focus(); }
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); refs.file.click(); }
      else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveDoc(); }
      else if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if (mod && e.key.toLowerCase() === 'c') { const t = currentTag(); if (t) copyTag(t); }
      else if (mod && e.key.toLowerCase() === 'v') { if (A.selectedPath) pasteAfter(A.selectedPath); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { if (A.selectedPath && A.selectedPath.length) deleteTag(A.selectedPath); }
      else if (e.key === 'F2') { if (A.selectedPath) { const t = currentTag(); if (t) A.tree.beginNameEdit(A.selectedPath, t); } }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        // basic navigation: select next/prev visible node
        const all = Array.from(refs.tree.querySelectorAll('li'));
        if (all.length) {
          const cur = all.findIndex((li) => li.classList.contains('selected'));
          const ni = Math.max(0, Math.min(all.length - 1, cur === -1 ? 0 : cur + (e.key === 'ArrowDown' ? 1 : -1)));
          const path = all[ni].dataset.path.split('\u001f').filter(Boolean);
          A.tree.select(path, true);
        }
        e.preventDefault();
      }
    });

    // theme init
    try { const saved = localStorage.getItem('webnbt-theme'); if (saved) A.theme = saved; } catch (e2) {}
    applyTheme();
  }

  // ── boot ────────────────────────────────────────────────────────────────────

  async function boot() {
    if (A.booted) return;
    A.booted = true;
    grab();
    const start = performance.now();
    refs.loading.textContent = t('loading.booting');
    await ns.codec.ready();
    refs.loading.textContent = t('loading.ready');
    refs.shade.classList.add('done');
    makeTree();
    wire();
    refreshButtons();
    setTimeout(() => refs.shade.remove(), 400);
  }

  A.refreshAll = refreshAll;
  A.refreshStatus = refreshStatus;
  A.refreshButtons = refreshButtons;
  A.refreshTree = () => A.tree.refresh();
  A.refreshHistory = refreshHistory;

  return {
    boot,
    undo, redo,
    pushHistory,
    toast,
    saveDoc,
    openFile,
    refreshAll,
    refreshStatus,
    refreshButtons,
    refreshTree: () => A.tree.refresh(),
  };
})(window.NBT || {});

window.addEventListener('DOMContentLoaded', () => {
  window.App.boot();
});