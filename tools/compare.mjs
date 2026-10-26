// Side-by-side comparison against a reference screenshot, for matching a target art style.
//
//   node tools/compare.mjs <ref name | image path> [--scene file] [--camera name] [--out out/compare]
//                          [--width 1280] [--page dist/index.html]
//
// A ref name is looked up in refs/sources.json (image file, scene, camera, HUD masks). The scene camera is
// rendered at the reference's aspect ratio; the tool writes <name>.png (reference | ours), <name>.ours.png and
// <name>.json, and prints a metric table — value range, saturation, sky and vegetation colour, warmth, and
// fine / coarse detail — with the biggest differences called out, so an agent can iterate on numbers as well
// as on the picture. Metrics are computed in the page (no image libraries needed).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join, extname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values: opt, positionals } = parseArgs({ allowPositionals: true, options: {
  scene: { type: 'string' }, camera: { type: 'string' }, out: { type: 'string', default: 'out/compare' },
  width: { type: 'string', default: '1280' }, page: { type: 'string' }
} });
if (!positionals.length) { console.log('usage: node tools/compare.mjs <ref name | image> [--scene f] [--camera c]'); process.exit(1); }

const sources = existsSync(join(ROOT, 'refs/sources.json')) ? JSON.parse(readFileSync(join(ROOT, 'refs/sources.json'), 'utf8')) : {};
const key = positionals[0], src = sources[key] || {};
const refPath = src.file ? join(ROOT, 'refs', src.file) : resolve(key);
if (!existsSync(refPath)) { console.log(`reference image not found: ${refPath}` + (src.url ? `\nrun: node tools/fetch-refs.mjs ${key}` : '')); process.exit(1); }
const sceneFile = resolve(opt.scene || (src.scene ? join(ROOT, src.scene) : join(ROOT, 'scene.js')));
const camera = opt.camera || src.camera || 'ref', name = src.file ? key : basename(key, extname(key));
const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[extname(refPath).toLowerCase()];
const refURL = `data:${mime};base64,${readFileSync(refPath).toString('base64')}`;

