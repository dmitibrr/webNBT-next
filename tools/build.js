#!/usr/bin/env node
/* Build script: produces dist/ — a folder build and a single-file webnbt.html.
 * No dependencies, plain Node. Run: node tools/build.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'web-app');
const DIST = path.join(ROOT, 'dist');

const SCRIPT_ORDER = [
  'src/model.js', 'src/codec.js', 'src/format.js', 'src/region.js', 'src/mcdata.js',
  'src/treeview.js', 'src/inspector.js', 'src/app.js',
];

function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }
function cp(src, dst) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); }

function inlinedScripts() {
  return SCRIPT_ORDER.map((rel) => {
    const code = fs.readFileSync(path.join(SRC, rel), 'utf8');
    return '/* ===== ' + rel + ' ===== */\n' + code;
  }).join('\n\n');
}

function build() {
  // 1. folder build — web-app is already file://-friendly, copy as-is
  rmrf(DIST);
  fs.mkdirSync(path.join(DIST, 'style'), { recursive: true });
  fs.mkdirSync(path.join(DIST, 'src'), { recursive: true });

  cp(path.join(SRC, 'index.html'), path.join(DIST, 'index.html'));
  cp(path.join(SRC, 'style', 'app.css'), path.join(DIST, 'style', 'app.css'));
  cp(path.join(SRC, 'NBT.js'), path.join(DIST, 'NBT.js'));
  for (const rel of SCRIPT_ORDER) cp(path.join(SRC, rel), path.join(DIST, rel));

  // 2. single-file build — inline css + all scripts into one html
  const css = fs.readFileSync(path.join(SRC, 'style', 'app.css'), 'utf8');
  const nbtjs = fs.readFileSync(path.join(SRC, 'NBT.js'), 'utf8');
  const index = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');

  let html = index
    .replace(/<link rel="stylesheet" href="style\/app\.css" \/>/,
      '<style>\n' + css + '\n</style>')
    .replace(/<script src="NBT\.js"><\/script>/, '')
    .replace('<script src="src/model.js"></script>', '<script>\n' + nbtjs + '\n</script>\n  <script>\n' + inlinedScripts() + '\n</script>');

  fs.writeFileSync(path.join(DIST, 'webnbt.html'), html);
  fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

  // sizes
  const folder = (fs.statSync(path.join(DIST, 'index.html')).size +
    fs.statSync(path.join(DIST, 'NBT.js')).size +
    fs.statSync(path.join(DIST, 'style', 'app.css')).size +
    SCRIPT_ORDER.reduce((a, r) => a + fs.statSync(path.join(DIST, r)).size, 0));
  const single = fs.statSync(path.join(DIST, 'webnbt.html')).size;

  console.log('dist/ built');
  console.log('  folder build : ' + (folder / 1024).toFixed(1) + ' KB (index.html + NBT.js + css + src/)');
  console.log('  single file  : ' + (single / 1024).toFixed(1) + ' KB (webnbt.html)');
}

build();