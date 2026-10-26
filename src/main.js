// Entry point. scene.js has already run `defineScene(fn)` (see index.html), leaving fn on window.__scene.
import * as THREE from 'three';
import { isSmall } from './platform.js';
import { createEditor } from './app/editor.js';
import { installAgentAPI } from './app/agent-api.js';
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
  await editor.build(window.__scene || fallbackScene);
  hideLoading();
}

boot();
