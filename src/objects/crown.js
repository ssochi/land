// Broadleaf tree builder: a crown made of lobes, a skeleton grown into them, leaf cards shaded as soft balls.
//
//   1. Lobes (after Livny et al. 2011, "Texture-lobes for tree modelling"): the crown is a handful of rounded
//      leaf masses with gaps between them, not one ball. They are sampled with spacing inside a crown envelope.
//   2. Skeleton. The trunk and its first fork are laid explicitly, as in parametric tree models (Weber & Penn
//      1995): the lobes are grouped by direction around the trunk and one curved limb grows toward each group,
//      so the fork sits low and shows under the crown, as on a real oak. The rest grows by space colonization
//      (Runions et al. 2007) in two passes: the first uses only the lobe centres (and a few points around each),
//      so a branch heads into every lobe; the second fills every lobe with points and grows the twigs that carry
//      leaves and show through the gaps. Radii follow the pipe model over the whole tree.
//   3. Foliage: leaf cards on each lobe's shell whose normals are projected from that lobe's sphere (blended a
//      little toward the whole crown), the usual trick for stylised foliage: every lobe shades as one soft volume
//      instead of a scatter of flat cards. Colour darkens toward the inside and underside of each lobe and of the
//      crown. A darker inner blob per lobe keeps it from reading as see-through. In shadow, foliage still gets
//      part of the sun (render/props.js: the crown is porous, the shadow map treats each card as opaque).
//   lod 0: twigs + dense small cards; lod 1: fewer twigs, fewer and larger cards; lod 2: limbs, larger cards still.
import * as THREE from 'three';
import { clamp, smooth, mulberry32 } from '../core/math.js';
import { vnoise, vnoise3 } from '../core/noise.js';
import { MB, V3, addBlob } from './mesh-builder.js';
import { colonize, branchesToMesh } from './colonize.js';

// lobes inside an ellipsoid crown (centre C, radii rx, ry): the first near the top, the rest spaced over the
// outer part of the envelope and none far below its equator (the limbs show under the crown). Neighbours overlap
// by about half, so the crown stays one mass with bulges rather than a bunch of separate balls.
export function crownLobes(R, C, rx, ry, n, rmin, rmax) {
  const lobes = [{ c: V3(C.x + (R() - 0.5) * rx * 0.2, C.y + ry * 0.45, C.z + (R() - 0.5) * rx * 0.2), r: rmax * (0.9 + R() * 0.1) }];
  for (let tries = 0; lobes.length < n && tries < n * 200; tries++) {
    const u = R() * 2 - 1, a = R() * 6.283, s = Math.sqrt(1 - u * u), d = V3(s * Math.cos(a), u, s * Math.sin(a));
    if (d.y < -0.25 || (d.y < 0 && R() < 0.5)) continue;
    const k = 0.45 + R() * 0.5, r = rmin + (rmax - rmin) * Math.pow(R(), 0.7);
    const c = V3(C.x + d.x * rx * k, C.y + d.y * ry * k, C.z + d.z * rx * k);
    if (lobes.some(L => L.c.distanceTo(c) < (L.r + r) * 0.5)) continue;
    lobes.push({ c, r });
  }
  return lobes;
}

const UP = V3(0, 0.35, 0);

// a point inside lobe L (denser toward its surface, where the leaves are)
const inLobe = (R, L, sq) => {
  const u = R() * 2 - 1, a = R() * 6.283, s = Math.sqrt(1 - u * u), k = Math.pow(R(), 0.45) * L.r;
  return V3(L.c.x + s * Math.cos(a) * k, L.c.y + u * k * sq, L.c.z + s * Math.sin(a) * k);
};

