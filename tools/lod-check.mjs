// LOD pop check: how much each model changes on screen when it swaps level. Every kind with LOD levels is placed
// alone on flat ground and seen from each of its switch distances, once at the nearer level and once at the
// farther one (mapEditor.debug.lod.force); the two frames are compared over the model's pixels.
//
//   node tools/lod-check.mjs [kind ...] [--out out/lod] [--size 1600x900]
//
// Prints per switch: coverage of the two levels (pixels), the mean colour difference over the model (0–255) and
// the brightness shift (B − A); writes out/lod/<kind>.png with crops of A | B | |A − B| × 3 per switch.
// A switch that reads as a pop has a high mean difference or a brightness shift; aim for both well under 10.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values: opt, positionals: only } = parseArgs({ allowPositionals: true, options: {
  out: { type: 'string', default: 'out/lod' }, size: { type: 'string', default: '1600x900' }
} });
const [W, H] = opt.size.split('x').map(Number);
const out = resolve(opt.out); mkdirSync(out, { recursive: true });

// every kind with levels goes at the origin (they are shown one at a time), under the village's afternoon sun
const { KINDS } = await import('../src/objects/kinds.js').catch(() => ({ KINDS: null }));
const kinds = (KINDS ? Object.keys(KINDS).filter(k => (KINDS[k].lod || []).length) : []).filter(k => !only.length || only.includes(k));
const sceneFile = join(out, 'lod-scene.js');
writeFileSync(sceneFile, `defineScene((m) => {
  m.name('LOD check');
  ${kinds.map(k => `m.place(${JSON.stringify(k)}, 0, 0, { variant: 0, rotation: 0.6 });`).join('\n  ')}
  m.env({ time: 0.74, wind: 0, fogDensity: 0.0034, haze: '#c2cfc6', hazeFar: 0.5, clouds: 0.5, streaks: false, pollen: false });
  m.camera('a', { at: [0, 30], look: [0, 0] });
});`);

const ORIGIN = 'http://local.test', TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
const fileFor = path => {
  if (path === '/' || path === '/index.html') return join(ROOT, 'index.html');
  if (path === '/scene.js') return sceneFile;
  const f = resolve(ROOT, '.' + decodeURIComponent(path));
  return f.startsWith(ROOT + sep) ? f : null;
};
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.route('**/*', route => {
  const url = new URL(route.request().url()), f = url.origin === ORIGIN ? fileFor(url.pathname) : null;
  if (!f || !existsSync(f)) return route.abort();
  return route.fulfill({ body: readFileSync(f), contentType: TYPES[extname(f)] || 'application/octet-stream' });
});
await page.goto(ORIGIN + '/?scene');
await page.waitForFunction('window.__mapReady === true', null, { timeout: 600000, polling: 500 });
await page.evaluate('mapEditor.pause(true)');

