// Trees and bushes. Broadleaf trees grow by space colonization and are dressed with leaf cards;
// pines are stacked needle skirts. Every maker is deterministic in `seed`. lod 0 is the full model seen up
// close; higher levels drop twigs and leaf cards and finally become a few shaded blobs on the main limbs.
import * as THREE from 'three';
import { clamp, mulberry32 } from '../core/math.js';
import { vnoise } from '../core/noise.js';
import { MB, V3, addTube, addBlob, addCard, addCards, canopyColor } from './mesh-builder.js';
import { colonize, branchesToMesh } from './colonize.js';

export function makeOak(seed, big, lod = 0) {
  const R = mulberry32(seed), mb = new MB(), k = big ? 1.55 : 1;
  // big trees spread into a wide, flatter crown (the umbrella oaks of Hyrule field) instead of a scaled-up ball
  const trunkH = (3.0 + R() * 1.0) * k, rx = (4.2 + R() * 0.8) * k * (big ? 1.3 : 1), ry = (3.0 + R() * 0.6) * k * (big ? 0.82 : 1);
  const Cc = V3((R() - 0.5) * 0.6, trunkH + ry * 0.95, (R() - 0.5) * 0.6), top = Cc.y + ry;
  const lobes = Array.from({ length: 4 + Math.floor(R() * 3) }, () => { const a = R() * 6.283; return V3(Cc.x + Math.cos(a) * rx * 0.5, Cc.y + (R() - 0.3) * ry * 0.5, Cc.z + Math.sin(a) * rx * 0.5); });
  const envelope = (Rn) => { for (;;) { const p = V3((Rn() * 2 - 1) * rx, (Rn() * 2 - 1) * ry, (Rn() * 2 - 1) * rx); const e = (p.x / rx) ** 2 + (p.y / ry) ** 2 + (p.z / rx) ** 2; if (e > 1 || p.y < -ry * 0.55) continue; const q = p.add(Cc); let ok = e < 0.4; for (const L of lobes) if (q.distanceTo(L) < rx * 0.55) ok = true; if (ok) return q; } };
  const nodes = colonize(R, { trunkH, lean: V3((R() - 0.5) * 0.3, 0, (R() - 0.5) * 0.3), count: big ? 700 : 460, infl: 3.0 * k, kill: 0.85 * k, seg: 0.42 * k, iters: 90, tropism: 0.1, tipR: 0.02, pipe: 2.4, baseR: 0.5 * k, minR: 0.012, envelope });
  const sway = P => Math.pow(clamp(P.y / top, 0, 1), 1.7) * 0.5 + 0.03 * Math.hypot(P.x, P.z) / rx;
  const bark = new THREE.Color('#6a5039'), barkD = new THREE.Color('#463428');
  branchesToMesh(mb, nodes, (t, a, P) => new THREE.Color().copy(barkD).lerp(bark, 0.35 + 0.65 * vnoise(a * 2 + seed, P.y * 1.5)), sway, [0.045, 0.09, 0.16][lod] * k);
  const light = new THREE.Color('#b7d35c'), midc = new THREE.Color('#6a9f3a'), dark = new THREE.Color('#2b592c');
  const hue = 0.94 + R() * 0.12; [light, midc, dark].forEach(c => c.multiplyScalar(hue));
  const colorFn = canopyColor(Cc, ry * 1.1, dark, midc, light);
  // dark inner blobs fill the gaps between leaf cards (at lod 2 they are the whole canopy, lit, with no cards)
  if (lod === 2) {
    for (let b = 0; b < 9; b++) { const a = R() * 6.283, rr = 0.25 + R() * 0.45; addBlob(mb, V3(Cc.x + Math.cos(a) * rx * rr, Cc.y + (R() - 0.3) * ry * 0.55, Cc.z + Math.sin(a) * rx * rr), rx * 0.42, 1, { ncenter: Cc, nblend: 0.8, lump: 0.35, seed: seed + b, squash: 0.85, sway, color: (P) => colorFn(P, P.clone().sub(Cc).normalize()) }); }
    return mb.geo();
  }
  for (let b = 0; b < 7; b++) { const a = R() * 6.283, rr = 0.2 + R() * 0.3; addBlob(mb, V3(Cc.x + Math.cos(a) * rx * rr, Cc.y + (R() - 0.4) * ry * 0.5, Cc.z + Math.sin(a) * rx * rr), rx * 0.17, 1, { ncenter: Cc, nblend: 0.85, lump: 0.35, seed: seed + b, squash: 0.85, sway, color: (P) => colorFn(P, P.clone().sub(Cc).normalize()).multiplyScalar(0.72) }); }
  let tipMin = 1e9; for (const nd of nodes) tipMin = Math.min(tipMin, nd.r);
  const leafR = tipMin * 5, leafSize = 1.35 * k;
  for (const nd of nodes) {
    if (nd.r > leafR || nd.p.y < trunkH * 0.9) continue;
    const out = nd.p.clone().sub(Cc).normalize();
    for (let c = 0; c < 3; c++) { if (R() > 0.8 || (lod && R() > 0.45)) continue; addCard(mb, nd.p.clone().add(V3((R() - 0.5) * 0.7, (R() - 0.5) * 0.7, (R() - 0.5) * 0.7)), out, leafSize * (0.75 + R() * 0.6) * (lod ? 1.35 : 1), R, colorFn, sway, Cc, 0.82, 0); }
  }
  return mb.geo();
}

