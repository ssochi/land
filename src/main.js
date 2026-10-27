// Entry point. index.html has defined defineScene / defineMaps and run maps.js (the start-screen list); a
// built page has every map's scene already registered in window.__scenes.
//   ?map=<id>   open that map directly
//   ?scene      build the page's own scene.js without the start screen (tools/render.mjs, compare.mjs)
import * as THREE from 'three';
import { isSmall } from './platform.js';
import { createEditor } from './app/editor.js';
import { installAgentAPI } from './app/agent-api.js';
import { createMaps } from './app/maps.js';
import { $, hideLoading } from './app/ui.js';

const fallbackScene = m => { m.name('空白原野'); m.terrain.noise({ amp: 10, scale: 0.01 }); m.grass({ center: [0, 0], radius: 60 }); m.camera('hero', { at: [0, 30], eye: 3, look: [0, -40], lookEye: 3 }); };

async function boot() {
  const canvas = $('scene');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
  catch { $('loadStage').textContent = '此浏览器无法启用 WebGL'; return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isSmall ? 1.5 : 1.75));
  renderer.setSize(innerWidth, innerHeight, false);

  const editor = createEditor(renderer, canvas);
  installAgentAPI(editor, canvas);
  editor.start();
  const maps = createMaps(editor, null);
  Object.assign(window.mapEditor, { maps: maps.list, openMap: maps.open, menu: maps.show });

  const q = new URLSearchParams(location.search), list = maps.list(), want = q.get('map');
  if (list.some(m => m.id === want)) await maps.open(want);
  else if (q.has('scene') || !list.length) {
    // the page's own scene: scene.js next to the page, or the one scene a single-scene build inlined
    const r = await maps.build('scene', 'scene.js');
    if (!r) { if (list.length) await maps.open(list[0].id); else { await editor.build(fallbackScene); hideLoading(); } }
  } else { hideLoading(); maps.show(); }
}

boot();
