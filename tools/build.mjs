// Bundle the editor into one self-contained HTML file (three.js, CSS, scene scripts and thumbnails inlined).
//   node tools/build.mjs [--scene file] [--out dist/index.html] [--no-minify]
// By default every map in maps.js goes in, behind the start screen (thumbnails become data URLs). --scene
// builds a page with just that one scene and no start screen.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import vm from 'node:vm';
import * as esbuild from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values: opt } = parseArgs({ options: {
  scene: { type: 'string' },
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
// a scene script, tagged with its file name so the build report's line numbers still point into it
const sceneTag = (file, as) => `<script>${inlineScript(readFileSync(resolve(ROOT, file), 'utf8'), file)}\n//# sourceURL=${as || file}\n</script>`;

const { outputFiles } = await esbuild.build({
  entryPoints: [resolve(ROOT, 'src/main.js')], bundle: true, format: 'iife', target: 'es2020',
  minify: !opt['no-minify'], legalComments: 'none', write: false, logLevel: 'warning'
});
const engine = outputFiles[0].text;
const css = readFileSync(resolve(ROOT, 'src/styles/main.css'), 'utf8');

let scenes, what;
if (opt.scene) {
  // one scene, registered under 'scene' (the page's default id): no maps, so no start screen
  scenes = sceneTag(opt.scene, 'scene.js'); what = opt.scene;
} else {
  let maps = [];
  vm.runInNewContext(readFileSync(resolve(ROOT, 'maps.js'), 'utf8'), { defineMaps: list => { maps = list; } }, { filename: 'maps.js' });
  const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
  const inlined = maps.map(m => {
    const f = m.thumb && resolve(ROOT, m.thumb);
    return Object.assign({}, m, { thumb: f && existsSync(f) ? `data:${mime[extname(f)] || 'image/jpeg'};base64,${readFileSync(f).toString('base64')}` : null });
  });
  scenes = `<script>window.defineMaps(${JSON.stringify(inlined)});</script>\n`
    + maps.map(m => `<script>window.__scenePending = ${JSON.stringify(m.id)};</script>\n${sceneTag(m.file)}`).join('\n')
    + `\n<script>window.__scenePending = 'scene';</script>`;
  what = `${maps.length} maps from maps.js`;
}

let html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
html = replaceOnce(html, '<link rel="stylesheet" href="src/styles/main.css">', `<style>\n${css}</style>`);
html = replaceOnce(html, /<!-- dev only:[^\n]*-->\n<script type="importmap">[\s\S]*?<\/script>\n/, '');
html = replaceOnce(html, '<script src="maps.js"></script>', scenes);
html = replaceOnce(html, '<script type="module" src="src/main.js"></script>', `<script>${inlineScript(engine, 'engine bundle')}</script>`);

const out = resolve(ROOT, opt.out);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`built ${opt.out} (${(html.length / 1024).toFixed(0)} KB) from ${what}`);