export function makeBirch(seed, lod = 0) {
  const R = mulberry32(seed), mb = new MB();
  const H = 8 + R() * 2.2, trunkH = H * 0.42, rx = 1.8 + R() * 0.5, ry = H * 0.36;
  const Cc = V3(0, trunkH + ry * 1.05, 0), top = Cc.y + ry;
  const envelope = (Rn) => { for (;;) { const p = V3((Rn() * 2 - 1) * rx, (Rn() * 2 - 1) * ry, (Rn() * 2 - 1) * rx); if ((p.x / rx) ** 2 + (p.y / ry) ** 2 + (p.z / rx) ** 2 <= 1) return p.add(Cc); } };
  const nodes = colonize(R, { trunkH, lean: V3((R() - 0.5) * 0.6, 0, (R() - 0.5) * 0.6), count: 280, infl: 2.2, kill: 0.55, seg: 0.33, iters: 90, tropism: -0.03, tipR: 0.02, pipe: 2.2, baseR: 0.21, minR: 0.01, envelope });
  const sway = P => Math.pow(clamp(P.y / top, 0, 1), 1.4) * 0.75;
  const white = new THREE.Color('#ebe7da'), barkDark = new THREE.Color('#38332d');
  branchesToMesh(mb, nodes, (t, a, P) => (vnoise(a * 1.6 + seed, P.y * 5.5) > 0.72 ? barkDark.clone() : white.clone().multiplyScalar(0.9 + vnoise(P.y * 2, a) * 0.1)), sway, [0.011, 0.03, 0.07][lod]);
  const colorFn = canopyColor(Cc, ry, new THREE.Color('#4a7a36'), new THREE.Color('#91bd4e'), new THREE.Color('#d4e27a'));
  if (lod === 2) {
    for (let b = 0; b < 6; b++) addBlob(mb, V3((R() - 0.5) * rx, Cc.y + (R() - 0.5) * ry * 1.2, (R() - 0.5) * rx), rx * 0.55, 1, { ncenter: Cc, nblend: 0.75, lump: 0.3, seed: seed + b, squash: 1.2, sway, color: (P) => colorFn(P, P.clone().sub(Cc).normalize()) });
    return mb.geo();
  }
  let tipMin = 1e9; for (const nd of nodes) tipMin = Math.min(tipMin, nd.r);
  for (const nd of nodes) {
    if (nd.r > tipMin * 5 || nd.p.y < trunkH * 0.95) continue;
    for (let c = 0; c < 2; c++) { if (R() > 0.8 || (lod && R() > 0.5)) continue; addCard(mb, nd.p.clone().add(V3((R() - 0.5) * 0.4, (R() - 0.5) * 0.4, (R() - 0.5) * 0.4)), nd.p.clone().sub(Cc).normalize(), 0.9 * (0.7 + R() * 0.6), R, colorFn, sway, Cc, 0.8, 0); }
  }
  return mb.geo();
}

