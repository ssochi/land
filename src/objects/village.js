// Village layout: the logic behind m.village / m.building / m.fence / m.field. A village is laid out the way
// one grows: a main street (and a lane or two) through a central plaza with a well and stalls; house lots
// line the roads with their doors to the street; lots are levelled; back yards get fences and vegetable
// gardens; barrels, crates and wood piles sit by the houses; lanterns line the roads; trees fill gaps; fields
// with furrows lie outside, with a windmill on high ground and a signpost at the entrance. Everything is
// deterministic in the seed and avoids water, steep ground, roads and other lots.
import * as THREE from 'three';
import { clamp, smooth, mulberry32 } from '../core/math.js';
import { fbm } from '../core/noise.js';
import { DETAIL, heightAt } from '../world/grid.js';
import { TILL, TILL_DIR, LAWN, waterLevelAt, waterDistAt } from '../world/fields.js';
import { terrainChanged } from '../world/state.js';
import { catmull, nearestOnPath } from '../world/polyline.js';
import { TERRAIN } from '../terrain/index.js';
import { carvePath, wearDisc } from '../terrain/path.js';
import { houseParams, houseFootprints } from './buildings.js';
import { customVariant } from './kinds.js';
import { placeKind } from './placement.js';
import { groundAt } from '../terrain/crag.js';

const V2 = (x, z) => new THREE.Vector2(x, z);
// model space → world for a Y rotation r (three.js convention)
const toWorld = (x, z, r, lx, lz) => [x + lx * Math.cos(r) + lz * Math.sin(r), z - lx * Math.sin(r) + lz * Math.cos(r)];

// the four corners of a w × d rectangle centred at (x, z) rotated by r
const corners = (x, z, w, d, r) => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([a, b]) => toWorld(x, z, r, a, b));

// separating-axis overlap test for two rotated rectangles (with a margin)
function rectsOverlap(A, B, m) {
  for (const R of [A, B]) for (const ang of [R.r, R.r + Math.PI / 2]) {
    const ax = Math.cos(ang), az = -Math.sin(ang);
    const proj = Q => corners(Q.x, Q.z, Q.w + m, Q.d + m, Q.r).map(([x, z]) => x * ax + z * az);
    const a = proj(A), b = proj(B);
    if (Math.max(...a) < Math.min(...b) || Math.max(...b) < Math.min(...a)) return false;
  }
  return true;
}

// ground fit for a footprint: height spread across corners and centre
function siteOK(x, z, w, d, r, maxSpread) { return siteSpread([...corners(x, z, w, d, r), [x, z]], maxSpread); }
function siteSpread(pts, maxSpread) {
  if (pts.some(([px, pz]) => !DETAIL.inside(px, pz) || waterLevelAt(px, pz) != null)) return null;
  const hs = pts.map(([px, pz]) => heightAt(px, pz)), lo = Math.min(...hs), hi = Math.max(...hs);
  return hi - lo <= maxSpread ? hs.reduce((a, b) => a + b, 0) / hs.length : null;
}

// a house's parts (main body, wings, tower, tall chimney, porch) as world-space corner points, for fitting it to
// the ground
const footPoints = (x, z, r, P, m = 0.3) => houseFootprints(P, m).flatMap(([cx, cz, w, d]) => corners(...toWorld(x, z, r, cx, cz), w, d, r));
// is the model-frame point (lx, lz) on one of the house's parts (grown by m)?
const onHouse = (P, lx, lz, m) => houseFootprints(P, m).some(([cx, cz, w, d]) => Math.abs(lx - cx) < w / 2 && Math.abs(lz - cz) < d / 2);
// the rectangle a lot claims (its centre is off the house's when a wing reaches out on one side)
const lotBox = (x, z, r, P) => { const [cx, cz] = toWorld(x, z, r, P.lotC[0], P.lotC[1]); return { x: cx, z: cz, r, w: P.lot[0], d: P.lot[1] }; };

// fence spans (2.4m) along a polyline; `gates` lists span indices left open. Returns the number of spans.
export function fenceAlong(points, style = 'wood', gates = []) {
  const kind = style === 'stone' ? 'fence.stone' : style === 'yard' ? 'wall.yard' : 'fence.wood';
  let n = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i], [bx, bz] = points[i + 1], L = Math.hypot(bx - ax, bz - az), k = Math.max(1, Math.round(L / 2.4));
    const dx = (bx - ax) / L, dz = (bz - az) / L, step = L / k, r = Math.atan2(-dz, dx);
    for (let j = 0; j < k; j++, n++) {
      if (gates.includes(n)) continue;
      const t = (j + 0.5) * step;
      placeKind(kind, ax + dx * t, az + dz * t, { rotation: r, scale: step / 2.4, variant: n });   // spans stretch a little to meet the corners
    }
  }
  return n;
}

