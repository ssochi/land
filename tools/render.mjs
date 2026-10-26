// Headless render loop for agents: build a scene, write report.json and one PNG per camera.
//
//   node tools/render.mjs [camera ...] [--scene scene.js] [--out out] [--view N] [--size WxH] [--eval "js"]...
//                         [--page dist/index.html]
//
// Cameras are preset names or JSON specs ('{"name":"close","at":[-12,-22],"eye":2,"look":[-5,-30]}');
// with none given, every preset in the scene is rendered. By default the source tree is served as-is
// (index.html + src/ + node_modules), so no build step is needed; --page renders a built bundle instead.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values: opt, positionals: cams } = parseArgs({ allowPositionals: true, options: {
  scene: { type: 'string', default: 'scene.js' },
  out: { type: 'string', default: 'out' },
  view: { type: 'string', default: '0' },
  size: { type: 'string', default: '1280x760' },
  eval: { type: 'string', multiple: true, default: [] },
  page: { type: 'string' }
} });
const [W, H] = opt.size.split('x').map(Number);
const ORIGIN = 'http://local.test';
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };

// map a request path to a file: '/' is the page, '/scene.js' the chosen scene, anything else under ROOT
function fileFor(path) {
  if (path === '/' || path === '/index.html') return opt.page ? resolve(opt.page) : join(ROOT, 'index.html');
  if (path === '/scene.js') return resolve(opt.scene);
  const f = resolve(ROOT, '.' + decodeURIComponent(path));
  return f.startsWith(ROOT + sep) ? f : null;
}

const out = resolve(opt.out);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const logs = [];
page.on('console', m => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', e => logs.push('PAGEERROR: ' + e));
await page.route('**/*', route => {
  const url = new URL(route.request().url());
  const f = url.origin === ORIGIN ? fileFor(url.pathname) : null;
  if (!f || !existsSync(f)) return route.abort();  // offline: web fonts and anything external are skipped
  return route.fulfill({ body: readFileSync(f), contentType: TYPES[extname(f)] || 'application/octet-stream' });
});

const evalJSON = async js => JSON.stringify(await page.evaluate(js));
await page.goto(ORIGIN + '/');
try { await page.waitForFunction('window.__mapReady === true', null, { timeout: 600000, polling: 500 }); }
catch (e) { console.log('TIMEOUT waiting for build', e.message); }
const report = await page.evaluate('window.mapEditor ? mapEditor.report() : null');
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1));
await page.evaluate('window.mapEditor && mapEditor.pause(true)');
for (const js of opt.eval) console.log('eval', js, '=>', await evalJSON(js));
if (+opt.view) await page.evaluate(`mapEditor.view(${+opt.view})`);
const list = cams.length ? cams : (report && report.cameras) || [];
for (let i = 0; i < list.length; i++) {
  let name = list[i];
  if (name.startsWith('{')) { await page.evaluate(`mapEditor.camera(${name})`); name = JSON.parse(name).name || `custom${i}`; }
  else await page.evaluate(`mapEditor.camera(${JSON.stringify(name)})`);
  await page.evaluate('mapEditor.step(2.5)');
  const url = await page.evaluate('mapEditor.snapshot()');
  writeFileSync(join(out, `${name}.png`), Buffer.from(url.split(',', 2)[1], 'base64'));
}
const errs = logs.filter(l => /error/i.test(l) && !l.includes('ERR_FAILED') && !l.includes('MAP_REPORT'));
console.log('console errors:', errs.slice(0, 12).map(e => e.slice(0, 600)).join('\n') || 'none');
if (report) {
  console.log('build', report.buildMs, 'ms', JSON.stringify(report.timing), '| errors', report.errors, '| warnings', report.warnings);
  console.log('logs', report.logs);
  console.log('counts', report.counts);
  for (const o of report.ops) if (o.status !== 'ok' || ['lake', 'river', 'scatter'].includes(o.op))
    console.log(`  L${o.line} ${o.call.padEnd(14)} ${o.status.padEnd(4)} ${String(o.ms).padStart(5)}ms  ${o.note}`);
}
await browser.close();
if (!report || report.errors.length) process.exitCode = 1;
