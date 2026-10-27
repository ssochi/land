// Leaf atlas drawn on a canvas: left half broadleaf cluster, right half spruce sprays (alpha-tested cards).
import * as THREE from 'three';
import { mulberry32 } from '../core/math.js';

export const LEAF_TEX = (() => {
  const S = 256, cv = document.createElement('canvas'); cv.width = S * 2; cv.height = S;
  const g = cv.getContext('2d'), R = mulberry32(99);
  const leaf = (x, y, len, w, ang, shade) => { g.save(); g.translate(x, y); g.rotate(ang); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(w, -len * 0.45, 0, -len); g.quadraticCurveTo(-w, -len * 0.45, 0, 0); g.fillStyle = `rgb(${shade},${shade},${shade})`; g.fill(); g.restore(); };
  for (let k = 0; k < 38; k++) {
    const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * S * 0.3;
    leaf(S / 2 + Math.cos(a) * rr, S / 2 + Math.sin(a) * rr, S * (0.15 + R() * 0.1), S * (0.045 + R() * 0.03), a + Math.PI / 2 + (R() - 0.5) * 0.9, Math.round(140 + R() * 115));
  }
  // spruce sprays: fronds fanning out from the base, each a rib with paired needles angled toward its tip
  g.lineCap = 'round';
  const line = (x, y, x2, y2, w, sh) => { g.strokeStyle = `rgb(${sh},${sh},${sh})`; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke(); };
  for (let f = 0; f < 7; f++) {
    const a = -Math.PI / 2 + (f / 6 - 0.5) * 1.5 + (R() - 0.5) * 0.2, len = S * (0.5 + R() * 0.3) * (1 - Math.abs(f / 6 - 0.5) * 0.5);
    const x0 = S * 1.5 + (R() - 0.5) * S * 0.1, y0 = S * 0.94, base = Math.round(130 + R() * 60);
    line(x0, y0, x0 + Math.cos(a) * len, y0 + Math.sin(a) * len, 3, base);
    for (let t = 0.08; t < 1; t += 0.045) {
      const px = x0 + Math.cos(a) * len * t, py = y0 + Math.sin(a) * len * t, nl = S * 0.11 * (1 - t * 0.7);
      for (const sd of [-1, 1]) {
        const b = a + sd * (0.75 + R() * 0.25), sh = Math.round(150 + R() * 105);
        line(px, py, px + Math.cos(b) * nl, py + Math.sin(b) * nl, 1.8 + R() * 1.2, sh);
      }
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4;
  return t;
})();
