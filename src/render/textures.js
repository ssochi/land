// Leaf atlas drawn on a canvas: left half broadleaf cluster, right half needle strokes (alpha-tested cards).
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
  g.lineCap = 'round';
  for (let k = 0; k < 150; k++) {
    const x0 = S + S * (0.2 + R() * 0.6), y0 = S * (0.35 + R() * 0.5), a = -Math.PI / 2 + (R() - 0.5) * 2.2, len = S * (0.12 + R() * 0.22), sh = Math.round(120 + R() * 135);
    g.strokeStyle = `rgb(${sh},${sh},${sh})`; g.lineWidth = 2.2 + R() * 2.5;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + Math.cos(a) * len, y0 + Math.sin(a) * len); g.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4;
  return t;
})();