// trunk (leaning, bent sideways by `wobble`) and `limbs` primary limbs: the lobes are clustered by their
// direction from the trunk top (k-means on the horizontal unit vectors) and each limb curves out from the top
// toward its cluster's centre (rising more steeply at its end and bowed a little sideways), stopping short of it
function scaffold(R, o, lobes) {
  const nodes = [], add = (p, parent) => { nodes.push({ p, parent }); return nodes.length - 1; };
  const steps = Math.max(2, Math.ceil(o.trunkH / o.seg)), wb = o.wobble || 0, ph = R() * 6.283;
  let top = -1;
  for (let k = 0; k <= steps; k++) {
    const t = k / steps, w = wb * Math.sin(t * 3.1 + ph) * t;
    top = add(V3(o.lean.x * t * t * o.trunkH + w * Math.cos(ph), t * o.trunkH, o.lean.z * t * t * o.trunkH + w * Math.sin(ph)), top);
  }
  const T = nodes[top].p, K = Math.min(o.limbs || 0, lobes.length);
  if (!K) return nodes;
  const dir = lobes.map(L => { const v = V3(L.c.x - T.x, 0, L.c.z - T.z); return v.lengthSq() > 1e-6 ? v.normalize() : V3(1, 0, 0); });
  const a0 = R() * 6.283, cen = Array.from({ length: K }, (_, i) => V3(Math.cos(a0 + i * 6.283 / K), 0, Math.sin(a0 + i * 6.283 / K)));
  let grp = [];
  for (let it = 0; it < 8; it++) {
    grp = dir.map(d => { let b = 0; cen.forEach((c, i) => { if (c.dot(d) > cen[b].dot(d)) b = i; }); return b; });
    cen.forEach((c, i) => { const m = V3(0, 0, 0); dir.forEach((d, j) => { if (grp[j] === i) m.add(d); }); if (m.lengthSq() > 1e-6) c.copy(m.normalize()); });
  }
  for (let i = 0; i < K; i++) {
    const m = V3(0, 0, 0); let w = 0;
    lobes.forEach((L, j) => { if (grp[j] === i) { m.addScaledVector(L.c, L.r * L.r); w += L.r * L.r; } });
    if (!w) continue;
    const D = m.divideScalar(w).sub(T).multiplyScalar(0.7), P1 = T.clone().addScaledVector(D, 0.5), bow = (R() - 0.5) * 0.6;
    P1.y -= D.y * 0.3; P1.x -= D.z * bow; P1.z += D.x * bow;
    const n = Math.max(2, Math.ceil(D.length() / o.seg));
    let prev = top;
    for (let k = 1; k <= n; k++) {
      const t = k / n, q = T.clone().multiplyScalar((1 - t) * (1 - t)).addScaledVector(P1, 2 * t * (1 - t)).addScaledVector(D.clone().add(T), t * t);
      q.x += (R() - 0.5) * o.seg * 0.3; q.y += (R() - 0.5) * o.seg * 0.2; q.z += (R() - 0.5) * o.seg * 0.3;
      prev = add(q, prev);
    }
  }
  return nodes;
}

