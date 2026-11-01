// Leaf atlas drawn on a canvas: left half a broadleaf sprig cluster, right half spruce sprays (alpha-tested cards).
import * as THREE from 'three';
import { mulberry32 } from '../core/math.js';

export const LEAF_TEX = (() => {
  const S = 512, cv = document.createElement('canvas'); cv.width = S * 2; cv.height = S;
  const g = cv.getContext('2d'), R = mulberry32(99), grey = v => { const c = Math.round(Math.min(255, Math.max(0, v))); return `rgb(${c},${c},${c})`; };
  // broadleaf: sprigs fanning out from the middle, each a stalk with alternate ovate leaves and one at its tip.
  // A leaf's two halves differ in shade (the lit and the turned-away side of the midrib); sprigs drawn first sit
  // behind and are darker. Only the red channel is used, as a brightness multiplier.
  const blade = (x, y, len, w, ang, sh) => {
    g.save(); g.translate(x, y); g.rotate(ang);
    for (const sd of [1, -1]) {
      g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(sd * w * 1.25, -len * 0.18, sd * w * 0.95, -len * 0.78, 0, -len); g.closePath();
      g.fillStyle = grey(sd > 0 ? sh : sh * 0.8); g.fill();
    }
    g.strokeStyle = grey(sh * 0.62); g.lineWidth = S * 0.004; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -len * 0.85); g.stroke();
    g.restore();
  };
  g.lineCap = 'round';
  for (let k = 0; k < 12; k++) {   // shaded leaves deep in the cluster, behind the sprigs
    const a = R() * 6.283, rr = Math.sqrt(R()) * S * 0.2;
    blade(S / 2 + Math.cos(a) * rr, S / 2 + Math.sin(a) * rr, S * (0.1 + R() * 0.03), S * 0.036, a + Math.PI / 2 + (R() - 0.5), 95 + R() * 30);
  }
  const sprigs = 10;   // every leaf stays inside the card: stalk + leaf reach under 0.48 of its width from the middle
  for (let f = 0; f < sprigs; f++) {
    const a = f / sprigs * 6.283 + (R() - 0.5) * 0.5, len = S * (0.25 + R() * 0.07), bend = (R() - 0.5) * 0.8;
    const x0 = S / 2 + (R() - 0.5) * S * 0.08, y0 = S / 2 + (R() - 0.5) * S * 0.08, base = 125 + f / sprigs * 90 + R() * 25;
    const at = t => { const m = a + bend * t * 0.5; return [x0 + Math.cos(m) * len * t, y0 + Math.sin(m) * len * t, a + bend * t]; };   // along a gently curved stalk
    g.strokeStyle = grey(base * 0.55); g.lineWidth = S * 0.007; g.beginPath(); g.moveTo(x0, y0);
    for (let t = 0.1; t <= 1.001; t += 0.1) { const [x, y] = at(t); g.lineTo(x, y); }
    g.stroke();
    let sd = R() < 0.5 ? 1 : -1;
    for (let t = 0.22; t < 0.95; t += 0.15 + R() * 0.05, sd = -sd) {
      const [x, y, b] = at(t), l = S * (0.1 + R() * 0.035) * (0.8 + 0.3 * Math.sin(t * 3.1));
      blade(x, y, l, l * 0.34, b + Math.PI / 2 + sd * (0.75 + R() * 0.3), base + R() * 40);
    }
    const [x, y, b] = at(1);
    blade(x, y, S * (0.11 + R() * 0.025), S * 0.04, b + Math.PI / 2, base + 30 + R() * 25);
  }
  // spruce sprays: fronds fanning out from the base, each a rib with paired needles angled toward its tip
  const line = (x, y, x2, y2, w, sh) => { g.strokeStyle = `rgb(${sh},${sh},${sh})`; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke(); };
  for (let f = 0; f < 7; f++) {
    const a = -Math.PI / 2 + (f / 6 - 0.5) * 1.5 + (R() - 0.5) * 0.2, len = S * (0.5 + R() * 0.3) * (1 - Math.abs(f / 6 - 0.5) * 0.5);
    const x0 = S * 1.5 + (R() - 0.5) * S * 0.1, y0 = S * 0.94, base = Math.round(130 + R() * 60);
    line(x0, y0, x0 + Math.cos(a) * len, y0 + Math.sin(a) * len, S * 0.012, base);
    for (let t = 0.08; t < 1; t += 0.045) {
      const px = x0 + Math.cos(a) * len * t, py = y0 + Math.sin(a) * len * t, nl = S * 0.11 * (1 - t * 0.7);
      for (const sd of [-1, 1]) {
        const b = a + sd * (0.75 + R() * 0.25), sh = Math.round(150 + R() * 105);
        line(px, py, px + Math.cos(b) * nl, py + Math.sin(b) * nl, S * (0.007 + R() * 0.005), sh);
      }
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4;
  return t;
})();
