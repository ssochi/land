// Start screen: the maps listed in maps.js (window.__maps), each a scene script that registers itself through
// defineScene(fn). Picking one loads its script (or finds it already inlined by tools/build.mjs), builds it,
// and puts ?map=<id> in the address so a reload comes back to the same map.
import { $, hideLoading, showLoading } from './ui.js';
import { setSceneFile } from '../runtime/api.js';

export function createMaps(editor, fallback) {
  const list = window.__maps || [];
  let current = null, busy = false;

  // the scene function registered under id: inlined in a built page, otherwise load its script
  const load = (id, file) => window.__scenes[id] ? Promise.resolve(window.__scenes[id]) : new Promise(resolve => {
    window.__scenePending = id;
    const s = document.createElement('script');
    s.src = file; s.onload = () => resolve(window.__scenes[id] || null); s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });

  // build a scene script; returns the report, or null if the script could not be loaded
  async function build(id, file, title) {
    hide(); showLoading(title ? `正在生成 ${title}` : '正在构建地图');
    const fn = await load(id, file);
    if (!fn && !fallback) return null;
    setSceneFile(file);
    const report = await editor.build(fn || fallback);
    document.body.classList.add('has-map');
    hideLoading();
    return report;
  }

  async function open(id) {
    const m = list.find(x => x.id === id);
    if (!m || busy) return null;
    busy = true;
    try {
      const report = await build(m.id, m.file, m.title);
      current = m;
      try { history.replaceState(null, '', '?map=' + m.id); } catch { /* sandboxed frames may refuse */ }
      return report;
    } finally { busy = false; }
  }

  function render() {
    const ul = $('mapList');
    ul.textContent = '';
    for (const m of list) {
      const li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.className = 'map-card glass';
      if (current && current.id === m.id) b.setAttribute('aria-current', 'true');
      const th = document.createElement('span'); th.className = 'thumb';
      if (m.thumb) { const img = document.createElement('img'); img.alt = ''; img.src = m.thumb; img.onerror = () => img.remove(); th.append(img); }
      const h = document.createElement('strong'); h.textContent = m.title;
      const p = document.createElement('span'); p.className = 'desc'; p.textContent = m.desc || '';
      b.append(th, h, p);
      b.addEventListener('click', () => open(m.id));
      li.append(b); ul.append(li);
    }
  }

  function show() {
    if (!list.length || editor.mode === 'walk') return;
    render();
    $('menu').hidden = false; $('menuClose').hidden = !current;
    const cur = $('mapList').querySelector('[aria-current="true"]');
    if (cur) cur.focus({ preventScroll: true });
  }
  function hide() { $('menu').hidden = true; }

  $('mapsBtn').hidden = !list.length;
  $('mapsBtn').addEventListener('click', e => { e.currentTarget.blur(); show(); });
  $('menuClose').addEventListener('click', hide);
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if (e.key === 'Escape' && !$('menu').hidden && current) { hide(); e.preventDefault(); }
    else if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey && $('menu').hidden) show();
  });

  return {
    list: () => list.map(({ id, title, desc }) => ({ id, title, desc })),
    current: () => current && current.id,
    open, show, hide, build
  };
}
