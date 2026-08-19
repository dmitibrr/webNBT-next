# webNBT-next

**An HTML5 NBT editor built on WebAssembly — a modernized fork of [iRath96/webNBT](https://github.com/iRath96/webNBT).**

Edit Minecraft NBT files (level.dat, player data, schematics, structure blocks, chunk/region `.mca`/`.mcr`) directly in the browser. No server, no install, no upload — everything runs locally on your machine.

> **Live demo:** https://dmitibrr.github.io/webNBT-next/

## Features

- **Pure browser NBT** — the codec is a tiny C++ (Emscripten) core; compression (gzip / zlib / raw deflate) uses native `CompressionStream`.
- **Automatic detection** of gzip, zlib, raw-deflate and uncompressed files — just drop a file.
- **Full tag support** — Byte, Short, Int, **Long (BigInt, exact)**, Float, Double, String, ByteArray, IntArray, LongArray, List, Compound.
- **SNBT ↔ NBT** import/export (stringify with indentation, parse tolerant inputs, `true`/`false` literals).
- **JSON ↔ NBT** import/export (typed round-trip: `Long`, arrays, strings stay intact).
- **Region files (`.mca` / `.mcr`)** — read the chunk index, probe individual chunks, edit one, and repack aligned to the original 4096-byte sector layout.
- **Smart structure views** — recognize BlockEntity / ItemStack / Inventory / StructureData blocks (legacy numeric block palette for `BlockID` → name).
- **Live hex view**, search across tags, drag & drop reordering, context menus, keyboard shortcuts (Ctrl+O/S/Z/Y, Del), undo/redo history, dark & light themes.
- **Fully offline** — no CDN, no external requests. Works from `file://`, any static host, or as a single HTML file.

## Quick start

| Build | How |
| --- | --- |
| Folder build | open `dist/index.html` in any modern browser |
| Single file | open `dist/webnbt.html` (everything inline, ~200 KB) — share it anywhere |
| Dev | open `web-app/index.html` directly |

Works in Chrome, Edge, Firefox and Safari (needs `CompressionStream`, `BigInt`, `File`).

## Usage

1. **Open** a file — toolbar button, `Ctrl+O`, or drop it anywhere on the page.
   - `.dat`, `.schematic`, `.nbt`, any gzip/zlib/raw/uncompressed NBT → opens as a tag tree.
   - `.mca` / `.mcr` → opens a region grid; click a chunk to edit it.
2. **Edit** — click a tag in the tree to open the inspector panel; rename keys, change values, reorder with drag & drop, add/duplicate/delete tags from the `＋` menu or right-click.
3. **Save** — `Ctrl+S` (or Save). Region chunks are staged; save the region file to write them back.
4. **Formats** — the `⇅ Formats` menu imports/exports SNBT and JSON.

## Build from source

Requires [Emscripten](https://emscripten.org/) (SDK activated, `em++` on PATH) and Node ≥ 18.

```sh
# 1. build the wasm codec
make build              # → web-app/NBT.js (self-contained, wasm embedded)

# 2. build dist/ (folder build + single-file webnbt.html)
node tools/build.js

# 3. optional: run the smoke tests (needs Node with CompressionStream, e.g. Node ≥ 22)
node /tmp/opencode/smoke-test.js   # jsdom-based UI smoke test
```

### Layout

```
web-app/            dev app (file:// friendly)
  index.html        UI shell
  style/app.css     dark/light theme
  src/              model · codec · format · region · mcdata · treeview · inspector · app
  NBT.js            built wasm codec (createNBTModule)
nbt-utils/          C++ codec sources (decode/encode via base64, WASM_BIGINT)
tools/build.js      dist builder (no deps)
dist/               generated: index.html folder build + webnbt.html single-file
```

## Architecture

- **Model** is plain JS: `{ t, n, v, et? }`. Compound `v = [[key, child], …]` (order preserved), ByteArray is base64, LongArray/Long use BigInt.
- **Wasm codec** (`nbt-utils/`) is a pure (de)serializer with lenient parsing; byte transport is base64 to avoid UTF-8 mangling. `WASM_BIGINT` keeps `long` exact.
- **Compression** lives in JS (`CompressionStream`/`DecompressionStream`) so the wasm stays small.
- No ES modules, no CDN — classic scripts keep `file://` support.

## Deploy to GitHub Pages

```sh
npm run deploy        # builds dist/ and pushes it to the gh-pages branch
```

(The gh-pages branch contains only `dist/` contents plus `.nojekyll`.)

## License

MIT (inherited from the original [webNBT](https://github.com/iRath96/webNBT) project).