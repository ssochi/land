// First-person input: keyboard + pointer-lock mouse look on desktop, a virtual stick and buttons on touch
// screens. Fills a plain input object that src/app/walker.js consumes; knows nothing about physics.
import { $ } from './ui.js';

const KEYS = {
  KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r',
  ShiftLeft: 'sprint', ShiftRight: 'sprint', Space: 'space', KeyC: 'down', ControlLeft: 'down', ControlRight: 'down'
};
const LOOK = 0.0022, TOUCH_LOOK = 0.005, PITCH = 1.45;

// handlers: { active(): bool, onToggle(), onLook(dyaw, dpitch) }
export function createFirstPersonInput(canvas, handlers) {
  const held = new Set(), input = { forward: 0, right: 0, sprint: false, up: false, down: false, jump: false, toggleFly: false };
  const stick = { x: 0, y: 0 };
  let lastSpace = -1e9, touchSprint = false, dragging = null;

  function sync() {
    input.forward = (held.has('f') ? 1 : 0) - (held.has('b') ? 1 : 0) - stick.y;
    input.right = (held.has('r') ? 1 : 0) - (held.has('l') ? 1 : 0) + stick.x;
    input.sprint = held.has('sprint') || touchSprint;
    input.up = held.has('space'); input.down = held.has('down');
  }
  const typing = e => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== 'range';

  addEventListener('keydown', e => {
    if (typing(e)) return;
    if (e.code === 'KeyV' && !e.repeat) { handlers.onToggle(); return; }
    if (!handlers.active()) return;
    if (e.code === 'Escape' && document.pointerLockElement !== canvas) { handlers.onToggle(); return; }
    if (e.code === 'KeyF' && !e.repeat) input.toggleFly = true;
    const k = KEYS[e.code]; if (!k) return;
    e.preventDefault();
    if (k === 'space' && !e.repeat) {
      const now = performance.now();
      if (now - lastSpace < 300) input.toggleFly = true; else input.jump = true;   // double-tap toggles flight
      lastSpace = now;
    }
    held.add(k); sync();
  });
  addEventListener('keyup', e => { const k = KEYS[e.code]; if (k) { held.delete(k); sync(); } });
  addEventListener('blur', () => { held.clear(); sync(); });

  // mouse look: pointer lock when available, otherwise drag to look
  canvas.addEventListener('click', () => { if (handlers.active() && !matchMedia('(pointer: coarse)').matches && document.pointerLockElement !== canvas) canvas.requestPointerLock?.(); });
  addEventListener('mousemove', e => {
    if (!handlers.active()) return;
    if (document.pointerLockElement === canvas) handlers.onLook(-e.movementX * LOOK, -e.movementY * LOOK);
    else if (dragging === 'mouse') handlers.onLook(-e.movementX * LOOK * 1.5, -e.movementY * LOOK * 1.5);
  });
  canvas.addEventListener('mousedown', () => { if (handlers.active() && document.pointerLockElement !== canvas) dragging = 'mouse'; });
  addEventListener('mouseup', () => { if (dragging === 'mouse') dragging = null; });
  document.addEventListener('pointerlockchange', () => $('fpHint').classList.toggle('locked', document.pointerLockElement === canvas));

  // touch: drag anywhere on the canvas to look; stick and buttons in #touchPad
  const last = new Map();
  canvas.addEventListener('touchstart', e => { if (!handlers.active()) return; for (const t of e.changedTouches) last.set(t.identifier, [t.clientX, t.clientY]); }, { passive: true });
  canvas.addEventListener('touchmove', e => {
    if (!handlers.active()) return;
    for (const t of e.changedTouches) { const p = last.get(t.identifier); if (!p) continue; handlers.onLook(-(t.clientX - p[0]) * TOUCH_LOOK, -(t.clientY - p[1]) * TOUCH_LOOK); last.set(t.identifier, [t.clientX, t.clientY]); }
  }, { passive: true });
  canvas.addEventListener('touchend', e => { for (const t of e.changedTouches) last.delete(t.identifier); });
  const pad = $('stick'), knob = $('knob');
  const moveStick = t => {
    const r = pad.getBoundingClientRect(), R = r.width / 2, dx = t.clientX - r.left - R, dy = t.clientY - r.top - R, d = Math.hypot(dx, dy), k = d > R ? R / d : 1;
    stick.x = dx * k / R; stick.y = dy * k / R; knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`; sync();
  };
  pad.addEventListener('touchstart', e => { e.preventDefault(); moveStick(e.targetTouches[0]); });
  pad.addEventListener('touchmove', e => { e.preventDefault(); moveStick(e.targetTouches[0]); });
  pad.addEventListener('touchend', () => { stick.x = stick.y = 0; knob.style.transform = ''; sync(); });
  const hold = (id, on, off) => { const b = $(id); b.addEventListener('touchstart', e => { e.preventDefault(); on(b); }); b.addEventListener('touchend', e => { e.preventDefault(); off(b); }); };
  hold('btnJump', () => { input.jump = true; held.add('space'); sync(); }, () => { held.delete('space'); sync(); });
  hold('btnSprint', b => { touchSprint = !touchSprint; b.setAttribute('aria-pressed', String(touchSprint)); sync(); }, () => {});
  hold('btnFly', () => { input.toggleFly = true; }, () => {});
  hold('btnDown', () => { held.add('down'); sync(); }, () => { held.delete('down'); sync(); });

  return {
    input,
    release() { held.clear(); stick.x = stick.y = 0; touchSprint = false; sync(); if (document.pointerLockElement === canvas) document.exitPointerLock(); },
    clampPitch: p => Math.max(-PITCH, Math.min(PITCH, p))
  };
}
