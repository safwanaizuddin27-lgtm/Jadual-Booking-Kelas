// 5 Sigma Class Hub · Langit 5Σ — zero-dependency build.
//
//   node build.mjs              → docs/            deployable static site
//                                                  (GitHub Pages, Netlify, Vercel, or open from disk)
//   node build.mjs --artifact   → dist-artifact/   one self-contained page for claude.ai hosting
//
// The source is standard ES modules (src/js) so it runs as-is during development.
// This script bundles those modules into one classic script, which is what lets the
// built site work even when index.html is opened straight from disk (file://).
//
// Module rules the bundler relies on (kept by every file in src/js):
//   import { a, b as c } from './x.js';                 named imports only, one statement per line
//   export function / async function / const / let / class   (no default exports, no export lists)

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative, extname } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = dirname(new URL(import.meta.url).pathname);
const SRC = join(ROOT, 'src');
const ARTIFACT = process.argv.includes('--artifact');
const OUT = join(ROOT, ARTIFACT ? 'dist-artifact' : 'docs');

/* ------------------------------------------------------------------ JS bundle */
const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*['"](.+?)['"];?\s*$/;
const EXPORT_DECL_RE = /^export\s+(async\s+function\s*\*?|function\s*\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/;

function bundle(entry) {
  const modules = new Map();
  const order = [];

  function load(file, stack = []) {
    if (modules.has(file)) return modules.get(file);
    if (stack.includes(file)) throw new Error('Circular import: ' + [...stack, file].map(f => relative(SRC, f)).join(' → '));
    const src = readFileSync(file, 'utf8');
    const mod = { id: modules.size, file, imports: [], exports: [], body: [] };
    modules.set(file, mod);
    for (const line of src.split('\n')) {
      const imp = line.match(IMPORT_RE);
      if (imp) {
        const target = resolve(dirname(file), imp[2]);
        const names = imp[1].split(',').map(s => s.trim()).filter(Boolean).map(s => {
          const [orig, alias] = s.split(/\s+as\s+/);
          return { orig: orig.trim(), alias: (alias || orig).trim() };
        });
        mod.imports.push({ target, names });
        continue;
      }
      if (/^\s*import\s/.test(line) && !/^\s*import\(/.test(line)) {
        throw new Error(`Unsupported import form in ${relative(SRC, file)}: ${line}`);
      }
      const exp = line.match(EXPORT_DECL_RE);
      if (exp) {
        mod.exports.push(exp[2]);
        mod.body.push(line.replace(/^export\s+/, ''));
        continue;
      }
      if (/^export\s/.test(line)) throw new Error(`Unsupported export form in ${relative(SRC, file)}: ${line}`);
      mod.body.push(line);
    }
    for (const imp of mod.imports) load(imp.target, [...stack, file]);
    order.push(mod);
    return mod;
  }

  load(resolve(entry));

  const parts = [];
  for (const mod of order) {
    const header = mod.imports.map(imp => {
      const dep = modules.get(imp.target);
      for (const n of imp.names) {
        if (!dep.exports.includes(n.orig)) {
          throw new Error(`${relative(SRC, mod.file)} imports "${n.orig}" but ${relative(SRC, dep.file)} does not export it`);
        }
      }
      const binds = imp.names.map(n => (n.orig === n.alias ? n.orig : `${n.orig}: ${n.alias}`)).join(', ');
      return `  const { ${binds} } = __m${dep.id};`;
    }).join('\n');
    parts.push(
      `/* ── ${relative(SRC, mod.file)} ── */\n` +
      `const __m${mod.id} = (() => {\n${header}\n${mod.body.join('\n')}\n  return { ${mod.exports.join(', ')} };\n})();`
    );
  }
  return { code: `/*! 5 Sigma Class Hub · Langit 5Σ */\n(() => {\n'use strict';\n${parts.join('\n\n')}\n})();\n`, count: order.length };
}

/* A careful, line-based shrink: whole-line comments and indentation only. Nothing inside
   a line is touched, so strings, regexes and template literals keep their meaning. */
function shrinkJs(code) {
  const out = [];
  let inBlock = false;
  for (const raw of code.split('\n')) {
    const line = raw.trim();
    if (inBlock) {
      const end = line.indexOf('*/');
      if (end === -1) continue;
      inBlock = false;
      const rest = line.slice(end + 2).trim();
      if (rest) out.push(rest);
      continue;
    }
    if (line.startsWith('/*') && !line.startsWith('/*!')) {
      const end = line.indexOf('*/', 2);
      if (end === -1) { inBlock = true; continue; }
      if (end !== line.length - 2) out.push(line);   // code follows the comment: keep the line
      continue;
    }
    if (line.startsWith('//')) continue;
    if (!line) continue;
    out.push(line);
  }
  return out.join('\n') + '\n';
}

/* ----------------------------------------------------------------- CSS bundle */
function cssFiles() {
  return readdirSync(join(SRC, 'css')).filter(f => f.endsWith('.css')).sort();
}
function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};,>~])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}
const MIME = { '.woff': 'font/woff', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
function inlineAssets(css) {
  // url("../assets/x") → data: URI, so the artifact page needs no extra requests.
  return css.replace(/url\((["']?)\.\.\/assets\/([^"')]+)\1\)/g, (_, q, p) => {
    const file = join(SRC, 'assets', p);
    const mime = MIME[extname(file)] || 'application/octet-stream';
    return `url("data:${mime};base64,${readFileSync(file).toString('base64')}")`;
  });
}

/* --------------------------------------------------------------------- write */
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const { code: jsFull, count } = bundle(join(SRC, 'js', 'main.js'));
const js = shrinkJs(jsFull);
let css = cssFiles().map(f => `/* ${f} */\n` + readFileSync(join(SRC, 'css', f), 'utf8')).join('\n');
css = ARTIFACT ? inlineAssets(css) : css.replace(/url\((["']?)\.\.\/assets\//g, 'url($1assets/');
const cssMin = minifyCss(css);
const ver = createHash('sha256').update(js + cssMin).digest('hex').slice(0, 10);

let html = readFileSync(join(SRC, 'index.html'), 'utf8');

if (ARTIFACT) {
  // claude.ai wraps the page in its own <!doctype>/<head>/<body>: ship the inner part only,
  // with <title> and <style> first, and everything inline.
  const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1]
    .replace(/<!-- @js -->/, `<script>\n${js.replace(/<\/script/gi, '<\\/script')}</script>`);
  html = `${title}\n<meta name="langit-host" content="artifact">\n<style>${cssMin}</style>\n${body.trim()}\n`;
  writeFileSync(join(OUT, 'index.html'), html);
} else {
  html = html
    .replace(/<!-- @css -->/, `<link rel="stylesheet" href="app.css?v=${ver}">`)
    .replace(/<!-- @js -->/, `<script src="app.js?v=${ver}"></script>`);
  writeFileSync(join(OUT, 'index.html'), html);
  writeFileSync(join(OUT, 'app.js'), js);
  writeFileSync(join(OUT, 'app.css'), cssMin);
  cpSync(join(SRC, 'assets'), join(OUT, 'assets'), { recursive: true });
  for (const f of ['manifest.webmanifest', 'sw.js', '404.html', '.nojekyll']) {
    if (existsSync(join(SRC, f))) {
      let text = readFileSync(join(SRC, f), 'utf8');
      if (f === 'sw.js') text = text.replace('__BUILD_VERSION__', ver);
      writeFileSync(join(OUT, f), text);
    }
  }
}

const kb = p => (statSync(join(OUT, p)).size / 1024).toFixed(1) + ' KB';
console.log(`built ${relative(ROOT, OUT)}/  version ${ver}  (${count} modules)`);
if (ARTIFACT) console.log(`  index.html ${kb('index.html')} (self-contained)`);
else console.log(`  index.html ${kb('index.html')} · app.js ${kb('app.js')} · app.css ${kb('app.css')}`);