const ORIGIN = 'http://local.test';
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
function fileFor(path) {
  if (path === '/' || path === '/index.html') return opt.page ? resolve(opt.page) : join(ROOT, 'index.html');
  if (path === '/scene.js') return sceneFile;
  const f = resolve(ROOT, '.' + decodeURIComponent(path));
  return f.startsWith(ROOT + sep) ? f : null;
}

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
// the page is sized from the reference once its dimensions are known
const probe = await browser.newPage();
const [rw, rh] = await probe.evaluate(async u => { const im = new Image(); im.src = u; await im.decode(); return [im.naturalWidth, im.naturalHeight]; }, refURL);
await probe.close();
const W = +opt.width, H = Math.round(W * rh / rw);
const page = await browser.newPage({ viewport: { width: W, height: H } });
const logs = [];
page.on('console', m => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', e => logs.push('PAGEERROR: ' + e));
await page.route('**/*', route => {
  const url = new URL(route.request().url());
  const f = url.origin === ORIGIN ? fileFor(url.pathname) : null;
  if (!f || !existsSync(f)) return route.abort();
  return route.fulfill({ body: readFileSync(f), contentType: TYPES[extname(f)] || 'application/octet-stream' });
});
await page.goto(ORIGIN + '/');
await page.waitForFunction('window.__mapReady === true', null, { timeout: 600000, polling: 500 });
const report = await page.evaluate('mapEditor.report()');
await page.evaluate('mapEditor.pause(true)');
if (!(await page.evaluate(`mapEditor.camera(${JSON.stringify(camera)})`))) console.log(`camera "${camera}" not found; using the default view`);
await page.evaluate('mapEditor.step(2.5)');
const ours = await page.evaluate('mapEditor.snapshot()');

// metrics + sheet, in the page
const result = await page.evaluate(async ({ refURL, ours, masks, W, H }) => {
  const load = async u => { const im = new Image(); im.src = u; await im.decode(); return im; };
  const [ri, oi] = await Promise.all([load(refURL), load(ours)]);
  const MW = 640, MH = Math.round(640 * H / W);
  function pixels(im) { const c = document.createElement('canvas'); c.width = MW; c.height = MH; const g = c.getContext('2d'); g.drawImage(im, 0, 0, MW, MH); return g.getImageData(0, 0, MW, MH).data; }
  const masked = (x, y) => masks.some(([a, b, c, d]) => x >= a * MW && x < c * MW && y >= b * MH && y < d * MH);
  function blur(src, r) {   // separable gaussian, sigma = r
    const k = [], n = Math.ceil(r * 2.5); let s = 0; for (let i = -n; i <= n; i++) { const v = Math.exp(-i * i / (2 * r * r)); k.push(v); s += v; } for (let i = 0; i < k.length; i++) k[i] /= s;
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) { let a = 0; for (let i = -n; i <= n; i++) a += src[y * MW + Math.min(MW - 1, Math.max(0, x + i))] * k[i + n]; tmp[y * MW + x] = a; }
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) { let a = 0; for (let i = -n; i <= n; i++) a += tmp[Math.min(MH - 1, Math.max(0, y + i)) * MW + x] * k[i + n]; out[y * MW + x] = a; }
    return out;
  }
  function metrics(d) {
    const N = MW * MH, L = new Float32Array(N), Ls = [], sats = [], veg = { n: 0, h: 0, s: 0, l: 0 }, sky = { n: 0, r: 0, g: 0, b: 0, s: 0 };
    let warm = 0, cnt = 0; const bands = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const i = y * MW + x, r = d[i * 4] / 255, g = d[i * 4 + 1] / 255, b = d[i * 4 + 2] / 255;
      L[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (masked(x, y)) continue;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), s = mx > 0 ? (mx - mn) / mx : 0, dd = Math.max(mx - mn, 1e-6);
      const h = mx === r ? (((g - b) / dd) % 6 + 6) % 6 * 60 : mx === g ? ((b - r) / dd + 2) * 60 : ((r - g) / dd + 4) * 60;
      Ls.push(L[i]); sats.push(s); warm += r - b; cnt++;
      const bd = bands[Math.min(2, Math.floor(y / MH * 3))]; bd[0] += r; bd[1] += g; bd[2] += b; bd[3]++;
      if (h > 50 && h < 165 && s > 0.15) { veg.n++; veg.h += h; veg.s += s; veg.l += L[i]; }
      if (y < MH * 0.22) { sky.n++; sky.r += r; sky.g += g; sky.b += b; sky.s += s; }
    }
    Ls.sort((a, b) => a - b);
    const pct = p => Ls[Math.min(Ls.length - 1, Math.floor(p * Ls.length))];
    const b1 = blur(L, 1), b5 = blur(L, 5), b20 = blur(L, 20);
    let fine = 0, coarse = 0, mean = 0, n2 = 0;
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) { if (masked(x, y)) continue; const i = y * MW + x; fine += Math.abs(b1[i] - b5[i]); coarse += Math.abs(b5[i] - b20[i]); mean += L[i]; n2++; }
    mean /= n2; let varL = 0; for (const v of Ls) varL += (v - mean) ** 2;
    const hex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(Math.min(1, v) * 255).toString(16).padStart(2, '0')).join('');
    const r3 = v => +v.toFixed(3);
    return {
      lumaP5: r3(pct(0.05)), lumaP50: r3(pct(0.5)), lumaP95: r3(pct(0.95)), contrast: r3(Math.sqrt(varL / Ls.length)),
      saturation: r3(sats.reduce((a, b) => a + b, 0) / sats.length), warmth: r3(warm / cnt),
      skySaturation: r3(sky.n ? sky.s / sky.n : 0), skyColor: sky.n ? hex(sky.r / sky.n, sky.g / sky.n, sky.b / sky.n) : null,
      vegShare: r3(veg.n / cnt), vegHue: Math.round(veg.n ? veg.h / veg.n : 0), vegSaturation: r3(veg.n ? veg.s / veg.n : 0), vegLuma: r3(veg.n ? veg.l / veg.n : 0),
      fineDetail: r3(fine / n2 * 100), coarseDetail: r3(coarse / n2 * 100),
      bands: bands.map(b => hex(b[0] / b[3], b[1] / b[3], b[2] / b[3]))
    };
  }
  const ref = metrics(pixels(ri)), our = metrics(pixels(oi));
  // sheet: reference | ours, labelled, HUD masks outlined
  const c = document.createElement('canvas'); c.width = W * 2 + 12; c.height = H + 34; const g = c.getContext('2d');
  g.fillStyle = '#111'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(ri, 0, 34, W, H); g.drawImage(oi, W + 12, 34, W, H);
  g.strokeStyle = 'rgba(255,80,80,0.8)'; g.setLineDash([6, 4]);
  for (const [a, b, cc, d] of masks) g.strokeRect(a * W, 34 + b * H, (cc - a) * W, (d - b) * H);
  g.fillStyle = '#eee'; g.font = '20px sans-serif'; g.fillText('参考', 10, 24); g.fillText('land', W + 22, 24);
  return { ref, ours: our, sheet: c.toDataURL('image/png') };
}, { refURL, ours, masks: src.mask || [], W, H });

