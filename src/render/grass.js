// GPU grass: blades are placed around the camera every frame from the field baked by src/objects/grass.js,
// so a meadow is covered to the horizon at a fixed cost.
//
// LOD: level k is a world-anchored lattice with cell size S0·2^k (one jittered blade per cell) drawn over a
// window of N×N cells around the camera. Every blade has a rank, and a blade at distance d is drawn only
// while rank < keep(d) = (D0/d)²: level k owns the ranks [4^-(k+1), 4^-k), which is exactly the share that
// survives out to the edge of its window. Density therefore falls smoothly with distance (constant blades
// per pixel), blades widen by 1/√keep to hold their coverage, and each blade shrinks into the ground over a
// band of distances instead of popping. Each level is split into tiles for frustum culling.
import * as THREE from 'three';
import { isSmall } from '../platform.js';
import { DETAIL } from '../world/grid.js';
import { mat } from './material.js';
import { PAL } from './uniforms.js';
import GRASS_TONE from './shaders/grass-tone.glsl.js';

const LEVELS = isSmall ? 4 : 5, N = isSmall ? 128 : 192, TILES = 4, TN = N / TILES;
const S0 = isSmall ? 0.2 : 0.17;                       // finest cell: ~4/(3·S0²) blades/m² at full density
const D0 = N * S0 / 4;                                  // full density out to D0, then (D0/d)²
const FAR = D0 * 2 ** LEVELS;                           // window edge of the last level
const SEGS = [5, 4, 3, 2, 2];