// lod 0: full tiers with needle cards; 1: fewer tiers, no cards; 2: a handful of coarse tiers for the far forest
export function makePine(seed, lod = 0) {
  const lo = lod > 0, far = lod > 1;
  const R = mulberry32(seed), mb = new MB();
  const H = 9 + R() * 5;
  const sway = P => Math.pow(Math.max(P.y, 0) / H, 2) * 0.4;
  const bark = new THREE.Color('#5d4433');
  addTube(mb, lo ? [V3(0, -0.3, 0), V3(0, H * 0.6, 0)] : [V3(0, -0.4, 0), V3(0, H * 0.35, 0), V3(0, H * 0.7, 0), V3(0, H * 0.97, 0)], lo ? [0.42, 0.16] : [0.4, 0.27, 0.16, 0.03], far ? 3 : lo ? 4 : 7, (t, a, P) => bark.clone().multiplyScalar(0.85 + 0.3 * vnoise(a * 2, P.y * 2)), sway);
  const tiers = far ? 5 : lo ? 7 : 10 + Math.floor(R() * 3), spikes = far ? 6 : lo ? 7 : 11;
  const dkA = new THREE.Color('#2a4628'), dkB = new THREE.Color('#47703c'), tip = new THREE.Color('#93b25a'), under = new THREE.Color('#1b2f1d');   // BotW conifers lean yellow-green
  for (let t = 0; t < tiers; t++) {
    const u = t / (tiers - 1), y0 = H * (0.3 + 0.7 * u) + 0.4;
    // the LOD has few tiers, so its skirts hang lower and overlap: otherwise distant pines read as floating discs
    const Rr = Math.pow(1 - u, 0.95) * (2.3 + R() * 0.5) + 0.28, drop = Math.max(0.7 + Rr * 0.42, lo ? Math.min(H * 0.7 / (tiers - 1) * 1.4, 0.55 + Rr * 1.2) : 0);
    const rot = R() * 6.283, topC = new THREE.Color().copy(dkA).lerp(dkB, 0.3 + 0.7 * u);
    const off = V3((R() - 0.5) * Rr * 0.12, 0, (R() - 0.5) * Rr * 0.12);
    const T = mb.v(off.x, y0, off.z, 0, 1, 0, topC, sway(V3(0, y0, 0)));
    const U2 = mb.v(off.x, y0 - drop * 0.55, off.z, 0, -1, 0, under, sway(V3(0, y0 - drop * 0.55, 0)));
    const tipsU = [], notchU = [], tipsD = [], notchD = [];
    for (let sI = 0; sI < spikes; sI++) {
      const a = rot + sI / spikes * Math.PI * 2 + (R() - 0.5) * 0.25, a2 = a + Math.PI / spikes;
      const rr = Rr * (0.75 + R() * 0.45), dy = drop * (0.75 + R() * 0.5);
      const tx = off.x + Math.cos(a) * rr, tz = off.z + Math.sin(a) * rr, nx = off.x + Math.cos(a2) * rr * 0.62, nz = off.z + Math.sin(a2) * rr * 0.62;
      const tn = V3(Math.cos(a) * 0.6, 0.8, Math.sin(a) * 0.6).normalize(), nn = V3(Math.cos(a2) * 0.45, 0.89, Math.sin(a2) * 0.45).normalize();
      const tc = topC.clone().lerp(tip, 0.55 + R() * 0.3);
      tipsU.push(mb.v(tx, y0 - dy, tz, tn.x, tn.y, tn.z, tc, sway(V3(tx, y0, tz)) + 0.05));
      notchU.push(mb.v(nx, y0 - dy * 0.68, nz, nn.x, nn.y, nn.z, topC, sway(V3(nx, y0, nz))));
      tipsD.push(mb.v(tx, y0 - dy, tz, tn.x, -0.6, tn.z, under, sway(V3(tx, y0, tz)) + 0.05));
      notchD.push(mb.v(nx, y0 - dy * 0.68, nz, nn.x, -0.6, nn.z, under, sway(V3(nx, y0, nz))));
    }
    for (let sI = 0; sI < spikes; sI++) {
      const s2 = (sI + 1) % spikes;
      mb.tri(T, notchU[sI], tipsU[sI]); mb.tri(T, tipsU[s2], notchU[sI]);
      mb.tri(U2, tipsD[sI], notchD[sI]); mb.tri(U2, notchD[sI], tipsD[s2]);
    }
    if (!lo) {
      // needle cards lying on the skirt and sticking out past its rim
      const n = spikes * 3;
      for (let c = 0; c < n; c++) {
        const a = R() * 6.283, rad = Rr * (0.3 + 0.82 * Math.sqrt(R()));
        const P = V3(off.x + Math.cos(a) * rad, y0 - drop * (rad / Rr) * 0.8 + 0.14, off.z + Math.sin(a) * rad);
        const out = V3(Math.cos(a), -0.2 - R() * 0.3, Math.sin(a)).normalize();
        const nrm = V3(Math.cos(a) * 0.5 + (R() - 0.5) * 0.4, 0.85, Math.sin(a) * 0.5 + (R() - 0.5) * 0.4).normalize();
        const ax = nrm.clone().cross(out).normalize();
        const sz = Rr * (0.42 + R() * 0.2), base = P.clone().addScaledVector(out, -sz * 0.45);
        const k = clamp(rad / Rr, 0, 1), col = new THREE.Color().copy(topC).lerp(tip, 0.15 + 0.5 * k).multiplyScalar(0.85 + R() * 0.2);
        const ids = [[-1, 0, 0, 0], [1, 0, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]].map(([x, y, u, w]) => {
          const Q = base.clone().addScaledVector(ax, x * sz * 0.6).addScaledVector(out, y * sz * 1.2);
          return mb.v(Q.x, Q.y, Q.z, nrm.x, nrm.y, nrm.z, col, sway(Q) + 0.04 * y, 0.5 + u * 0.5, w, 1);   // needle half of the atlas
        });
        mb.tri(ids[0], ids[1], ids[2]); mb.tri(ids[0], ids[2], ids[3]);
      }
    }
  }
  return mb.geo();
}