const out = resolve(opt.out); mkdirSync(out, { recursive: true });
writeFileSync(join(out, `${name}.png`), Buffer.from(result.sheet.split(',', 2)[1], 'base64'));
writeFileSync(join(out, `${name}.ours.png`), Buffer.from(ours.split(',', 2)[1], 'base64'));
writeFileSync(join(out, `${name}.json`), JSON.stringify({ ref: result.ref, ours: result.ours, scene: sceneFile, camera, size: [W, H] }, null, 1));

// table with the differences that matter most, relative to a typical spread for each metric
const SCALE = { lumaP5: 0.08, lumaP50: 0.08, lumaP95: 0.08, contrast: 0.04, saturation: 0.08, warmth: 0.05, skySaturation: 0.1, vegShare: 0.15, vegHue: 10, vegSaturation: 0.08, vegLuma: 0.08, fineDetail: 0.5, coarseDetail: 0.5 };
const LABEL = { lumaP5: '暗部亮度 p5', lumaP50: '中间调 p50', lumaP95: '高光 p95', contrast: '整体反差', saturation: '平均饱和度', warmth: '冷暖 (R−B)', skySaturation: '天空饱和度',
  vegShare: '植被占比', vegHue: '植被色相°', vegSaturation: '植被饱和度', vegLuma: '植被亮度', fineDetail: '细节 (1–5px)', coarseDetail: '中尺度 (5–20px)' };
console.log(`\n${name}: ${W}×${H}, scene ${sceneFile.replace(ROOT + sep, '')}, camera ${camera}`);
console.log(`${'指标'.padEnd(14)}${'参考'.padStart(9)}${'land'.padStart(9)}${'差'.padStart(9)}`);
const flagged = [];
for (const k in SCALE) {
  const a = result.ref[k], b = result.ours[k], z = (b - a) / SCALE[k];
  console.log(`${LABEL[k].padEnd(14)}${String(a).padStart(9)}${String(b).padStart(9)}${((b - a >= 0 ? '+' : '') + (+(b - a).toFixed(3))).padStart(9)}${Math.abs(z) >= 1 ? '  ' + (z > 0 ? '▲' : '▼').repeat(Math.min(3, Math.floor(Math.abs(z)))) : ''}`);
  if (Math.abs(z) >= 1) flagged.push([Math.abs(z), `${LABEL[k]}${z > 0 ? '偏高' : '偏低'}`]);
}
console.log(`天空色  参考 ${result.ref.skyColor}  land ${result.ours.skyColor}`);
console.log(`上/中/下三段平均色  参考 ${result.ref.bands.join(' ')}  land ${result.ours.bands.join(' ')}`);
console.log('差距最大：' + (flagged.sort((a, b) => b[0] - a[0]).slice(0, 5).map(f => f[1]).join('、') || '无明显差距'));
console.log(`写入 ${join(out, name + '.png')}`);
const errs = logs.filter(l => /error/i.test(l) && !l.includes('ERR_FAILED') && !l.includes('MAP_REPORT'));
if (errs.length) console.log('console errors:\n' + errs.slice(0, 8).join('\n'));
if (report.errors.length) { console.log('build errors', report.errors); process.exitCode = 1; }
await browser.close();