// a ploughed field centred at (x, z), size [w, d], furrows along its length (rotation r), planted with a crop
export function plantField(x, z, w, d, r, crop = 'wheat', seed = 0) {
  const R = mulberry32(4200 + seed * 37), n = DETAIL.n, st = DETAIL.step, ca = Math.cos(r), sa = Math.sin(r);
  // furrow direction in the shader is along (cos a, sin a) in xz: the field's local x axis in world is (cos r, −sin r)
  const dirAng = Math.atan2(-sa, ca), ext = Math.hypot(w, d) / 2 + 2;
  const i0 = clamp(Math.floor((x - ext - DETAIL.min) / st), 0, n - 1), i1 = clamp(Math.ceil((x + ext - DETAIL.min) / st), 0, n - 1);
  const j0 = clamp(Math.floor((z - ext - DETAIL.min) / st), 0, n - 1), j1 = clamp(Math.ceil((z + ext - DETAIL.min) / st), 0, n - 1);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const px = DETAIL.x(i) - x, pz = DETAIL.x(j) - z, lx = px * ca - pz * sa, lz = px * sa + pz * ca;   // world → field local
    const e = Math.min(w / 2 + 0.6 - Math.abs(lx), d / 2 + 0.6 - Math.abs(lz)), k = j * n + i;
    const v = clamp(e / 1.2, 0, 1);
    if (v > TILL[k]) { TILL[k] = v; TILL_DIR[k] = dirAng; }
  }
  const kind = crop === 'cabbage' ? 'crop.cabbage' : 'crop.wheat', dx = crop === 'cabbage' ? 0.75 : 0.55, dz = 0.8;
  let count = 0;
  for (let lz = -d / 2 + 0.5; lz <= d / 2 - 0.4; lz += dz) for (let lx = -w / 2 + 0.4; lx <= w / 2 - 0.4; lx += dx) {
    const [px, pz] = toWorld(x, z, r, lx + (R() - 0.5) * 0.12, lz);
    if (waterLevelAt(px, pz) != null) continue;
    placeKind(kind, px, pz, { rotation: R() * 6.283, scale: 0.85 + R() * 0.3 }); count++;
  }
  return count;
}

// a shelf cut into the slope for a house: ground above the floor level is lowered, ground below is left, so on
// a slope the downhill side stands on a tall stone base
const cutLot = (x, z, P, h, r) => { const b = lotBox(x, z, r, P); TERRAIN.flatten({ x: b.x, z: b.z, radius: Math.hypot(b.w, b.d) / 2 - 0.2, height: h, falloff: 2.5, strength: 1, warp: 0, seed: 0, mode: 'cut' }); };
const footHeights = (x, z, P, r) => [...footPoints(x, z, r, P), [x, z]].map(([px, pz]) => groundAt(px, pz));
// floor level: a little over half way up the slope, but never far above the ground at the door (a long flight
// of steps up from the street looks wrong; a deeper cut at the back is fine)
const floorLevel = (x, z, P, r) => {
  const hs = footHeights(x, z, P, r), lo = Math.min(...hs), [dx, dz] = toWorld(x, z, r, P.doorA, P.depth / 2 + 0.75);
  return Math.min(lo + (Math.max(...hs) - lo) * 0.55, groundAt(dx, dz) + 0.7);
};

// one house from parameters. flatten cuts its shelf first; level.h gives a floor level already cut (the
// village cuts every lot before building any). Returns its record.
export function buildHouse(x, z, r, params, seed, flatten = true, level = null) {
  const P0 = houseParams(seed, params);
  let h = level ? level.h : groundAt(x, z);
  if (!level && flatten) {
    h = floorLevel(x, z, P0, r); cutLot(x, z, P0, h, r); terrainChanged();
  }
  // the base reaches the lowest ground under the footprint; the model is lifted from its centre's ground to
  // the floor level; steps run down to the ground at the door
  const lo = Math.min(...footHeights(x, z, P0, r)), [sx, sz] = toWorld(x, z, r, P0.doorA, P0.depth / 2 + 0.75);
  const P = houseParams(seed, Object.assign({}, params, { base: +Math.max(1.2, h - lo + 0.9).toFixed(2), lift: +(h - groundAt(x, z)).toFixed(2), steps: +Math.max(0, h - groundAt(sx, sz)).toFixed(2) }));
  const { lot, lotC, door, ...keep } = P;   // every random choice is pinned, so the model matches the plan exactly
  const v = customVariant('house', keep);
  placeKind('house', x, z, { rotation: r, variant: v });
  const [dx, dz] = toWorld(x, z, r, door[0], door[1] + (P.steps > 0.25 ? Math.ceil((P.steps + 0.55) / 0.2) * 0.34 : 0));
  return { x: +x.toFixed(2), z: +z.toFixed(2), rotation: +r.toFixed(3), style: P.style, front: P.front, width: P.width, depth: P.depth, floors: P.floors, roof: P.roof,
    floor: +h.toFixed(2), door: [+dx.toFixed(2), +dz.toFixed(2)] };
}

