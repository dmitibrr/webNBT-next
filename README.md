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
- **Interactive hex mini-map** — click any hex row to jump straight to that tag in the tree; selecting a tag highlights its exact byte range.
- **Structured search** — plain text search, plus `/path/with/*/globs` (with `**`) and `@Type` filters.
- **Compare two NBT files** — load a second file from the Formats menu and get a color-coded structural diff (add/remove/change) with click-to-jump.
- **Cross-window drag & drop** — drag a tag from one tab/window and drop it into another to import it.
- **Session restore** — your document, undo history and selection survive a reload / tab close.
- **Chunk tabs** — every chunk opened from a region becomes a tab; switch with `Alt+1..9`.
- **Document tabs** — open many NBT/region files side by side; switch with `Ctrl+Tab` or `Alt+1..9`, close with ✕.
- **Multi-select** — `Ctrl+Click` tags to select a group; delete / duplicate / rename-with-prefix in one go.
- **Bookmarks** — pin paths with the ★ button or context menu; jump back instantly (persisted).
- **Undo history panel** — browse past states and click to revert (🕘).
- **Clickable breadcrumbs** — the inspector path is navigable segment by segment.
- **Copy path / export tag** — `Ctrl+Shift+C` copies a tag's path; the context menu exports any tag as a standalone `.dat`.
- **Move tags** — `Alt+↑/↓` (or the context menu) reorder siblings; `Ctrl+P` jumps to a path, `Ctrl+G` to a hex offset; `Ctrl+[` / `Ctrl+]` collapse / expand the whole tree.
- **Quick-create shortcuts** — `Alt+B/S/I/L/F/D/T` (and more) insert a tag of that type in the selected container.
- **MC-aware validation** — inline warnings for out-of-range numbers, slot/count limits, namespace-less ids and BlockPos parity.
- **Live SNBT preview** — toggle a highlighted SNBT view of the selected tag right in the inspector.
- **Themes & accent** — dark, light, sepia, gruvbox and high-contrast, with a pickable accent color.
- **Recent files** menu (last 8, persisted) and extra exports: raw NBT as base64, Python (`nbtlib`) snippet, SNBT-as-base64.
- **Chunk validation** — warns before saving if palette / BlockStates / entity data looks inconsistent.
- **Installable PWA** — manifest + service worker + icon; offline-capable on HTTPS.
- **Live hex view**, search across tags, drag & drop reordering, context menus, keyboard shortcuts (Ctrl+O/S/Z/Y, Del), undo/redo history, dark & light themes.
- **Fully offline** — no CDN, no external requests. Works from `file://`, any static host, or as a single HTML file.
- **5 UI languages** — English, Español, Русский, 中文, 日本語 (auto-detected from your browser; switch anytime in the top bar, persisted in `localStorage`). All five are LTR scripts, so the layout is designed **left-to-right only** — RTL (Arabic / Hebrew / Persian) is a conscious non-goal for now.
- **Shareable URLs** — `?lang=es` pins the language and `#file=<url-or-data-uri>` opens a remote file on load.

## Releases

Every release ships ready-to-use builds as GitHub Assets:

| Channel | Tag | Artifacts |
| --- | --- | --- |
| **Stable** | `v1.0.0` and later | `webnbt-next-vX.Y.Z.zip` (folder build) + `webnbt.html` (single file) |
| **Pre-release / beta** | `vX.Y.Z-beta.N` | same artifacts, marked "Pre-release" on GitHub |

Download from the [Releases page](https://github.com/dmitibrr/webNBT-next/releases), unzip, and open `index.html` (or the single `webnbt.html`) — no install, fully offline.

## Quick start

| Build | How |
| --- | --- |
| Folder build | open `dist/index.html` in any modern browser (committed in the repo) |
| Single file | open `dist/webnbt.html` (everything inline, ~200 KB) — share it anywhere |
| Release asset | grab the zip from [Releases](https://github.com/dmitibrr/webNBT-next/releases) |
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

`dist/` is committed to the repo, so the Quick start works straight from a clone; rebuild it whenever `web-app/` changes.

### Layout

```
web-app/            dev app (file:// friendly)
  index.html        UI shell (loads NBT.js + src/*.js)
  style/app.css     dark/light theme
  src/              model · codec · format · region · mcdata · treeview · inspector · app
  NBT.js            built wasm codec (createNBTModule)
nbt-utils/          C++ codec sources (decode/encode via base64, WASM_BIGINT)
tools/build.js      dist builder (no deps)
tools/deploy.sh     gh-pages publisher
dist/               committed build: index.html folder build + webnbt.html single-file
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

## Making a release

```sh
node tools/build.js                                  # refresh dist/
git add -A && git commit -m "release v1.2.0"         # bump version first
git push origin master

git tag v1.2.0 && git push origin v1.2.0             # stable tag
# or for a beta:
git tag v1.2.0-beta.1 && git push origin v1.2.0-beta.1

# attach dist/ as release assets (single file + zip) via the GitHub UI
# or: gh release create v1.2.0 dist/webnbt.html "dist/zip" --notes "..."
```

Mark beta tags as **Pre-release** on the GitHub Releases page so they sort below stable releases.

## License

MIT (inherited from the original [webNBT](https://github.com/iRath96/webNBT) project).