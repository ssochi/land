// Bundle the editor into one self-contained HTML file (three.js, CSS and the scene script inlined).
//   node tools/build.mjs [--scene scene.js] [--out dist/index.html] [--no-minify]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import * as esbuild from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values: opt } = parseArgs({ options: {
  scene: { type: 'string', default: 'scene.js' },
  out: { type: 'string', default: 'dist/index.html' },
  'no-minify': { type: 'boolean', default: false }
} });

// replace exactly one occurrence of `find` (string or regex) or fail loudly if index.html drifted
function replaceOnce(html, find, repl) {
  const hits = typeof find === 'string' ? html.split(find).length - 1 : (html.match(new RegExp(find.source, 'g')) || []).length;
  if (hits !== 1) throw new Error(`build: expected one match for ${find} in index.html, found ${hits}`);
  return html.replace(find, () => repl);
}
const inlineScript = (js, what) => {
  if (/<\/script/i.test(js)) throw new Error(`build: ${what} contains "</script"`);
  return js;
};

const { outputFiles } = await esbuild.build({
  entryPoints: [resolve(ROOT, 'src/main.js')], bundle: true, format: 'iife', target: 'es2020',
  minify: !opt['no-minify'], legalComments: 'none', write: false, logLevel: 'warning'
});
const engine = outputFiles[0].text;
const css = readFileSync(resolve(ROOT, 'src/styles/main.css'), 'utf8');
const scene = readFileSync(resolve(ROOT, opt.scene), 'utf8');

let html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
html = replaceOnce(html, '<link rel="stylesheet" href="src/styles/main.css">', `<style>\n${css}</style>`);
html = replaceOnce(html, /<!-- dev only:[^\n]*-->\n<script type="importmap">[\s\S]*?<\/script>\n/, '');
// sourceURL keeps scene.js line numbers in error stacks, which the build report relies on
html = replaceOnce(html, '<script src="scene.js"></script>', `<script>${inlineScript(scene, opt.scene)}\n//# sourceURL=scene.js\n</script>`);
html = replaceOnce(html, '<script type="module" src="src/main.js"></script>', `<script>${inlineScript(engine, 'engine bundle')}</script>`);

const out = resolve(ROOT, opt.out);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`built ${opt.out} (${(html.length / 1024).toFixed(0)} KB) from ${opt.scene}`);