// landmark buildings, given the lots nearest the plaza (Hateno's chief's house with its square tower, the big
// inn with dormers and a wing behind); each gets a walled front yard with an arch gate
const LANDMARKS = [
  { style: 'hateno', front: 'eave', width: 11.2, depth: 7.6, floors: 1, tower: 1.3, towerShape: 'square', roofShape: 'gable', wings: [], dormers: 0, chimney: 'tall', quoins: true, banner: false, porch: false, pergola: false, deck: false, lean: true, sign: false, ivy: true },
  { style: 'hateno', front: 'eave', width: 12.4, depth: 7.6, floors: 2, tower: 0, roofShape: 'gable', wings: [{ side: 'b', a: 3.2, w: 4.6, e: 4.2, floors: 2 }], dormers: 3, chimney: 'tall', quoins: true, banner: true, porch: false, pergola: true, deck: true, lean: false, sign: true, ivy: false }
];
const YARD = 5.2;   // depth of a landmark's front yard

const STYLE_MIX = { mixed: [['hateno', 0.76], ['stone', 0.1], ['timber', 0.08], ['hut', 0.06]] };
const pickStyle = (style, R) => {
  if (!STYLE_MIX[style]) return style;
  let u = R(); for (const [s, w] of STYLE_MIX[style]) { if ((u -= w) <= 0) return s; } return 'hateno';
};

