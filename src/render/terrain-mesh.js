// Terrain meshes for both grids. The shader layers meadow, rock strata, alpine, forest floor, snow, sand
// and lake bed from per-vertex fields, and implements the debug views (uDebug 1–5).
import * as THREE from 'three';
import { DETAIL, FAR, detailW } from '../world/grid.js';
import { WATER, WDIST, OCC, COVER, FOREST_D, FOREST_F, FLOW_D, FLOW_F, ensureFlow } from '../world/fields.js';
import { mat } from './material.js';
import { PAL } from './uniforms.js';

export const terrainMat = mat(`
attribute float aWear; attribute float aShore; attribute float aDepth; attribute float aCover; attribute float aOcc; attribute float aHide; attribute float aForest; attribute float aFlowN;
varying vec3 vWP; varying vec3 vN; varying float vWear; varying float vShore; varying float vDepth; varying float vCover; varying float vOcc; varying float vForest; varying float vFlowN;
void main(){
  vForest = aForest; vFlowN = aFlowN;
  vec3 p = position; p.y -= aHide * 8.0;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWP = w.xyz; vN = normal; vWear = aWear; vShore = aShore; vDepth = aDepth; vCover = aCover; vOcc = aOcc;
  gl_Position = projectionMatrix * viewMatrix * w;
}`, `
uniform vec3 uRoot, uMid, uTipA, uTipB, uSand; uniform float uSnowLine;
varying vec3 vWP; varying vec3 vN; varying float vWear; varying float vShore; varying float vDepth; varying float vCover; varying float vOcc; varying float vForest; varying float vFlowN;
void main(){
  vec3 N = normalize(vN); float slope = 1.0 - N.y;
  float wet = smoothstep(0.32, 0.8, vFlowN);
  vec3 g1 = vnoiseD(vWP.xz * 0.09), g2 = vnoiseD(vWP.xz * 0.31 + 5.0);
  float bumpK = mix(0.05, 0.55, smoothstep(0.25, 0.55, slope)) * (1.0 - smoothstep(300.0, 1100.0, length(vWP - cameraPosition)));
  N = normalize(N - vec3(g1.y + g2.y * 0.45, 0.0, g1.z + g2.z * 0.45) * bumpK);
  float n1 = vnoise(vWP.xz * 0.06), pn = fbm(vWP.xz * 0.035);
  float alt = vWP.y;
  vec3 meadow = mix(mix(uMid, uTipB, 0.6), mix(uMid, uTipA, 0.62), smoothstep(0.35, 0.7, pn));
  meadow *= 0.9 + 0.2 * vnoise(vWP.xz * vec2(0.35, 1.4));
  meadow = mix(meadow, vec3(0.6, 0.62, 0.34), smoothstep(45.0, 130.0, alt + n1 * 25.0) * 0.55);
  meadow = mix(meadow, vec3(0.42, 0.55, 0.3), smoothstep(110.0, 170.0, alt) * 0.5);
  meadow *= 0.86;
  meadow = mix(meadow, vec3(0.26, 0.47, 0.27), wet * 0.45);
  float big = fbm(vWP.xz * 0.0075 + 13.0);
  meadow = mix(meadow, vec3(0.74, 0.7, 0.38), smoothstep(0.55, 0.72, big) * 0.45);
  meadow = mix(meadow, vec3(0.3, 0.48, 0.3), smoothstep(0.45, 0.28, big) * 0.5);
  vec3 base = mix(meadow, mix(uRoot, uMid, 0.8), clamp(vCover, 0.0, 1.0) * 0.75);
  float wear = clamp(vWear, -2.0, 3.0);
  float strata = sin(alt * 0.32 + n1 * 4.0 + vnoise(vWP.xz * 0.02) * 3.0) * 0.5 + 0.5;
  vec3 rock = mix(vec3(0.38, 0.35, 0.31), vec3(0.58, 0.53, 0.46), strata * 0.6 + n1 * 0.4);
  rock *= 1.0 - clamp(wear * 0.12, 0.0, 0.3);
  float rockAmt = smoothstep(0.36, 0.6, slope + clamp(wear, 0.0, 3.0) * 0.06 - clamp(-wear, 0.0, 2.0) * 0.08 + (n1 - 0.5) * 0.16);
  rock *= 0.86 + 0.28 * vnoise(vec2(vWP.x + vWP.z, vWP.y * 3.0) * 0.12);
  float alpine = smoothstep(125.0, 215.0, alt + (n1 - 0.5) * 50.0) * (1.0 - wet * 0.75);
  rockAmt = max(rockAmt, alpine * 0.62);
  base = mix(base, rock, rockAmt);
  vec3 forestFloor = vec3(0.15, 0.26, 0.15) * (0.85 + 0.3 * n1);
  base = mix(base, forestFloor, clamp(vForest, 0.0, 1.0) * 0.85 * (1.0 - rockAmt * 0.5));
  float snow = smoothstep(uSnowLine, uSnowLine + 28.0, alt + (n1 - 0.5) * 45.0 - wear * 1.8 + wet * 30.0) * (1.0 - smoothstep(0.42, 0.72, slope));
  base = mix(base, vec3(0.94, 0.96, 1.0), snow);
  float shore = 1.0 - smoothstep(0.4, 3.2, vShore);
  vec3 sand = uSand * (0.88 + 0.24 * n1);
  base = mix(base, sand, shore * (1.0 - clamp(vCover, 0.0, 1.0) * 0.8));
  base = mix(base, mix(sand * 0.8, vec3(0.24, 0.32, 0.27), smoothstep(0.6, 4.5, vDepth)), smoothstep(0.0, 0.3, vDepth));
  vec3 c = lighting(base, N, vWP, 0.3) * (1.0 - vOcc * 0.3);
  if (uDebug > 0.5) {
    if (uDebug < 1.5) c = mix(vec3(0.2, 0.6, 0.3), vec3(0.9, 0.2, 0.15), smoothstep(0.0, 0.7, slope));
    else if (uDebug < 2.5) c = vec3(fract(alt / 10.0) * 0.4 + 0.4) * mix(vec3(0.4, 0.7, 0.4), vec3(1.0, 0.95, 0.85), clamp(alt / 220.0, 0.0, 1.0));
    else if (uDebug < 3.5) c = vec3(0.55) + vec3(0.45, -0.25, -0.3) * clamp(wear * 0.6, 0.0, 1.0) + vec3(-0.3, -0.1, 0.4) * clamp(-wear * 0.8, 0.0, 1.0);
    else if (uDebug < 4.5) c = mix(vec3(0.15, 0.4, 0.9), vec3(0.85), smoothstep(0.0, 30.0, vShore));
    else c = mix(vec3(0.86, 0.76, 0.52), vec3(0.08, 0.32, 0.9), vFlowN);
    gl_FragColor = vec4(c, 1.0); return;
  }
  gl_FragColor = vec4(applyFog(c, vWP), 1.0);
}`, { uRoot: { value: PAL.root }, uMid: { value: PAL.mid }, uTipA: { value: PAL.tipA }, uTipB: { value: PAL.tipB }, uSand: { value: PAL.sand }, uSnowLine: { value: 170 } });

