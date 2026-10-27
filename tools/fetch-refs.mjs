// Download the reference screenshots listed in refs/sources.json into refs/ (they are not committed:
// the images belong to their publishers and are used here only for side-by-side comparison).
//   node tools/fetch-refs.mjs [name ...]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sources = JSON.parse(readFileSync(join(ROOT, 'refs/sources.json'), 'utf8'));
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(sources);
for (const n of names) {
  const s = sources[n]; if (!s) { console.log(`unknown reference ${n}`); continue; }
  const f = join(ROOT, 'refs', s.file);
  if (existsSync(f)) { console.log(`${n}: ${s.file} already present`); continue; }
  const res = await fetch(s.url, { headers: { 'User-Agent': 'land-reference-fetch' } });
  if (!res.ok) { console.log(`${n}: HTTP ${res.status} for ${s.url} (download it by hand from ${s.page})`); continue; }
  writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  console.log(`${n}: saved ${s.file}`);
}