// p: validated m.village params; rep: report row. Returns the layout for the script to build on.
export function buildVillage(p, rep) {
  const R = mulberry32(9100 + p.seed * 131), [cx, cz] = p.center, rad = p.radius;
  // 1. roads: given polylines, or a gently bending main street through the centre plus a lane or two
  let roads = [];
  if (p.roads && p.roads.length) roads = (Array.isArray(p.roads[0][0]) ? p.roads : [p.roads]).map((pts, i) => ({ pts, width: i ? 2.4 : 3.2 }));
  else {
    const a = R() * Math.PI, dx = Math.cos(a), dz = Math.sin(a), L = rad * 1.35, main = [];
    for (let k = -2; k <= 2; k++) { const off = k === 0 ? 0 : (R() - 0.5) * rad * 0.34; main.push([cx + dx * L * k / 2 - dz * off, cz + dz * L * k / 2 + dx * off]); }
    roads.push({ pts: main, width: 3.2 });
    const lanes = Math.max(1, Math.round(p.houses / 9));
    for (let l = 0; l < lanes; l++) {
      const t = (l % 2 ? 0.25 : -0.25) * (1 + Math.floor(l / 2) * 0.6) + (R() - 0.5) * 0.12, side = l % 4 < 2 ? 1 : -1;
      const sx = cx + dx * L * t, sz = cz + dz * L * t, len = rad * (0.75 + R() * 0.3), bend = (R() - 0.5) * 0.5;
      const nx = -dz * side, nz = dx * side;
      roads.push({ pts: [[sx, sz], [sx + (nx + dx * bend) * len * 0.5, sz + (nz + dz * bend) * len * 0.5], [sx + (nx + dx * bend * 1.6) * len, sz + (nz + dz * bend * 1.6) * len]], width: 2.4 });
    }
  }
  for (const rd of roads) { carvePath({ path: rd.pts, width: rd.width, flatten: 0.8, wear: 1 }); rd.curve = catmull(rd.pts.map(([x, z]) => V2(x, z)), 1); }
  const roadDist = (x, z) => Math.min(...roads.map(rd => nearestOnPath(rd.curve, x, z).d - rd.width / 2));
  // grass inside the village is grazed and trodden short (a ragged edge out past the last houses)
  {
    const n = DETAIL.n, st = DETAIL.step, R2 = rad * 1.15;
    const i0 = clamp(Math.floor((cx - R2 - 8 - DETAIL.min) / st), 0, n - 1), i1 = clamp(Math.ceil((cx + R2 + 8 - DETAIL.min) / st), 0, n - 1);
    const j0 = clamp(Math.floor((cz - R2 - 8 - DETAIL.min) / st), 0, n - 1), j1 = clamp(Math.ceil((cz + R2 + 8 - DETAIL.min) / st), 0, n - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = DETAIL.x(i), pz = DETAIL.x(j), e = R2 * (0.85 + 0.3 * fbm(px * 0.04, pz * 0.04, 2, p.seed + 5)), d = Math.hypot(px - cx, pz - cz);
      LAWN[j * n + i] = Math.max(LAWN[j * n + i], smooth(e + 8, e - 4, d) * p.lawn);
    }
  }
  // 2. plaza
  const plaza = p.plaza > 0 ? { x: cx, z: cz, radius: p.plaza } : null;
  if (plaza) { TERRAIN.flatten({ x: cx, z: cz, radius: p.plaza, height: heightAt(cx, cz), falloff: 6, strength: 0.85, warp: 3, seed: p.seed }); wearDisc(cx, cz, p.plaza, 0.85); }
  terrainChanged();

  // 3. lots along the roads, doors to the street, nearest the centre first
  const cands = [];
  roads.forEach((rd, ri) => {
    const c = rd.curve;
    for (let i = 1; i < c.length - 1; i += 3) {
      const t = V2(c[i + 1].x - c[i - 1].x, c[i + 1].y - c[i - 1].y).normalize();
      for (const side of [1, -1]) cands.push({ ri, x: c[i].x, z: c[i].y, nx: -t.y * side, nz: t.x * side, d0: Math.hypot(c[i].x - cx, c[i].y - cz) + R() * 6 });
    }
  });
  cands.sort((a, b) => a.d0 - b.d0);
  const lots = [], houses = [], rejected = { water: 0, slope: 0, space: 0, road: 0 };
  for (const cd of cands) {
    if (lots.length >= p.houses) break;
    const seed = p.seed * 1000 + lots.length * 7 + 1, style = pickStyle(p.style, R), mark = lots.filter(L => L.landmark).length < Math.min(p.landmarks, LANDMARKS.length);
    const P = houseParams(seed, mark ? LANDMARKS[lots.filter(L => L.landmark).length] : { style });
    // setbacks and angles vary so the street does not read as a row of boxes; lots are sized by each house's
    // real reach (a chimney outside a gable, a tower, a porch); a landmark stands back behind its yard
    const set = roads[cd.ri].width / 2 + 2.2 + R() * 2.6 + (P.porch ? 1.6 : 0) + (mark ? YARD - 1.2 : 0), x = cd.x + cd.nx * (set + P.depth / 2), z = cd.z + cd.nz * (set + P.depth / 2);
    const r = Math.atan2(-cd.nx, -cd.nz) + (R() - 0.5) * 0.24;   // local +z (the door) faces the road
    const lot = { x, z, r, box: lotBox(x, z, r, P) }, fp = footPoints(x, z, r, P);
    if (Math.hypot(x - cx, z - cz) > rad * 1.12) continue;
    if (plaza && Math.hypot(lot.box.x - cx, lot.box.z - cz) < plaza.radius + Math.max(P.lot[0], P.lot[1]) / 2 + 0.8) { rejected.space++; continue; }
    if (lots.some(L => rectsOverlap(L.box, lot.box, 1.0)) || R() < p.gaps) { rejected.space++; continue; }
    if (fp.some(([px, pz]) => roadDist(px, pz) < 0.5)) { rejected.road++; continue; }
    if (waterDistAt(lot.box.x, lot.box.z) < Math.max(P.lot[0], P.lot[1]) / 2 + 3) { rejected.water++; continue; }
    if (siteSpread([...fp, [x, z]], 2.2) == null) { rejected.slope++; continue; }   // on one shelf, not across a drop
    // no ledge between the door and the street (on terraced ground a lot can sit on the step above the road)
    {
      const [dx, dz] = toWorld(x, z, r, P.doorA, P.depth / 2 + 0.6);
      let lo = 1e9, hi = -1e9;
      for (let t = 0; t <= 1.001; t += 0.125) { const hh = heightAt(dx + (cd.x - dx) * t, dz + (cd.z - dz) * t); lo = Math.min(lo, hh); hi = Math.max(hi, hh); }
      if (hi - lo > 1.6) { rejected.slope++; continue; }
    }
    lots.push(Object.assign(lot, { P, seed, landmark: mark, street: [+cd.x.toFixed(2), +cd.z.toFixed(2)] }));
  }
  // 4. cut every lot's shelf (terrain edits all happen before anything is placed), then build
  for (const L of lots) L.h = floorLevel(L.x, L.z, L.P, L.r);
  for (const L of lots) cutLot(L.x, L.z, L.P, L.h, L.r);
  // a worn footpath from every door out to the street
  for (const L of lots) {
    const [dx, dz] = toWorld(L.x, L.z, L.r, L.P.doorA, L.P.depth / 2 + 0.6), [sx, sz] = L.street;
    carvePath({ path: [[dx, dz], [(dx + sx) / 2, (dz + sz) / 2], [sx, sz]], width: 1.4, flatten: 0, wear: 0.75 });
  }
  terrainChanged();
  for (const L of lots) houses.push(Object.assign(buildHouse(L.x, L.z, L.r, L.P, L.seed, false, { h: L.h }), { street: L.street }));

  const free = (x, z, m = 0.8) => roadDist(x, z) > m && !lots.some(L => rectsOverlap(L.box, { x, z, r: 0, w: 0.1, d: 0.1 }, m * 2)) && (!plaza || Math.hypot(x - cx, z - cz) > plaza.radius + 0.5) && waterLevelAt(x, z) == null && DETAIL.inside(x, z);
  let props = 0, fences = 0, gardens = 0;
  // 5. back yards: fence on three sides, a vegetable patch or a hay bale and wood pile inside
  for (const L of lots) {
    if (R() > p.fences) continue;
    const hw = L.P.width / 2 + 1.2, back = L.P.depth / 2 + 6, front = L.P.depth / 2 - 0.4;
    const yard = { x: toWorld(L.x, L.z, L.r, 0, -(L.P.depth / 2 + 3))[0], z: toWorld(L.x, L.z, L.r, 0, -(L.P.depth / 2 + 3))[1], r: L.r, w: hw * 2, d: 6 };
    if (lots.some(o => o !== L && rectsOverlap(o.box, yard, 0.5)) || corners(yard.x, yard.z, yard.w, yard.d, yard.r).some(([px, pz]) => roadDist(px, pz) < 0.3 || waterLevelAt(px, pz) != null)) continue;
    const loc = [[-hw, -front], [-hw, -back], [hw, -back], [hw, -front]];
    // not through a wing or the tower
    if (loc.slice(1).some(([a, b], i) => { const [a0, b0] = loc[i]; for (let t = 0; t <= 1; t += 0.1) if (onHouse(L.P, a0 + (a - a0) * t, b0 + (b - b0) * t, 0.4)) return true; return false; })) continue;
    const pts = loc.map(([a, b]) => toWorld(L.x, L.z, L.r, a, b));
    fences += fenceAlong(pts, R() < 0.25 ? 'stone' : 'wood', [Math.floor(R() * 6)]);
    const gl = (R() - 0.5) * hw * 0.6, gw = Math.min(hw * 1.2, 5);
    if (R() < 0.6) { if (![-gw / 2, gw / 2].some(dx => onHouse(L.P, gl + dx, -(L.P.depth / 2 + 3.4), 0.6))) { const [gx, gz] = toWorld(L.x, L.z, L.r, gl, -(L.P.depth / 2 + 3.4)); plantField(gx, gz, gw, 3.2, L.r, 'cabbage', L.seed); gardens++; } }
    else if (!onHouse(L.P, -hw + 1.2, -back + 1.2, 1.0)) { const [hx, hz] = toWorld(L.x, L.z, L.r, -hw + 1.2, -back + 1.2); placeKind('haybale', hx, hz, { rotation: L.r + R() }); props++; }
  }
  // the side walls a chimney or tower stands against (model frame: side ±1 along x, lz along the depth)
  const sideBlocked = (P, side, lz) => P.front === 'gable'
    ? lz < -P.depth / 2 + 1.2 || (P.tower && side === -P.towerSide && lz < 0.5)
    : (P.chimney === 'tall' && side === P.chimSide) || (P.tower && side === P.towerSide && lz < 0.5);
  // 5b. a landmark's walled front yard: low plastered walls from its sides round to the front, an arch gate where
  // the path to the door goes through (TotK's chief's house)
  let yards = 0;
  for (const L of lots) {
    if (!L.landmark) continue;
    const W = L.P.width / 2 + 1.3, hz = L.P.depth / 2 + 0.25, zf = L.P.depth / 2 + YARD - 0.6, ga = L.P.doorA, k = 1.1;   // k: rounded corner
    // each side runs from the front wall out to the gate; it starts where it leaves the house (a chimney or
    // tower at that corner pushes the start out)
    const sides = [[[-L.P.width / 2 + 0.4, hz], [-W, hz], [-W, zf - k], [-W + k * 0.3, zf - k * 0.3], [-W + k, zf], [ga - 1.45, zf]],
      [[L.P.width / 2 - 0.4, hz], [W, hz], [W, zf - k], [W - k * 0.3, zf - k * 0.3], [W - k, zf], [ga + 1.45, zf]]].map(seg => {
      for (let i = 0; i < seg.length - 1; i++) {
        const [a0, b0] = seg[i], [a1, b1] = seg[i + 1];
        for (let t = 0; t <= 1; t += 0.05) { const a = a0 + (a1 - a0) * t, b = b0 + (b1 - b0) * t; if (!onHouse(L.P, a, b, 0.35)) return [[a, b], ...seg.slice(i + 1)]; }
      }
      return null;
    });
    const clear = seg => seg && seg.slice(1).every(([a, b], i) => { const [a0, b0] = seg[i]; for (let t = 0; t <= 1; t += 0.1) { const lx = a0 + (a - a0) * t, lz = b0 + (b - b0) * t, [wx, wz] = toWorld(L.x, L.z, L.r, lx, lz);
      if (onHouse(L.P, lx, lz, 0.3) || roadDist(wx, wz) < 0.4 || waterLevelAt(wx, wz) != null || lots.some(o => o !== L && rectsOverlap(o.box, { x: wx, z: wz, r: 0, w: 0.4, d: 0.4 }, 0.3))) return false; } return true; });
    const [left, right] = sides;
    if (!clear(left) || !clear(right) || ga - 1.45 < -W + k || ga + 1.45 > W - k) continue;
    const world = seg => seg.map(([a, b]) => toWorld(L.x, L.z, L.r, a, b));
    fences += fenceAlong(world(left), 'yard') + fenceAlong(world(right), 'yard');
    const [gx, gz] = toWorld(L.x, L.z, L.r, ga, zf);
    placeKind('arch', gx, gz, { rotation: L.r, variant: yards }); yards++;
  }
  // 6. clutter by the houses: barrels, crates, wood piles, the odd cart
  const clutter = [['barrel', 0.35], ['crate', 0.25], ['woodpile', 0.25], ['cart', 0.08], ['haybale', 0.07]];
  for (const L of lots) {
    const n = Math.round((1 + R() * 2) * p.props);
    for (let k = 0; k < n; k++) {
      let u = R(), kind = 'barrel'; for (const [kk, w] of clutter) { if ((u -= w) <= 0) { kind = kk; break; } }
      const side = R() < 0.5 ? -1 : 1, lx = side * (L.P.width / 2 + 0.9 + R() * 0.6), lz = (R() - 0.3) * L.P.depth * 0.8;
      if (sideBlocked(L.P, side, lz) || onHouse(L.P, lx, lz, 0.6)) continue;
      const [px, pz] = toWorld(L.x, L.z, L.r, lx, lz);
      if (roadDist(px, pz) < 0.6 || waterLevelAt(px, pz) != null) continue;
      placeKind(kind, px, pz, { rotation: L.r + (kind === 'woodpile' ? 0 : R() * 6.283) }); props++;
      if (kind === 'barrel' && R() < 0.6) { const [qx, qz] = toWorld(L.x, L.z, L.r, lx + 0.4, lz + 0.75); placeKind('barrel', qx, qz, { rotation: R() * 6 }); props++; }
    }
  }
  // 6b. planting along the walls: flower clumps in front, shrubs and flowers down the sides
  const FLOWERS = ['flower.daisy', 'flower.poppy', 'flower.lupine', 'flower.buttercup'];
  for (const L of lots) {
    const hw = L.P.width / 2, hd = L.P.depth / 2, fk = FLOWERS[Math.floor(R() * FLOWERS.length)];
    for (let k = 0; k < 7; k++) {
      const side = R() < 0.5 ? -1 : 1;
      let lx, lz;
      if (k < 3) { lx = (R() - 0.5) * L.P.width * 0.9; lz = hd + 0.45 + R() * 0.3; if (Math.abs(lx - L.P.doorA) < 1.4) continue; }
      else { lx = side * (hw + 0.55 + R() * 0.4); lz = (R() - 0.5) * L.P.depth * 0.9; if (sideBlocked(L.P, side, lz)) continue; }
      if (onHouse(L.P, lx, lz, 0.3)) continue;
      const [px, pz] = toWorld(L.x, L.z, L.r, lx, lz);
      if (roadDist(px, pz) < 0.8 || waterLevelAt(px, pz) != null) continue;
      if (k >= 3 && R() < 0.45) placeKind('bush', px, pz, { rotation: R() * 6.283, scale: 0.4 + R() * 0.3 });
      else for (let j = 0; j < 3; j++) placeKind(fk, px + (R() - 0.5) * 0.7, pz + (R() - 0.5) * 0.7, { rotation: R() * 6.283 });
    }
  }
  // 7. plaza: well, stalls facing the middle, lanterns round it
  let lanterns = 0;
  if (plaza) {
    placeKind('well', cx, cz, { rotation: R() * 6.283 });
    const ns = Math.max(0, Math.min(4, Math.round(p.houses / 6)));
    for (let k = 0; k < ns; k++) { const a = R() * 6.283 + k * 6.283 / ns, rr = plaza.radius - 2.2, sx = cx + Math.cos(a) * rr, sz = cz + Math.sin(a) * rr; if (roadDist(sx, sz) > 0.8) { placeKind('stall', sx, sz, { rotation: Math.atan2(cx - sx, cz - sz) }); props++; } }
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.6, rr = plaza.radius + 0.6, lx = cx + Math.cos(a) * rr, lz = cz + Math.sin(a) * rr; if (roadDist(lx, lz) > 0.4) { placeKind('lantern', lx, lz, { rotation: -a }); lanterns++; } }
  }
  // 8. lanterns along the roads, alternating sides
  if (p.lanterns > 0) for (const rd of roads) {
    const c = rd.curve; let acc = 0, side = 1;
    for (let i = 1; i < c.length - 1; i++) {
      acc += c[i].distanceTo(c[i - 1]);
      if (acc < p.lanterns) continue;
      acc = 0; side = -side;
      const t = V2(c[i + 1].x - c[i - 1].x, c[i + 1].y - c[i - 1].y).normalize(), o = rd.width / 2 + 0.8;
      const lx = c[i].x - t.y * side * o, lz = c[i].y + t.x * side * o;
      if (!lots.some(L => rectsOverlap(L.box, { x: lx, z: lz, r: 0, w: 0.3, d: 0.3 }, 0.6)) && waterLevelAt(lx, lz) == null && (!plaza || Math.hypot(lx - cx, lz - cz) > plaza.radius + 1)) {
        placeKind('lantern', lx, lz, { rotation: Math.atan2(t.y * side, -t.x * side) + Math.PI / 2 }); lanterns++;
      }
    }
  }
  // 9. fields outside the houses, oriented to face the centre, with a fence on most
  const fields = [];
  for (let k = 0, tries = 0; k < p.fields && tries < 60; tries++) {
    const a = R() * 6.283, rr = rad * (1.2 + R() * 0.5), fx = cx + Math.cos(a) * rr, fz = cz + Math.sin(a) * rr, w = 16 + R() * 10, d = 11 + R() * 6, r = -a + (R() - 0.5) * 0.3;
    const F = { x: fx, z: fz, r, w: w + 2, d: d + 2 };
    if (lots.some(L => rectsOverlap(L.box, F, 3)) || fields.some(G => rectsOverlap(G, F, 3))) continue;
    if (corners(fx, fz, w + 2, d + 2, r).some(([px, pz]) => roadDist(px, pz) < 0.5)) continue;
    if (siteOK(fx, fz, w, d, r, 3.5) == null || waterDistAt(fx, fz) < Math.hypot(w, d) / 2 + 2) continue;
    const crop = R() < 0.75 ? 'wheat' : 'cabbage', plants = plantField(fx, fz, w, d, r, crop, p.seed * 31 + k);
    if (R() < 0.7) fenceAlong([...corners(fx, fz, w + 1.6, d + 1.6, r), corners(fx, fz, w + 1.6, d + 1.6, r)[0]], R() < 0.5 ? 'stone' : 'wood', [2]);
    fields.push(Object.assign(F, { crop, plants })); k++;
  }
  // 10. trees: a few great old trees as landmarks by the plaza and the yards, the rest in clumps of two or three
  // round the gaps and the edge (Hateno's trees stand in groups, not one per gap)
  let trees = 0;
  const nt = Math.round(p.houses * 0.9 * p.trees), placedT = [];
  const okTree = (tx, tz, m) => free(tx, tz, m) && !placedT.some(([x, z, s]) => Math.hypot(x - tx, z - tz) < 4.5 + s * 2) && !fields.some(F => rectsOverlap(F, { x: tx, z: tz, r: 0, w: 1, d: 1 }, 2));
  for (let k = 0, tries = 0, heroes = Math.max(1, Math.round(nt * 0.12)); k < heroes && tries < 200; tries++) {
    const a = R() * 6.283, rr = (plaza ? plaza.radius : 6) + 5 + R() * rad * 0.5, tx = cx + Math.cos(a) * rr, tz = cz + Math.sin(a) * rr;
    if (!okTree(tx, tz, 5)) continue;
    const s = 1.05 + R() * 0.3;
    placeKind('tree.big', tx, tz, { rotation: R() * 6.283, scale: s }); placedT.push([tx, tz, 2.5]); trees++; k++;
  }
  for (let tries = 0; trees < nt && tries < nt * 30; tries++) {
    const a = R() * 6.283, rr = rad * (0.3 + Math.sqrt(R()) * 0.95), gx = cx + Math.cos(a) * rr, gz = cz + Math.sin(a) * rr, n = 1 + Math.floor(R() * 3);
    if (!okTree(gx, gz, 3)) continue;
    for (let j = 0; j < n && trees < nt; j++) {
      const tx = gx + (j ? (R() - 0.5) * 9 : 0), tz = gz + (j ? (R() - 0.5) * 9 : 0);
      if (j && !okTree(tx, tz, 2.5)) continue;
      const u = R(), kind = u < 0.3 ? 'tree.big' : u < 0.8 ? 'tree.oak' : 'tree.birch';
      placeKind(kind, tx, tz, { rotation: R() * 6.283, scale: kind === 'tree.big' ? 0.6 + R() * 0.25 : 0.8 + R() * 0.4 }); placedT.push([tx, tz, kind === 'tree.big' ? 1 : 0]); trees++;
    }
  }
  // 11. windmill on the highest open ground near the fields; signpost at the entrance
  let windmill = null;
  if (p.windmill) {
    let best = null;
    for (let k = 0; k < 40; k++) {
      const a = R() * 6.283, rr = rad * (1.15 + R() * 0.45), x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr, h = siteOK(x, z, 6, 6, 0, 2.5);
      if (h == null || !free(x, z, 3) || fields.some(F => rectsOverlap(F, { x, z, r: 0, w: 6, d: 6 }, 1))) continue;
      if (!best || h > best.h) best = { x, z, h };
    }
    if (best) { placeKind('windmill', best.x, best.z, { rotation: Math.atan2(cx - best.x, cz - best.z) }); windmill = [+best.x.toFixed(1), +best.z.toFixed(1)]; }
  }
  const e0 = roads[0].curve[2], e1 = roads[0].curve[3];
  if (e0 && e1) { const t = V2(e1.x - e0.x, e1.y - e0.y).normalize(); placeKind('signpost', e0.x - t.y * (roads[0].width / 2 + 1), e0.y + t.x * (roads[0].width / 2 + 1), { rotation: R() }); }

  const pre = rep.note ? rep.note + ' · ' : '';  // keep the caller's warning (terrain edited after lakes/objects)
  rep.note = pre + `${houses.length}/${p.houses} 栋房屋 · ${roads.length} 条路 · ${lanterns} 盏灯 · ${fields.length} 块田 · ${fences} 段篱笆 · ${trees} 棵树 · ${props} 件杂物`
    + (houses.length < p.houses ? ` · 没放下的宅基地：${Object.entries(rejected).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ')}` : '');
  if (houses.length < p.houses * 0.6) { rep.status = 'warn'; rep.note += ' · 房屋不足六成，加大 radius、换平坦的地方或给出 roads'; }
  rep.data = { houses: houses.length, lanterns, fields: fields.length, fences, trees, props, gardens, yards };
  return {
    houses, plaza, windmill, lanterns, trees,
    roads: roads.map(rd => ({ width: rd.width, points: rd.pts.map(([x, z]) => [+x.toFixed(1), +z.toFixed(1)]) })),
    fields: fields.map(F => ({ x: +F.x.toFixed(1), z: +F.z.toFixed(1), width: +(F.w - 2).toFixed(1), depth: +(F.d - 2).toFixed(1), rotation: +F.r.toFixed(3), crop: F.crop }))
  };
}