// o: { trunkH, lean, wobble, limbs, C, rx, ry, lobes, sq (vertical squash of lobes), seg, baseR, tipR, jitter,
//      tropism, twigs (attraction points per lobe), leafSize, density (cards per m² of lobe shell), palette,
//      bark: fn, barkMinR [lod0, lod1, lod2], sway, seed }
export function buildBroadleaf(R, o, lod) {
  const mb = new MB(), sq = o.sq || 0.85, lobes = o.lobes, rmax = Math.max(...lobes.map(L => L.r));
  // pass 1: branches from the scaffold into each lobe (lobe centres plus a few points around them)
  const coarse = [];
  for (const L of lobes) { coarse.push(L.c.clone()); for (let k = 0; k < 2; k++) coarse.push(inLobe(R, { c: L.c, r: L.r * 0.5 }, sq)); }
  let ci = 0;
  const limbs = colonize(R, { nodes: scaffold(R, o, lobes), count: coarse.length, envelope: () => coarse[ci++ % coarse.length],
    infl: o.rx * 3 + o.ry * 2, kill: o.seg * 2.2, seg: o.seg, iters: 160, tropism: o.tropism, jitter: o.jitter * 1.6, tipR: o.tipR, pipe: 2.4, baseR: o.baseR, minR: 0.01 });
  // pass 2: twigs filling the lobes (skipped on the far LOD, which shows only the limbs)
  const nodes = lod > 1 ? limbs : colonize(R, { nodes: limbs, count: lobes.length * (lod ? Math.round(o.twigs * 0.4) : o.twigs), envelope: () => { const L = lobes[Math.floor(R() * lobes.length)]; return inLobe(R, L, sq); },
    infl: Math.max(o.seg * 5, rmax * 1.1), kill: o.seg * 1.6, seg: o.seg * 0.8, iters: 40, tropism: o.tropism * 0.5, jitter: o.jitter, tipR: o.tipR, pipe: 2.4, baseR: o.baseR, minR: 0.008 });
  branchesToMesh(mb, nodes, o.bark, o.sway, o.barkMinR[lod], [9, 6, 5][lod], [0.55, 0.8, 1.1][lod]);

  const P = o.palette, top = o.C.y + o.ry, bot = o.C.y - o.ry;
  // leaf colour: lighter toward the top of the crown and of each lobe, darker toward its inside and underside
  const leafCol = (Q, L, hue, depth) => {
    const tl = clamp((Q.y - L.c.y) / (L.r * sq) * 0.5 + 0.5, 0, 1), tc = clamp((Q.y - bot) / (top - bot), 0, 1);
    const c = new THREE.Color().copy(P.dark).lerp(P.mid, smooth(0.05, 0.6, tl * 0.6 + tc * 0.4)).lerp(P.light, smooth(0.55, 1, tl) * (0.45 + 0.55 * tc));
    return c.multiplyScalar((0.72 + 0.3 * depth) * hue);
  };
  // normal for a leaf vertex at Q: mostly the lobe's sphere, partly the crown's ellipsoid (so a lobe on the
  // shaded side of the crown stays darker than one on the sunny side), tilted up: leaves are lit through and
  // between each other, and a crown seen from below must not turn into a black underside
  const nrm = (Q, L) => {
    const a = Q.clone().sub(L.c).divideScalar(L.r), b = V3((Q.x - o.C.x) / o.rx, (Q.y - o.C.y) / o.ry, (Q.z - o.C.z) / o.rx);
    return a.multiplyScalar(0.6).addScaledVector(b, 0.4).add(UP).normalize();
  };
  lobes.forEach((L, li) => {
    const hue = 0.92 + vnoise(li * 3.7 + o.seed, 1.3) * 0.16;
    // blobs shade about a point between the lobe's centre and the crown's and a little below, like the cards'
    // blended, upward-tilted normals
    const nc = L.c.clone().lerp(o.C, 0.4); nc.y -= L.r * 0.35;
    addBlob(mb, L.c, L.r * 0.62, 1, { card: 12, ncenter: nc, nblend: 0.85, lump: 0.3, seed: o.seed + li * 7, squash: sq, sway: o.sway, color: Q => leafCol(Q, L, hue, 0.45).multiplyScalar(0.9) });
    // every level is the same leaf cards (each lobe draws them from its own stream, so the twigs a level grows
    // first do not move them): a farther level keeps one card in `keep`, enlarged to cover about the same area,
    // so the crown keeps its ragged outline, its gaps and its tone at the switch
    const area = 4 * Math.PI * L.r * L.r, n = Math.round(area * o.density), keep = [1, 3, 8][lod], scale = Math.sqrt(keep) * [1, 0.98, 0.9][lod];
    const RC = mulberry32(o.seed * 977 + li * 31 + 5);
    for (let k = 0; k < n; k++) {
      const u = RC() * 2 - 1, a = RC() * 6.283, s = Math.sqrt(1 - u * u), d = V3(s * Math.cos(a), u, s * Math.sin(a));
      if (d.y < -0.6 && RC() < 0.6) continue;                                   // fewer leaves on the shaded underside
      const lump = 1 + (vnoise3(d.x * 2.1 + li, d.y * 2.1, d.z * 2.1 - li) - 0.5) * 0.5;
      const depth = RC() < 0.15 ? 1 + RC() * 0.18 : 0.7 + RC() * 0.32;              // a few sprigs stick out past the shell
      // card plane at random: cards facing out of the lobe would turn edge-on along its rim and leave a smooth
      // silhouette; the shading comes from the projected normals, not from the plane
      const f = V3(RC() - 0.5, RC() - 0.5, RC() - 0.5).normalize();
      const t1 = (Math.abs(f.y) < 0.9 ? V3(0, 1, 0) : V3(1, 0, 0)).cross(f).normalize(), t2 = f.clone().cross(t1);
      const rot = RC() * 6.283, ax = t1.clone().multiplyScalar(Math.cos(rot)).addScaledVector(t2, Math.sin(rot)), ay = f.clone().cross(ax);
      // sprigs sticking out past the shell keep nearly their own size (they make the ragged outline); the rest
      // are enlarged and sit deeper, so a card reaches no farther out than the one it stands for
      const h0 = o.leafSize * (0.75 + RC() * 0.5) * 0.5, h = h0 * (depth > 1 ? Math.min(scale, 1.5) : scale), tint = 0.92 + RC() * 0.16;
      if (k % keep) continue;
      const rr = L.r * depth * lump - (h - h0) * (lod === 1 ? 0.5 : 0.7), c = L.c.clone().add(V3(d.x * rr, d.y * rr * sq, d.z * rr));
      const ids = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]].map(([x, y, uu, vv]) => {
        const Q = c.clone().addScaledVector(ax, x * h).addScaledVector(ay, y * h), nn = nrm(Q, L);
        return mb.v(Q.x, Q.y, Q.z, nn.x, nn.y, nn.z, leafCol(Q, L, hue, depth).multiplyScalar(tint), o.sway(Q), uu * 0.5, vv, 1);
      });
      mb.tri(ids[0], ids[1], ids[2]); mb.tri(ids[0], ids[2], ids[3]);
    }
  });
  return mb.geo();
}
