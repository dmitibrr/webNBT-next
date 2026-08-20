/* ─────────────────────────────────────────────────────────────────────────────
 * app.js — application shell: documents, history, toolbar, menus, region.
 * Multi-document: A.docs[] holds every open doc; A.doc is the active one.
 * ───────────────────────────────────────────────────────────────────────────── */

window.App = (function (ns) {
  'use strict';
  const { T, isCompound, isList, clone } = ns;
  const t = ns.t, tpl = ns.tpl;

  const A = {
    docs: [],          // all open docs (tabs)
    doc: null,         // active doc
    clipboard: null,
    hexOn: true, smartOn: true, theme: 'dark',
    inspector: null, tree: null,
    diffResults: null, diffFilename: null,
  };

  // Accessors bound to the active doc so callers keep working unchanged.
  Object.defineProperties(A, {
    hist: { get() { return A.doc ? A.doc.hist : []; }, set(v) { if (A.doc) A.doc.hist = v; } },
    future: { get() { return A.doc ? A.doc.future : []; }, set(v) { if (A.doc) A.doc.future = v; } },
    selectedPath: { get() { return A.doc ? A.doc.selectedPath : null; }, set(v) { if (A.doc) A.doc.selectedPath = v; } },
    region: { get() { return A.doc ? A.doc.region : null; }, set(v) { if (A.doc) A.doc.region = v; } },
  });

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
      search: $('#search-field'), tabs: $('#chunk-tabs'), fileCompare: $('#file-compare'),
    };
  }

  // ── docs / tabs ─────────────────────────────────────────────────────────────

  function newDoc(kind, data) {
    return Object.assign({ kind, hist: [], future: [], selectedPath: null, openPaths: new Set(['']) }, data);
  }

  function tabLabel(doc) {
    if (doc.kind === 'chunk') return 'r.' + doc.x + '.' + doc.z;
    if (doc.kind === 'region') return '🗺 ' + doc.filename;
    return doc.filename || '—';
  }

  function setActive(doc) {
    A.doc = doc;
    A.tree.openPaths = new Set(doc.openPaths || ['']);
    refs.empty.classList.add('hidden');
    refs.tree.classList.remove('hidden');
    A.refreshStatus();
    refreshAll();
    renderTabs();
  }

  function switchDoc(next) {
    if (!next || next === A.doc) { renderTabs(); return; }
    if (A.doc) A.doc.openPaths = new Set(A.tree.openPaths);
    setActive(next);
  }

  function openDoc(doc) {
    const same = A.docs.find((d) => d.filename === doc.filename && d.kind === doc.kind);
    if (same) { switchDoc(same); return same; }
    A.docs.push(doc);
    switchDoc(doc);
    return doc;
  }

  function closeDoc(i) {
    const doc = A.docs[i];
    if (!doc) return;
    const wasActive = A.doc === doc;
    A.docs.splice(i, 1);
    if (wasActive) {
      if (A.docs.length) setActive(A.docs[Math.max(0, i - 1)]);
      else showEmpty();
    } else renderTabs();
  }

  function showEmpty() {
    A.doc = null;
    refs.tree.classList.add('hidden');
    refs.empty.classList.remove('hidden');
    refs.inspector.innerHTML = '<div class="panel-empty">' + t('panel.empty') + '</div>';
    refs.hex.textContent = '';
    A.hexBytes = null; A.hexRanges = null;
    A.refreshStatus();
    refreshButtons();
    renderTabs();
  }

  function renderTabs() {
    const box = refs.tabs;
    if (!box) return;
    box.textContent = '';
    if (!A.docs.length) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    A.docs.forEach((doc, i) => {
      const tab = el2('button');
      tab.className = 'chunk-tab' + (doc === A.doc ? ' active' : '');
      tab.title = tpl('tab.switch', i + 1);
      tab.onclick = () => switchDoc(doc);
      const label = el2('span');
      label.className = 'tab-label';
      label.textContent = tabLabel(doc);
      const close = el2('span');
      close.className = 'tab-close';
      close.textContent = '✕';
      close.title = t('tab.close');
      close.onclick = (e) => { e.stopPropagation(); closeDoc(i); };
      tab.appendChild(label);
      tab.appendChild(close);
      box.appendChild(tab);
    });
  }

  function cycleDoc(dir) {
    if (!A.docs.length) return;
    const idx = A.docs.indexOf(A.doc);
    const next = A.docs[(idx + dir + A.docs.length) % A.docs.length];
    switchDoc(next);
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
        if (A.hexOn && A.hexBytes) renderHex();
      },
      onCommit: (tag) => { commitEdit(); },
      onRename: (tag, path, newName) => { commitRename(tag, path, newName); },
      onMove: (info) => { moveTag(info); },
      onContextMenu: (path, x, y) => { showContextMenu(path, x, y); },
      onExternalDrop: (tag, destPath, destIsContainer) => {
        insertExternalTag(tag, destPath, destIsContainer);
      },
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
    if (!A.doc) return;
    if (A.doc.kind === 'nbt' || A.doc.kind === 'chunk') {
      A.tree.root = A.doc.model;
      refs.tree.classList.remove('hidden');
      A.refreshTree();
      renderInspector();
      updateHex();
      A.refreshStatus();
      A.refreshButtons();
    } else if (A.doc.kind === 'region') {
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

  function selectPath(path) {
    A.selectedPath = path;
    if (A.tree) A.tree.select(path, true);
    renderInspector();
    if (A.hexOn && A.hexBytes) renderHex();
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
        selectPath: (path) => selectPath(path),
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

  // ── multi-select group ops (feature: multi-select) ─────────────────────────

  function selectedPaths() {
    return A.tree ? A.tree.multiSelected().map((p) => p.concat()) : [];
  }

  function deleteMulti() {
    const paths = selectedPaths().filter((p) => p.length > 0).sort((a, b) => b.length - a.length);
    if (!paths.length) return;
    pushHistory();
    for (const p of paths) {
      const parent = ns.getByPath(A.doc.model, p.slice(0, -1));
      const key = p[p.length - 1];
      if (!parent) continue;
      if (isCompound(parent)) {
        const i = parent.v.findIndex(([k]) => k === key);
        if (i >= 0) parent.v.splice(i, 1);
      } else if (isList(parent)) {
        parent.v.splice(Number(key), 1);
      }
    }
    A.selectedPath = [];
    A.tree.clearMulti();
    A.refreshAll();
  }

  function duplicateMulti() {
    const paths = selectedPaths().filter((p) => p.length > 0);
    if (!paths.length) return;
    pushHistory();
    const added = [];
    for (const p of paths) {
      const parent = ns.getByPath(A.doc.model, p.slice(0, -1));
      const key = p[p.length - 1];
      const tag = ns.getByPath(A.doc.model, p);
      if (!parent || !tag) continue;
      const copy = clone(tag);
      if (isCompound(parent)) {
        const name = nextFreeKey(parent, key + '_copy');
        parent.v.push([name, copy]);
        copy.n = name;
        added.push(p.slice(0, -1).concat([name]));
      } else if (isList(parent)) {
        parent.v.splice(Number(key) + 1, 0, copy);
        added.push(p.slice(0, -1).concat([String(Number(key) + 1)]));
      }
    }
    A.selectedPath = added[0] || [];
    A.tree.clearMulti();
    A.refreshAll();
  }

  function renameMultiPrefix() {
    const paths = selectedPaths().filter((p) => p.length > 0 && isCompound(ns.getByPath(A.doc.model, p.slice(0, -1))));
    if (!paths.length) { toast(t('toast.multiOnlyCompound'), 'warn'); return; }
    const prefix = prompt(t('multi.prefixPrompt'));
    if (prefix === null) return;
    pushHistory();
    for (const p of paths) {
      const parent = ns.getByPath(A.doc.model, p.slice(0, -1));
      const key = p[p.length - 1];
      const pair = parent.v.find(([k]) => k === key);
      if (pair) pair[0] = prefix + key;
    }
    A.tree.clearMulti();
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

  // Cross-window tag drop: no doc → open as new; else insert into the drop target.
  function insertExternalTag(tag, destPath, destIsContainer) {
    if (!A.doc || A.doc.kind === 'region') {
      openDoc(newDoc('nbt', { filename: 'dropped.dat', model: clone(tag), mode: 'gzip' }));
      A.refreshStatus();
      refreshAll();
      return;
    }
    pushHistory();
    const copy = clone(tag);
    const target = destPath && destPath.length ? ns.getByPath(A.doc.model, destPath) : A.doc.model;
    const container = (target && (isCompound(target) || isList(target))) ? target : parentOf(destPath);
    if (!container) { A.refreshAll(); return; }
    let sel;
    if (isCompound(container)) {
      const name = nextFreeKey(container, copy.n || 'new_tag');
      container.v.push([name, copy]);
      copy.n = name;
      sel = destPath.concat([name]);
    } else if (isList(container)) {
      container.v.push(copy);
      sel = destPath.concat([String(container.v.length - 1)]);
    }
    A.refreshAll();
    if (sel) { A.selectedPath = sel; A.tree.select(sel, true); }
  }

  // ── menus ───────────────────────────────────────────────────────────────────

  function showContextMenu(path, x, y) {
    if (!A.doc) return;
    const tag = ns.getByPath(A.doc.model, path);
    if (!tag) return;

    const items = [];
    const multi = selectedPaths().length > 1;
    if (multi) {
      items.push({ label: t('multi.delete', selectedPaths().length), danger: true, action: deleteMulti });
      items.push({ label: t('multi.duplicate', selectedPaths().length), action: duplicateMulti });
      items.push({ label: t('multi.renamePrefix'), action: renameMultiPrefix });
      items.push({ sep: true });
    }
    if (path.length > 0) {
      items.push({ label: t('menu.rename'), key: 'F2', action: () => A.tree.beginNameEdit(path, tag) });
      items.push({ label: t('menu.duplicate'), action: () => duplicateTag(tag, path) });
      items.push({ label: t('menu.copy'), key: 'Ctrl+C', action: () => copyTag(tag) });
      if (A.clipboard) items.push({ label: t('menu.pasteAfter'), key: 'Ctrl+V', action: () => pasteAfter(path) });
      items.push({ label: t('menu.copyPath'), key: 'Ctrl+Shift+C', action: () => copyTagPath(path) });
      items.push({ label: t('menu.exportDat'), action: () => exportTagDat(tag) });
      items.push({ sep: true });
      items.push({ label: t('menu.moveUp'), key: 'Alt+↑', action: () => moveTagOrder(path, -1) });
      items.push({ label: t('menu.moveDown'), key: 'Alt+↓', action: () => moveTagOrder(path, 1) });
      items.push({ label: t('menu.bookmark'), action: () => toggleBookmark(path) });
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

  // ── clipboard / path ────────────────────────────────────────────────────────

  function copyTag(tag) { A.clipboard = clone(tag); toast(t('toast.copied', ns.typeName(tag.t))); }

  function copyTagPath(path) {
    const parts = path.map((s) => String(s));
    const dot = parts.join('.');
    const slash = '/' + parts.join('/');
    const text = slash + (dot !== slash.slice(1) ? '\n' + dot : '');
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
      .then(() => toast(t('toast.copiedPath', slash)))
      .catch(() => toast(t('err.importFailed', ''), 'err'));
  }

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

  // move a sibling tag up/down in its parent
  function moveTagOrder(path, dir) {
    if (!A.doc || path.length === 0) return;
    const parent = ns.getByPath(A.doc.model, path.slice(0, -1));
    const key = path[path.length - 1];
    let idx;
    if (isCompound(parent)) idx = parent.v.findIndex(([k]) => k === key);
    else if (isList(parent)) idx = Number(key);
    else return;
    if (idx < 0) return;
    const to = idx + dir;
    if (isCompound(parent)) {
      if (to < 0 || to >= parent.v.length) return;
      pushHistory();
      const [a, b] = [parent.v[idx], parent.v[to]];
      parent.v[idx] = b; parent.v[to] = a;
    } else {
      if (to < 0 || to >= parent.v.length) return;
      pushHistory();
      const [a, b] = [parent.v[idx], parent.v[to]];
      parent.v[idx] = b; parent.v[to] = a;
    }
    A.selectedPath = path;
    A.refreshAll();
    if (A.tree) A.tree.select(path, true);
  }

  // ── bookmarks ───────────────────────────────────────────────────────────────

  const BM_KEY = 'webnbt-bookmarks';
  function loadBookmarks() { try { return JSON.parse(localStorage.getItem(BM_KEY) || '[]'); } catch (e) { return []; } }
  function saveBookmarks(arr) { try { localStorage.setItem(BM_KEY, JSON.stringify(arr)); } catch (e) {} }
  function isBookmarked(path) { return loadBookmarks().indexOf(path.join('\u001f')) >= 0; }
  function toggleBookmark(path) {
    const key = path.join('\u001f');
    const arr = loadBookmarks();
    const i = arr.indexOf(key);
    if (i >= 0) { arr.splice(i, 1); toast(t('toast.unbookmarked')); }
    else { arr.push(key); toast(t('toast.bookmarked')); }
    saveBookmarks(arr);
  }

  // ── export selected tag as .dat ─────────────────────────────────────────────

  async function exportTagDat(tag) {
    try {
      const bytes = await ns.codec.compileModel(tag, A.doc.mode || 'gzip');
      ns.codec.download(bytes, (tag.n || 'tag').replace(/[^\w.-]+/g, '_') + '.dat');
      toast(t('toast.saved', (tag.n || 'tag') + '.dat'));
    } catch (e) { toast(t('err.importFailed', String(e)), 'err'); }
  }

  // ── go to path/offset ───────────────────────────────────────────────────────

  function goToPath() {
    if (!A.doc || A.doc.kind === 'region') return;
    const raw = prompt(t('goto.pathPrompt'));
    if (!raw) return;
    let path = null;
    const norm = raw.replace(/^\/+|\/+$/g, '');
    if (norm) {
      path = norm.split('/').map((s) => /^\d+$/.test(s) ? Number(s) : s);
    }
    // resolve
    let cur = path ? ns.getByPath(A.doc.model, path) : A.doc.model;
    if (cur === undefined) {
      // try dot notation
      const alt = norm.split('.').map((s) => /^\d+$/.test(s) ? Number(s) : s);
      cur = ns.getByPath(A.doc.model, alt);
      if (cur !== undefined) path = alt;
    }
    if (cur === undefined) { toast(t('goto.notFound'), 'err'); return; }
    selectPath(path || []);
  }

  function goToOffset() {
    if (!A.hexBytes) { toast(t('goto.noHex'), 'warn'); return; }
    const raw = prompt(t('goto.offsetPrompt'));
    if (!raw) return;
    const n = parseInt(raw.trim(), 16);
    if (isNaN(n)) { toast(t('goto.notFound'), 'err'); return; }
    if (n < 0 || n >= A.hexBytes.length) { toast(t('goto.notFound'), 'err'); return; }
    onHexClick(n);
  }

  // ── collapse / expand all ───────────────────────────────────────────────────

  function collapseAll() {
    if (!A.tree) return;
    A.tree.openPaths = new Set([]);
    A.tree.refresh();
  }
  function expandAll() {
    if (!A.tree) return;
    const set = new Set(['']);
    const walk = (tag, path) => {
      if (isCompound(tag) || isList(tag)) set.add(path.join('\u001f'));
      if (isCompound(tag)) for (const [k, c] of tag.v) { path.push(k); walk(c, path); path.pop(); }
      else if (isList(tag)) for (let i = 0; i < tag.v.length; i++) { path.push(i); walk(tag.v[i], path); path.pop(); }
    };
    walk(A.doc && A.doc.model, []);
    A.tree.openPaths = set;
    A.tree.refresh();
  }

  // ── typed tag creation shortcuts (Alt+B/S/I/L/…) ───────────────────────────

  const ALT_TYPE = { b: 1, s: 8, i: 3, l: 4, f: 5, d: 6, t: 10, n: 11, a: 7, g: 12, e: 9 };
  function addTypedTag(type) {
    if (!A.doc) return;
    const path = A.selectedPath || [];
    const target = ns.getByPath(A.doc.model, path);
    const container = target && (isCompound(target) || isList(target)) ? target : parentOf(path);
    if (!container) return;
    pushHistory();
    if (isCompound(container)) {
      const name = nextFreeKey(container, ns.typeName(type).toLowerCase());
      const c = ns.createTag(type, name);
      container.v.push([name, c]);
      A.selectedPath = path.concat([name]);
    } else if (isList(container)) {
      if (container.et !== T.End && container.et !== type) { toast(t('toast.cannotMove', ns.typeName(type), ns.typeName(container.et)), 'err'); return; }
      if (container.et === T.End) container.et = type;
      const c = ns.createTag(type, '');
      container.v.push(c);
      A.selectedPath = path.concat([String(container.v.length - 1)]);
    }
    A.refreshAll();
    if (A.tree) A.tree.select(A.selectedPath, true);
  }

  // ── files ───────────────────────────────────────────────────────────────────

  async function openFile(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    // region probe
    if (ns.region.probe(buf) || /\.(mca|mcr)$/i.test(file.name)) {
      const region = { container: ns.region.create(buf), filename: file.name };
      openDoc(newDoc('region', { filename: file.name, region }));
      return;
    }
    const loaded = await ns.codec.loadBuffer(buf);
    if (!loaded.decoded) {
      toast(t('err.parse'), 'err');
      return;
    }
    openDoc(newDoc('nbt', { filename: file.name, model: loaded.res.root, mode: loaded.mode }));
    addRecent(file.name);
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
      A.doc.region.setChunkModel(A.doc.x, A.doc.z, A.doc.model, 2);
      toast(t('toast.stagedChunk', A.doc.x, A.doc.z), 'warn');
      return;
    }
    const issues = ns.mcdata.validateChunk(A.doc.model);
    if (issues.length) {
      toast(t('warn.chunkIssues', issues.length) + ' — ' + issues[0], 'warn');
    }
    const bytes = await ns.codec.compileModel(A.doc.model, A.doc.mode || 'gzip');
    ns.codec.download(bytes, A.doc.filename);
    toast(t('toast.saved', A.doc.filename));
  }

  function openChunkDoc(model, x, z) {
    const container = A.region && A.region.container ? A.region.container : A.region;
    const doc = newDoc('chunk', { filename: x + '.' + z + '.nbt', model, mode: 'zlib', region: container, x, z });
    const existing = A.docs.find((d) => d.kind === 'chunk' && d.x === x && d.z === z && d.region === container);
    if (existing) { switchDoc(existing); return; }
    A.docs.push(doc);
    switchDoc(doc);
  }

  // ── recent files (menu) ─────────────────────────────────────────────────────

  const RECENT_KEY = 'webnbt-recent';
  function addRecent(name) {
    try {
      const arr = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      const next = [name, ...arr.filter((n) => n !== name)].slice(0, 8);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch (e) { /* ignore */ }
  }
  function recentList() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { return []; }
  }

  // ── compare / diff ──────────────────────────────────────────────────────────

  async function compareFile(file) {
    if (!A.doc || A.doc.kind === 'region') { toast(t('err.parse'), 'err'); return; }
    const buf = new Uint8Array(await file.arrayBuffer());
    const loaded = await ns.codec.loadBuffer(buf);
    if (!loaded.decoded) { toast(t('err.parse'), 'err'); return; }
    const other = loaded.res.root;
    const diffs = ns.diff(A.doc.model, other);
    const changes = diffs.filter((d) => d.kind !== 'same');
    if (changes.length === 0) { toast(t('compare.identical')); return; }
    A.diffResults = changes;
    A.diffFilename = file.name;
    renderDiffPanel();
    toast(tpl('compare.changes', changes.length));
  }

  function renderDiffPanel() {
    if (!A.diffResults) return;
    const box = el2('div');
    box.className = 'diff-panel';
    const head = el2('div');
    head.className = 'diff-head';
    head.textContent = t('compare.title', A.diffFilename || '');
    box.appendChild(head);
    const list = el2('div');
    list.className = 'diff-list';
    for (const d of A.diffResults) {
      const row = el2('button');
      row.className = 'diff-row ' + d.kind;
      const label = el2('span');
      label.className = 'diff-path';
      label.textContent = '/' + d.path.map((s) => String(s)).join('/') || '(root)';
      const badge = el2('span');
      badge.className = 'diff-badge';
      badge.textContent = d.kind;
      row.appendChild(badge);
      row.appendChild(label);
      row.onclick = () => {
        const p = d.path;
        A.selectedPath = p;
        if (A.tree) A.tree.select(p, true);
        closeMenus();
      };
      list.appendChild(row);
    }
    const closeBtn = el2('button');
    closeBtn.className = 'diff-close';
    closeBtn.textContent = t('compare.close');
    closeBtn.onclick = () => {
      A.diffResults = null;
      const p = refs.tree.parentElement.querySelector('.diff-panel');
      if (p) p.remove();
    };
    box.appendChild(list);
    box.appendChild(closeBtn);
    const old = refs.tree.parentElement.querySelector('.diff-panel');
    if (old) old.remove();
    refs.tree.parentElement.appendChild(box);
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
        openChunkDoc(model, chunk.x, chunk.z);
      };
      grid.appendChild(cell);
    }
    box.appendChild(grid);
    // save region button
    const saveBtn = el2('button');
    saveBtn.textContent = t('region.saveBtn');
    saveBtn.style.marginTop = '12px';
    saveBtn.onclick = async () => {
      if (A.doc.kind === 'chunk' && A.doc.region) {
        A.doc.region.setChunkModel(A.doc.x, A.doc.z, A.doc.model, 2);
        toast(t('toast.stagedChunk', A.doc.x, A.doc.z), 'warn');
      }
      const bytes = await A.region.container.pack();
      ns.codec.download(bytes, A.region.filename);
      toast(t('toast.savedRegion'));
    };
    refs.tree.innerHTML = '';
    refs.tree.appendChild(box);
  }

  // ── hex ─────────────────────────────────────────────────────────────────────

  // Interactive hex view: rows clickable → select tag by byte offset; the
  // currently selected tag's byte range is highlighted (mini-map overlay).
  function updateHex() {
    if (!A.hexOn) return;
    if (!A.doc || A.doc.kind === 'region') { refs.hex.textContent = ''; A.hexBytes = null; A.hexRanges = null; return; }
    try {
      const enc = ns.codec.encodeWithOffsets(A.doc.model);
      A.hexBytes = enc.bytes;
      A.hexRanges = enc.ranges;
      renderHex();
    } catch (e) { refs.hex.textContent = '…'; }
  }

  function renderHex() {
    const bytes = A.hexBytes;
    const ranges = A.hexRanges;
    if (!bytes) { refs.hex.textContent = ''; return; }
    const perRow = 16;
    const hex = el2('div');
    hex.className = 'hex-wrap';

    // highlight range for the selected path (deepest)
    let hl = null;
    if (A.selectedPath && ranges) {
      hl = ranges.get(A.selectedPath.join('\u001f')) || null;
    }

    for (let i = 0; i < bytes.length; i += perRow) {
      const row = el2('div');
      row.className = 'hex-row';
      row.dataset.start = i;
      row.dataset.end = Math.min(i + perRow, bytes.length);
      const off = el2('span'); off.className = 'hex-off'; off.textContent = i.toString(16).padStart(6, '0');
      row.appendChild(off);
      const hb = el2('span'); hb.className = 'hex-bytes';
      for (let j = i; j < i + perRow && j < bytes.length; j++) {
        const b = el2('span'); b.className = 'hex-byte';
        b.textContent = bytes[j].toString(16).padStart(2, '0');
        if (hl && j >= hl[0] && j < hl[1]) b.classList.add('hl');
        hb.appendChild(b);
      }
      row.appendChild(hb);
      const ch = el2('span'); ch.className = 'hex-chars';
      for (let j = i; j < i + perRow && j < bytes.length; j++) {
        const c = el2('span'); c.className = 'hex-char';
        c.textContent = (bytes[j] >= 32 && bytes[j] < 127) ? String.fromCharCode(bytes[j]) : '.';
        if (hl && j >= hl[0] && j < hl[1]) c.classList.add('hl');
        ch.appendChild(c);
      }
      row.appendChild(ch);
      row.addEventListener('click', () => onHexClick(Number(row.dataset.start)));
      hex.appendChild(row);
    }
    if (bytes.length === 0) hex.textContent = t('hex.empty');
    refs.hex.textContent = '';
    refs.hex.appendChild(hex);
  }

  // Find the deepest tag range containing `offset`; select it in the tree.
  function onHexClick(offset) {
    if (!A.hexRanges || !A.doc) return;
    let best = null, bestKey = null;
    for (const [key, r] of A.hexRanges) {
      if (offset >= r[0] && offset < r[1]) {
        if (!best || (r[1] - r[0]) < (best[1] - best[0])) { best = r; bestKey = key; }
      }
    }
    if (bestKey === null) return;
    const path = bestKey === '' ? [] : bestKey.split('\u001f');
    A.selectedPath = path;
    if (A.tree) A.tree.select(path, true);
    renderHex();
  }

  // ── status / buttons ────────────────────────────────────────────────────────

  function refreshStatus() {
    const s = refs.status;
    if (!A.doc) {
      s.file.textContent = '—'; s.mode.textContent = ''; s.count.textContent = '';
      s.errors.textContent = ''; s.history.textContent = '';
      return;
    }
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

  // ── export base64 / python ──────────────────────────────────────────────────

  async function exportCurrentBase64() {
    if (!A.doc || A.doc.kind === 'region') return;
    try {
      const raw = await ns.codec.compileModel(A.doc.model, 'none');
      const text = ns.codec.bytesToB64(raw);
      ns.codec.download(new TextEncoder().encode(text), A.doc.filename.replace(/\.[^.]+$/, '') + '.b64', 'text/plain');
    } catch (e) { toast(t('err.importFailed', String(e)), 'err'); }
  }

  async function copyPython() {
    if (!A.doc || A.doc.kind === 'region') return;
    try {
      const raw = await ns.codec.compileModel(A.doc.model, 'none');
      const b64 = ns.codec.bytesToB64(raw);
      const py = [
        '# Generated by webNBT',
        'import base64',
        'import nbtlib',
        'raw = base64.b64decode("' + b64 + '")',
        'root = nbtlib.File.parse_nbt(raw)',
        '',
      ].join('\n');
      await navigator.clipboard.writeText(py);
      toast('Python');
    } catch (e) { toast(t('err.importFailed', String(e)), 'err'); }
  }

  async function copyB64SNBT() {
    if (!A.doc || A.doc.kind === 'region') return;
    try {
      const text = ns.toSNBT(A.doc.model, {});
      const b64 = btoa(unescape(encodeURIComponent(text)));
      await navigator.clipboard.writeText(b64);
      toast('SNBT·b64');
    } catch (e) { toast(t('err.importFailed', String(e)), 'err'); }
  }

  async function importText(file) {
    const text = await file.text();
    try {
      const tag = ns.parseSNBT(text);
      openDoc(newDoc('nbt', { filename: file.name.replace(/\.(snbt|txt|nbt)$/i, '.dat'), model: tag, mode: 'gzip' }));
      toast(t('toast.importedSNBT'));
    } catch (e) {
      try {
        const obj = JSON.parse(text);
        const tag = ns.fromJSON(obj);
        openDoc(newDoc('nbt', { filename: file.name.replace(/\.json$/i, '.dat'), model: tag, mode: 'gzip' }));
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
      { label: t('formats.exportBase64'), action: exportCurrentBase64 },
      { sep: true },
      { label: t('formats.copyPython'), action: copyPython },
      { label: t('formats.exportB64SNBT'), action: copyB64SNBT },
      { sep: true },
      { label: t('formats.compare'), action: () => refs.fileCompare.click() },
      { label: t('formats.import'), action: () => refs.file.click() },
    ];
    const recents = recentList();
    if (recents.length) {
      items.push({
        label: t('formats.recent'), submenu: [
          recents.map((name) => ({ label: name, action: () => { toast(name); } })),
        ],
      });
    }
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

  const THEMES = ['dark', 'light', 'sepia', 'gruvbox', 'contrast'];
  function applyTheme() {
    document.documentElement.dataset.theme = A.theme;
    try { localStorage.setItem('webnbt-theme', A.theme); } catch (e) {}
  }

  function showThemeMenu(x, y) {
    const items = THEMES.map((th) => ({
      label: t('theme.' + th),
      action: () => { A.theme = th; applyTheme(); },
    }));
    items.push({ sep: true });
    items.push({
      label: t('theme.accent'),
      submenu: [['#4da3ff', '#1f6feb', '#3fb950', '#d29922', '#f85149', '#b483ff', '#00b8a9', '#f0c674'].map((c) => ({
        label: '■ ' + c, icon: '<span class="icon" style="color:' + c + '">■</span>',
        action: () => {
          document.documentElement.style.setProperty('--accent', c);
          try { localStorage.setItem('webnbt-accent', c); } catch (e) {}
        },
      }))],
    });
    items.push({ sep: true });
    items.push({
      label: t('theme.resetAccent'),
      action: () => {
        document.documentElement.style.removeProperty('--accent');
        try { localStorage.removeItem('webnbt-accent'); } catch (e) {}
      },
    });
    showMenu(x, y, items);
  }

  // ── autosave ────────────────────────────────────────────────────────────────

  let autosaveTimer = null;
  function startAutosave() {
    if (autosaveTimer) return;
    autosaveTimer = setInterval(() => {
      if (A.doc && A.doc.kind !== 'region') saveSnapshot('webnbt-autosave');
    }, 120000);
  }

  // ── events ──────────────────────────────────────────────────────────────────

  function wire() {
    $('#btn-open').onclick = () => refs.file.click();
    $('#btn-save').onclick = saveDoc;
    $('#btn-undo').onclick = () => { undo(); A.refreshButtons && A.refreshButtons(); };
    $('#btn-redo').onclick = () => { redo(); };
    $('#btn-delete').onclick = () => {
      if (A.tree && A.tree.multiSel && A.tree.multiSel.size) { deleteMulti(); return; }
      A.selectedPath && deleteTag(A.selectedPath);
    };
    $('#btn-duplicate').onclick = () => {
      if (A.tree && A.tree.multiSel && A.tree.multiSel.size) { duplicateMulti(); return; }
      const tag = currentTag();
      if (tag && A.selectedPath) duplicateTag(tag, A.selectedPath);
    };
    $('#btn-history').onclick = (e) => {
      const r = e.target.getBoundingClientRect();
      showHistoryMenu(r.left, r.bottom);
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
    $('#btn-theme').onclick = (e) => {
      const r = e.target.getBoundingClientRect();
      showThemeMenu(r.left, r.bottom);
    };
    $('#btn-types').onclick = (e) => {
      const on = !ns.I18N.localizeTypes;
      ns.I18N.setLocalizeTypes(on);
      e.target.classList.toggle('active', on);
    };
    $('#btn-export').onclick = (e) => {
      const r = e.target.getBoundingClientRect();
      showFormatsMenu(r.left, r.bottom);
    };
    $('#btn-collapse').onclick = collapseAll;
    $('#btn-expand').onclick = expandAll;
    $('#btn-goto').onclick = goToPath;
    $('#btn-bookmarks').onclick = (e) => {
      const r = e.target.getBoundingClientRect();
      showBookmarksMenu(r.left, r.bottom);
    };

    refs.file.addEventListener('change', (e) => {
      for (const f of e.target.files) openFile(f);
      refs.file.value = '';
    });

    refs.fileCompare.addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (f) compareFile(f);
      refs.fileCompare.value = '';
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
      const k = e.key.toLowerCase();
      if (mod && k === 'o') { e.preventDefault(); refs.file.click(); }
      else if (mod && k === 's') { e.preventDefault(); saveDoc(); }
      else if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (mod && k === 'y') { e.preventDefault(); redo(); }
      else if (mod && k === 'c' && e.shiftKey) { e.preventDefault(); if (A.selectedPath) copyTagPath(A.selectedPath); }
      else if (mod && k === 'c') { const t = currentTag(); if (t) copyTag(t); }
      else if (mod && k === 'v') { if (A.selectedPath) pasteAfter(A.selectedPath); }
      else if (mod && k === 'p') { e.preventDefault(); goToPath(); }
      else if (mod && k === 'g') { e.preventDefault(); goToOffset(); }
      else if (mod && e.key === 'Tab') { e.preventDefault(); cycleDoc(e.shiftKey ? -1 : 1); }
      else if (mod && k === '[') { e.preventDefault(); collapseAll(); }
      else if (mod && k === ']') { e.preventDefault(); expandAll(); }
      else if (e.altKey && /^[1-9]$/.test(e.key) && A.docs.length) {
        e.preventDefault();
        const i = Number(e.key) - 1;
        if (A.docs[i]) switchDoc(A.docs[i]);
      }
      else if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); if (A.selectedPath) moveTagOrder(A.selectedPath, -1); }
      else if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); if (A.selectedPath) moveTagOrder(A.selectedPath, 1); }
      else if (e.altKey && ALT_TYPE[k]) { e.preventDefault(); addTypedTag(ALT_TYPE[k]); }
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (A.tree && A.tree.multiSel && A.tree.multiSel.size) deleteMulti();
        else if (A.selectedPath && A.selectedPath.length) deleteTag(A.selectedPath);
      }
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
    try { const saved = localStorage.getItem('webnbt-theme'); if (saved && THEMES.indexOf(saved) >= 0) A.theme = saved; } catch (e2) {}
    applyTheme();
    try {
      const accent = localStorage.getItem('webnbt-accent');
      if (accent) document.documentElement.style.setProperty('--accent', accent);
    } catch (e2) {}

    window.addEventListener('beforeunload', () => saveSnapshot('webnbt-session'));
    window.addEventListener('pagehide', () => saveSnapshot('webnbt-session'));
    startAutosave();
  }

  // ── session snapshot (beforeunload → restore) ───────────────────────────────

  function saveSnapshot(key) {
    try {
      if (!A.doc || A.doc.kind === 'region') { localStorage.removeItem(key); return; }
      const snap = {
        filename: A.doc.filename,
        model: A.doc.model,
        mode: A.doc.mode,
        hist: A.hist,
        future: A.future,
        selected: A.selectedPath,
        ts: Date.now(),
      };
      const s = JSON.stringify(snap, (k, v) => typeof v === 'bigint' ? v.toString() + 'n' : v);
      if (s.length > 2 * 1024 * 1024) return; // skip oversized
      localStorage.setItem(key, s);
    } catch (e) { /* ignore */ }
  }

  function restoreSnapshot() {
    const keys = ['webnbt-session', 'webnbt-autosave'];
    for (const key of keys) {
      try {
        const s = localStorage.getItem(key);
        if (!s) continue;
        localStorage.removeItem(key);
        const snap = JSON.parse(s, (k, v) => typeof v === 'string' && /^-?\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v);
        if (!snap || !snap.model) continue;
        openDoc(newDoc('nbt', { filename: snap.filename || 'restored.dat', model: snap.model, mode: snap.mode || 'gzip' }));
        A.hist = snap.hist || []; A.future = snap.future || [];
        A.selectedPath = snap.selected || null;
        toast('♻ ' + (snap.filename || 'Session'));
        return true;
      } catch (e) { /* ignore */ }
    }
    return false;
  }

  // ── bookmarks menu ──────────────────────────────────────────────────────────

  function showBookmarksMenu(x, y) {
    const arr = loadBookmarks();
    if (!arr.length) { toast(t('toast.noBookmarks'), 'warn'); return; }
    const items = arr.map((key) => {
      const path = key ? key.split('\u001f') : [];
      return {
        label: '/' + path.map((s) => String(s)).join('/') || '(root)',
        action: () => {
          if (A.doc && ns.getByPath(A.doc.model, path) !== undefined) selectPath(path);
          else toast(t('toast.bmMissing'), 'warn');
        },
      };
    });
    items.push({ sep: true });
    items.push({ label: t('bookmarks.clear'), danger: true, action: () => { saveBookmarks([]); toast(t('toast.bmCleared')); } });
    showMenu(x, y, items);
  }

  // ── history panel (click a past state to revert) ──────────────────────────

  function showHistoryMenu(x, y) {
    if (!A.doc || A.doc.kind === 'region') return;
    const hist = A.hist;
    const items = [];
    const snapCount = Math.min(20, hist.length);
    for (let i = 0; i < snapCount; i++) {
      const idx = hist.length - 1 - i;
      const label = t('history.entry', idx + 1);
      items.push({
        label: label + (i === 0 ? ' — ' + t('history.undo') : ''),
        action: () => revertTo(idx),
      });
    }
    if (!items.length) { toast(t('history.empty'), 'warn'); return; }
    items.push({ sep: true });
    items.push({ label: t('history.clear'), danger: true, action: () => { A.hist = []; A.future = []; A.refreshHistory(); A.refreshButtons(); toast(t('history.cleared')); } });
    showMenu(x, y, items);
  }

  function revertTo(idx) {
    if (!A.doc || idx < 0 || idx >= A.hist.length) return;
    A.future = A.hist.slice(idx).reverse().concat(A.future);
    A.doc.model = A.hist[idx];
    A.hist = A.hist.slice(0, idx);
    A.refreshAll();
  }

  // ── URL file param (#file=...) ──────────────────────────────────────────────

  async function loadFromUrl(url) {
    let buf;
    try {
      if (url.startsWith('data:')) {
        const res = await fetch(url);
        buf = new Uint8Array(await res.arrayBuffer());
      } else {
        // same-origin (or CORS-enabled) fetch; fall back to window.open on failure
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        buf = new Uint8Array(await res.arrayBuffer());
      }
    } catch (e) {
      toast(t('err.parse'), 'err');
      return;
    }
    const name = decodeURIComponent(url.split('/').pop().split('#')[0].split('?')[0]) || 'remote.dat';
    const blob = new Blob([buf], { type: 'application/octet-stream' });
    const file = new File([blob], name);
    await openFile(file);
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
    restoreSnapshot();
    try {
      const m = location.hash.match(/^#file=(.+)$/);
      if (m && m[1]) await loadFromUrl(m[1]);
    } catch (e) { /* ignore */ }
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
    get tree() { return A.tree; },
    get doc() { return A.doc; },
  };
})(window.NBT || {});

window.addEventListener('DOMContentLoaded', () => {
  window.App.boot();
  // PWA: register service worker (http(s) only; file:// has no SW)
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    try {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    } catch (e) { /* ignore */ }
  }
});