function bladeGeometry(segs) {
  const pos = [], idx = [];
  for (let i = 0; i < segs; i++) { const t = i / segs, half = 0.5 * Math.pow(1 - t, 0.72); pos.push(-half, t, 0, half, t, 0); }
  pos.push(0, 1, 0);
  for (let i = 0; i < segs - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const l = (segs - 1) * 2; idx.push(l, l + 1, l + 2);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
}

// cursor push: xz = position, w = strength (animated by src/app/pointer.js)
export const PUSH = new THREE.Vector4(0, -999, 0, 0);

const FIELD = new THREE.DataTexture(new Float32Array(4 * DETAIL.n * DETAIL.n), DETAIL.n, DETAIL.n, THREE.RGBAFormat, THREE.FloatType);
FIELD.minFilter = FIELD.magFilter = THREE.NearestFilter; FIELD.generateMipmaps = false;

const grassMat = (level) => mat(`
attribute vec2 iCell;
uniform sampler2D tField; uniform vec4 uField; uniform vec4 uLod; uniform vec3 uRange; uniform vec4 uPush;
varying float vT; varying vec3 vWP; varying vec3 vN; varying float vRand; varying float vGust; varying float vOcc;
vec4 hash42(vec2 p) { vec4 p4 = fract(p.xyxy * vec4(0.1031, 0.1030, 0.0973, 0.1099)); p4 += dot(p4, p4.wzxy + 33.33); return fract((p4.xxyz + p4.yzzw) * p4.zywx); }
vec4 tap(vec2 ij) { return texture2D(tField, (ij + 0.5) * uField.w); }
uniform vec3 uMid, uTipA, uTipB;
${GRASS_TONE}
void main(){
  // which blade: the tile origin (modelMatrix translation) is cell-aligned, iCell is the cell within the tile
  vec2 cell = floor(modelMatrix[3].xz / uLod.x + 0.5) + iCell;
  vec4 h1 = hash42(cell + uLod.w * 37.31), h2 = hash42(cell.yx * 1.731 + uLod.w * 11.7 + 71.3);
  vec2 xz = (cell + h1.xy) * uLod.x;
  vec2 f = (xz - uField.x) / uField.y, i0 = floor(f), t = f - i0;
  if (i0.x < 0.0 || i0.y < 0.0 || i0.x > uField.z - 2.0 || i0.y > uField.z - 2.0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  vec4 a = tap(i0), b = tap(i0 + vec2(1.0, 0.0)), c = tap(i0 + vec2(0.0, 1.0)), d = tap(i0 + vec2(1.0, 1.0));
  vec4 F = mix(mix(a, b, t.x), mix(c, d, t.x), t.y);   // height, density, blade height, occlusion
  vec3 gN = normalize(vec3(-mix(b.x - a.x, d.x - c.x, t.y), uField.y, -mix(c.x - a.x, d.x - b.x, t.x)));
  vec3 root = vec3(xz.x, F.x - 0.03, xz.y);
  float dist = length(cameraPosition - root);
  float keep = min(1.0, uRange.x * uRange.x / max(dist * dist, 1e-4));
  float rank = mix(uLod.y, uLod.z, h1.z);
  float vis = clamp((keep - rank) / (rank * 0.4), 0.0, 1.0)      // thinned out with distance
            * clamp((F.y - h1.w) / 0.05, 0.0, 1.0)                 // sparse where the field is sparse
            * (1.0 - smoothstep(uRange.y, uRange.z, dist));        // end of the grass range
  if (vis < 0.02) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  float widen = min(inversesqrt(keep), 18.0), clump = grassClump(xz);
  // distant blades become short wide tufts rather than long hairs on the skyline
  float h = F.z * (0.5 + 0.95 * clump + h2.y * 0.4) * (0.25 + 0.75 * vis) * mix(1.0, 0.62, smoothstep(2.0, 12.0, widen));
  float ang = h2.x * 6.2831, w = 0.04 * (0.75 + 0.5 * h2.z) * widen * vis, rnd = h2.w;
  float tt0 = position.y;
  vec3 side = vec3(cos(ang), 0.0, sin(ang)), face = vec3(-side.z, 0.0, side.x);
  float gust = gustAt(xz);
  float flutter = sin(uTime * (2.0 + uWind * 3.2) + rnd * 6.2831 + dot(xz, vec2(0.7, 0.5))) * 0.5 + 0.5;
  float bend = uWind * (0.16 + gust * 1.1) + flutter * 0.07 * (0.35 + uWind);
  vec2 toP = xz - uPush.xz; float pd = length(toP);
  float push = (1.0 - smoothstep(0.2, 2.2, pd)) * uPush.w;
  vec2 dir = uWindDir * bend + face.xz * (0.12 + rnd * 0.32) + (toP / max(pd, 0.001)) * push * 1.6;
  float amt = length(dir), tt = tt0 * tt0;
  vec3 p = side * position.x * w; p.y = tt0 * h; p.xz += dir * tt * h; p.y -= h * tt * min(amt * amt * 0.34, 0.62);
  vec3 world = root + p;
  if (dot(face, cameraPosition - world) < 0.0) face = -face;
  vN = normalize(mix(face, gN, 0.92)); vT = tt0; vRand = rnd; vGust = gust * uWind; vWP = world; vOcc = F.w;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`, `
uniform vec3 uRoot, uMid, uTipA, uTipB;
varying float vT; varying vec3 vWP; varying vec3 vN; varying float vRand; varying float vGust; varying float vOcc;
${GRASS_TONE}
void main(){
  vec3 midc, tip; grassTone(vWP.xz, midc, tip);
  // gentle base-to-tip gradient: overlapping blades must not form light/dark stripes
  vec3 body = mix(midc, tip, 0.3);
  vec3 col = mix(mix(uRoot, body, 0.75), body, smoothstep(0.0, 0.35, vT));
  col = mix(col, mix(body, tip, 0.75), smoothstep(0.62, 1.0, vT)) * (0.96 + vRand * 0.08);
  vec3 lit = lighting(col, normalize(vN), vWP, 0.2) * mix(0.86, 1.0, smoothstep(0.0, 0.5, vT));
  lit *= 1.0 - vOcc * 0.3;
  lit += col * uSkyAmb * 0.35 * (1.0 - gShadow) * (0.4 + 0.6 * vT);   // thin blades in shadow still pass skylight
  vec3 V = normalize(vWP - cameraPosition);
  // backlit blades glow: light through the leaf, strongest toward the tips and when looking into the sun
  lit += uSunColor * mix(tip, vec3(0.75, 0.9, 0.35), 0.35) * pow(max(dot(V, uSunDir), 0.0), 1.6) * vT * (0.5 + 0.6 * (1.0 - uSunDir.y)) * gShadow;
  lit += vec3(0.21, 0.23, 0.12) * vGust * smoothstep(0.45, 1.0, vT) * gShadow;
  gl_FragColor = vec4(applyFog(lit, vWP), 1.0);
}`, {
  uRoot: { value: PAL.root }, uMid: { value: PAL.mid }, uTipA: { value: PAL.tipA }, uTipB: { value: PAL.tipB }, uPush: { value: PUSH },
  tField: { value: FIELD }, uField: { value: new THREE.Vector4(DETAIL.min, DETAIL.step, DETAIL.n, 1 / DETAIL.n) },
  uLod: { value: new THREE.Vector4(S0 * 2 ** level, 4 ** -(level + 1) * (level === LEVELS - 1 ? 0 : 1), 4 ** -level, level) },
  uRange: { value: new THREE.Vector3(D0, FAR * 0.72, FAR * 0.94) }
}, { side: THREE.DoubleSide });

// coarse per-cell summary of the field (8m cells): max density and height range, for tile culling
const SUM = 8, SN = Math.ceil(DETAIL.size / SUM);
function summarize(field) {
  const n = DETAIL.n, dmax = new Float32Array(SN * SN), hmin = new Float32Array(SN * SN).fill(1e9), hmax = new Float32Array(SN * SN).fill(-1e9);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, c = Math.min(SN - 1, Math.floor(j * DETAIL.step / SUM)) * SN + Math.min(SN - 1, Math.floor(i * DETAIL.step / SUM));
    dmax[c] = Math.max(dmax[c], field[k * 4 + 1]); hmin[c] = Math.min(hmin[c], field[k * 4]); hmax[c] = Math.max(hmax[c], field[k * 4] + field[k * 4 + 2] * 1.5);
  }
  return { dmax, hmin, hmax };
}

