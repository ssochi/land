// Render the start-screen previews: each map in maps.js is opened the way the start screen opens it
// (?map=id), shot from its `camera`, scaled down and saved as the JPEG named by its `thumb`.
//   node tools/thumbs.mjs [id ...]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..'), ORIGIN = 'http://local.test';
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg' };
let maps = [];
vm.runInNewContext(readFileSync(join(ROOT, 'maps.js'), 'utf8'), { defineMaps: list => { maps = list; } });
const ids = process.argv.slice(2), todo = maps.filter(m => m.thumb && (!ids.length || ids.includes(m.id)));

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
for (const m of todo) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    const f = url.origin === ORIGIN ? resolve(ROOT, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname))) : null;
    if (!f || !f.startsWith(ROOT + sep) || !existsSync(f)) return route.abort();
    return route.fulfill({ body: readFileSync(f), contentType: TYPES[extname(f)] || 'application/octet-stream' });
  });
  await page.goto(`${ORIGIN}/?map=${m.id}`);
  await page.waitForFunction('window.__mapReady === true', null, { timeout: 600000, polling: 500 });
  const jpg = await page.evaluate(async cam => {
    mapEditor.pause(true);
    if (cam) mapEditor.camera(cam);
    mapEditor.step(2.5);
    const img = new Image(); img.src = mapEditor.snapshot(); await img.decode();
    const c = document.createElement('canvas'); c.width = 640; c.height = 360;
    c.getContext('2d').drawImage(img, 0, 0, 640, 360);
    return c.toDataURL('image/jpeg', 0.82);
  }, m.camera || null);
  const out = join(ROOT, m.thumb);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(jpg.split(',', 2)[1], 'base64'));
  console.log(`${m.id}: ${m.thumb}`);
  await page.close();
}
await browser.close();