export function makeBush(seed, lod = 0) {
  const R = mulberry32(seed), mb = new MB();
  const sway = P => Math.pow(Math.max(P.y, 0) / 1.8, 1.5) * 0.25;
  const Cc = V3(0, 0.6, 0), colorFn = canopyColor(Cc, 0.8, new THREE.Color('#2f5f2c'), new THREE.Color('#5f9636'), new THREE.Color('#a4c650'));
  const nb = 5 + Math.floor(R() * 3);
  for (let b = 0; b < nb; b++) {
    const a = R() * 6.283, rr = R() * 0.8, P0 = V3(Math.cos(a) * rr, 0.35 + R() * 0.55, Math.sin(a) * rr), br = 0.5 + R() * 0.35;
    addBlob(mb, P0, br * 0.75, 1, { ncenter: Cc, nblend: 0.7, lump: 0.3, seed: seed + b, squash: 0.85, sway, color: (P) => colorFn(P, P.clone().sub(Cc).normalize()).multiplyScalar(0.82) });
    if (!lod) addCards(mb, P0, br * 1.25, 9, { ncenter: Cc, nblend: 0.75, seed: seed + b, squash: 0.85, size: 0.9, sway, color: colorFn });
    else addBlob(mb, P0, br * 1.05, 1, { ncenter: Cc, nblend: 0.75, lump: 0.3, seed: seed + b + 50, squash: 0.85, sway, color: (P) => colorFn(P, P.clone().sub(Cc).normalize()) });
  }
  return mb.geo();
}