export function createGrass(scene) {
  const group = new THREE.Group(); group.visible = false; scene.add(group);
  const cells = new Float32Array(TN * TN * 2);
  for (let j = 0; j < TN; j++) for (let i = 0; i < TN; i++) cells.set([i, j], (j * TN + i) * 2);
  const iCell = new THREE.InstancedBufferAttribute(cells, 2);
  const levels = [];
  for (let k = 0; k < LEVELS; k++) {
    const blade = bladeGeometry(SEGS[k]), material = grassMat(k), tiles = [];
    for (let t = 0; t < TILES * TILES; t++) {
      const g = new THREE.InstancedBufferGeometry();
      g.index = blade.index; g.setAttribute('position', blade.attributes.position); g.setAttribute('iCell', iCell);
      g.instanceCount = TN * TN; g.boundingSphere = new THREE.Sphere();
      const m = new THREE.Mesh(g, material); m.matrixAutoUpdate = false; group.add(m); tiles.push(m);
    }
    levels.push({ size: S0 * 2 ** k, tiles, ox: NaN, oz: NaN });
  }
  let sum = null;

  // a tile covering [x0, x0+s]×[z0, z0+s]: hidden when the field has no grass there, else a bounding sphere
  function placeTile(m, x0, z0, s) {
    const a = Math.max(0, Math.floor((x0 - DETAIL.min) / SUM)), b = Math.min(SN - 1, Math.floor((x0 + s - DETAIL.min) / SUM));
    const c = Math.max(0, Math.floor((z0 - DETAIL.min) / SUM)), d = Math.min(SN - 1, Math.floor((z0 + s - DETAIL.min) / SUM));
    let dm = 0, lo = 1e9, hi = -1e9;
    for (let j = c; j <= d; j++) for (let i = a; i <= b; i++) { const q = j * SN + i; if (sum.dmax[q] > 0) { dm = Math.max(dm, sum.dmax[q]); lo = Math.min(lo, sum.hmin[q]); hi = Math.max(hi, sum.hmax[q]); } }
    m.visible = dm > 0;
    if (!m.visible) return;
    m.matrix.makeTranslation(x0, 0, z0); m.matrixWorld.copy(m.matrix);
    m.geometry.boundingSphere.center.set(s / 2, (lo + hi) / 2, s / 2);
    m.geometry.boundingSphere.radius = Math.SQRT1_2 * s + (hi - lo) / 2 + 2;
  }

  return {
    PUSH,
    // field from distributeGrass(); null hides the grass
    setField(field) {
      if (!field) { group.visible = false; return; }
      FIELD.image.data.set(field); FIELD.needsUpdate = true;
      sum = summarize(field); group.visible = true;
      for (const L of levels) L.ox = NaN;
    },
    // re-centre each level's window on the camera (only when it crosses a cell)
    update(camera) {
      if (!group.visible) return;
      const p = camera.position;
      for (const L of levels) {
        const ox = (Math.floor(p.x / L.size) - N / 2) * L.size, oz = (Math.floor(p.z / L.size) - N / 2) * L.size;
        if (ox === L.ox && oz === L.oz) continue;
        L.ox = ox; L.oz = oz;
        const ts = TN * L.size;
        L.tiles.forEach((m, t) => placeTile(m, ox + (t % TILES) * ts, oz + Math.floor(t / TILES) * ts, ts));
      }
    },
    stats: () => ({ levels: LEVELS, window: N, tiles: levels.reduce((s, L) => s + L.tiles.filter(m => m.visible).length, 0), range: Math.round(FAR * 0.94), nearDensity: +(4 / 3 / (S0 * S0)).toFixed(1) })
  };
}