const rows = [];
for (const kind of kinds) {
  const res = await page.evaluate(async ({ kind }) => {
    const { KINDS, kindGeo } = await import('/src/objects/kinds.js');
    const L = KINDS[kind].lod, lod = mapEditor.debug.lod, world = mapEditor.debug.world();
    const show = k => world.traverse(o => { if (o.isInstancedMesh && o.userData.kind) o.visible = o.userData.kind === k; });
    const g = kindGeo(kind, 0, 0); g.computeBoundingBox();
    const bb = g.boundingBox, cy = (bb.min.y + bb.max.y) / 2, size = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);
    const shot = async () => { const img = new Image(); img.src = mapEditor.snapshot(); await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return { c, d: x.getImageData(0, 0, c.width, c.height).data }; };
    const out = [];
    for (let k = 0; k < L.length; k++) {
      // the sun over the viewer's shoulder, 60° off the line of sight (facing it, the glare and light shafts in
      // the post pass would spread the model's influence over the sky)
      const sd = mapEditor.debug.uniforms.uSunDir.value, a = Math.atan2(sd.x, sd.z) + Math.PI / 3, D = L[k];
      mapEditor.camera({ at: [Math.sin(a) * D, Math.cos(a) * D], eye: 1.7, look: [0, 0], lookEye: cy, fov: 58 });
      show(null); lod.force = 0; lod.dirty = true; const bg = await shot();
      show(kind); lod.force = k; lod.dirty = true; const A = await shot();
      lod.force = k + 1; lod.dirty = true; const B = await shot();
      const w = A.c.width, h = A.c.height, n = w * h;
      let areaA = 0, areaB = 0, uni = 0, sum = 0, lumA = 0, lumB = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
      const lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      for (let p = 0; p < n; p++) {
        const i = p * 4, inA = Math.abs(A.d[i] - bg.d[i]) + Math.abs(A.d[i + 1] - bg.d[i + 1]) + Math.abs(A.d[i + 2] - bg.d[i + 2]) > 24;
        const inB = Math.abs(B.d[i] - bg.d[i]) + Math.abs(B.d[i + 1] - bg.d[i + 1]) + Math.abs(B.d[i + 2] - bg.d[i + 2]) > 24;
        if (inA) areaA++; if (inB) areaB++;
        if (inA || inB) {
          uni++; sum += (Math.abs(A.d[i] - B.d[i]) + Math.abs(A.d[i + 1] - B.d[i + 1]) + Math.abs(A.d[i + 2] - B.d[i + 2])) / 3;
          lumA += lum(A.d, i); lumB += lum(B.d, i);
          const x = p % w, y = (p / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      // crops A | B | diff, scaled up to 240px tall
      const pad = 6; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
      const cw = x1 - x0 + 1, ch = y1 - y0 + 1, sc = 240 / ch, tw = Math.round(cw * sc);
      const m = document.createElement('canvas'); m.width = tw * 3 + 8; m.height = 240; const mx = m.getContext('2d'); mx.imageSmoothingEnabled = false;
      mx.fillStyle = '#000'; mx.fillRect(0, 0, m.width, m.height);
      mx.drawImage(A.c, x0, y0, cw, ch, 0, 0, tw, 240); mx.drawImage(B.c, x0, y0, cw, ch, tw + 4, 0, tw, 240);
      const dc = document.createElement('canvas'); dc.width = cw; dc.height = ch; const dx = dc.getContext('2d'), di = dx.createImageData(cw, ch);
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const s = ((y + y0) * w + x + x0) * 4, t = (y * cw + x) * 4; for (let c = 0; c < 3; c++) di.data[t + c] = Math.min(255, Math.abs(A.d[s + c] - B.d[s + c]) * 3); di.data[t + 3] = 255; }
      dx.putImageData(di, 0, 0); mx.drawImage(dc, 0, 0, cw, ch, tw * 2 + 8, 0, tw, 240);
      out.push({ D, from: k, to: k + 1, px: ch, areaA, areaB, diff: uni ? sum / uni : 0, shift: uni ? (lumB - lumA) / uni : 0, crop: m.toDataURL('image/png'), size });
    }
    lod.force = -1; lod.dirty = true; show(undefined);
    return out;
  }, { kind });
  // stack the crops of every switch vertically into one image per kind
  const imgs = res.map(r => r.crop);
  const sheet = await page.evaluate(async (imgs) => {
    const ims = await Promise.all(imgs.map(async s => { const i = new Image(); i.src = s; await i.decode(); return i; }));
    const c = document.createElement('canvas'); c.width = Math.max(...ims.map(i => i.width)); c.height = ims.reduce((a, i) => a + i.height + 4, 0);
    const x = c.getContext('2d'); x.fillStyle = '#222'; x.fillRect(0, 0, c.width, c.height); let y = 0; for (const i of ims) { x.drawImage(i, 0, y); y += i.height + 4; }
    return c.toDataURL('image/png');
  }, imgs);
  writeFileSync(join(out, kind + '.png'), Buffer.from(sheet.split(',', 2)[1], 'base64'));
  for (const r of res) {
    rows.push({ kind, ...r, crop: undefined });
    console.log(`${kind.padEnd(14)} ${String(r.D).padStart(4)}m  L${r.from}→L${r.to}  ${String(r.px).padStart(4)}px tall  area ${String(r.areaA).padStart(6)} → ${String(r.areaB).padStart(6)}  diff ${r.diff.toFixed(1).padStart(5)}  shift ${r.shift.toFixed(1).padStart(6)}`);
  }
}
writeFileSync(join(out, 'lod.json'), JSON.stringify(rows, null, 1));
await browser.close();