// the FAR mesh shares uniforms but is pushed back in depth so DETAIL wins where they overlap
const farTerrainMat = terrainMat.clone();
farTerrainMat.uniforms = terrainMat.uniforms;
farTerrainMat.polygonOffset = true; farTerrainMat.polygonOffsetFactor = 2; farTerrainMat.polygonOffsetUnits = 2;

const _nv = new THREE.Vector3();
function gridGeometry(G, heights, extras) {
  const n = G.n, pos = new Float32Array(n * n * 3), nor = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const k = j * n + i; pos[k * 3] = G.x(i); pos[k * 3 + 1] = heights[k]; pos[k * 3 + 2] = G.x(j); }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, l = heights[j * n + Math.max(0, i - 1)], r = heights[j * n + Math.min(n - 1, i + 1)];
    const d = heights[Math.max(0, j - 1) * n + i], u = heights[Math.min(n - 1, j + 1) * n + i];
    const v = _nv.set(l - r, 2 * G.step, d - u).normalize();
    nor[k * 3] = v.x; nor[k * 3 + 1] = v.y; nor[k * 3 + 2] = v.z;
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6); let o = 0;
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = d; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  for (const key in extras) g.setAttribute(key, new THREE.BufferAttribute(extras[key], 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

// B: blended ground heights on DETAIL vertices (src/water/water.js currentB)
export function buildTerrainMeshes(group, B) {
  ensureFlow();
  const nD = DETAIL.n, flowAttr = new Float32Array(nD * nD), shore = new Float32Array(nD * nD), depth = new Float32Array(nD * nD), hide = new Float32Array(nD * nD), dWear = new Float32Array(nD * nD);
  for (let k = 0; k < nD * nD; k++) { shore[k] = WDIST[k]; depth[k] = WATER[k] > -1e8 ? Math.max(0, WATER[k] - B[k]) : 0; }
  // fold FAR-grid fields into the DETAIL mesh across the seam
  for (let j = 0; j < nD; j++) for (let i = 0; i < nD; i++) { const x = DETAIL.x(i), z = DETAIL.x(j), w = detailW(x, z), k = j * nD + i; dWear[k] = DETAIL.wear[k] + FAR.sample(x, z, FAR.wear) * (1 - w); FOREST_D[k] = Math.max(FOREST_D[k], FAR.sample(x, z, FOREST_F) * (1 - w)); flowAttr[k] = FLOW_D[k] * w + FAR.sample(x, z, FLOW_F) * (1 - w); }
  const detailMesh = new THREE.Mesh(gridGeometry(DETAIL, B, { aWear: dWear, aShore: shore, aDepth: depth, aCover: COVER, aOcc: OCC, aHide: hide, aForest: FOREST_D, aFlowN: flowAttr }), terrainMat);
  detailMesh.layers.enable(1);
  group.add(detailMesh);
  // FAR vertices well inside DETAIL are sunk 8m (aHide) so they never poke through
  const nF = FAR.n, fHide = new Float32Array(nF * nF), fShore = new Float32Array(nF * nF).fill(999), fZero = new Float32Array(nF * nF);
  for (let j = 0; j < nF; j++) for (let i = 0; i < nF; i++) {
    const x = FAR.x(i), z = FAR.x(j), din = Math.min(x - DETAIL.min, DETAIL.min + DETAIL.size - x, z - DETAIL.min, DETAIL.min + DETAIL.size - z);
    fHide[j * nF + i] = din > FAR.step * 1.6 ? 1 : 0;
  }
  group.add(new THREE.Mesh(gridGeometry(FAR, FAR.h, { aWear: FAR.wear, aShore: fShore, aDepth: fZero, aCover: fZero, aOcc: fZero, aHide: fHide, aForest: FOREST_F, aFlowN: FLOW_F }), farTerrainMat));
}
