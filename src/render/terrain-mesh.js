// Terrain meshes for both grids. The shader layers meadow, rock strata, alpine, forest floor, snow, sand
// and lake bed from per-vertex fields, and implements the debug views (uDebug 1–5).
import * as THREE from 'three';
import { DETAIL, FAR, detailW } from '../world/grid.js';
import { cragOffset } from '../terrain/crag.js';
import { WATER, WDIST, OCC, COVER, FOREST_D, FOREST_F, FLOW_D, FLOW_F, PATH, TILL, TILL_DIR, ensureFlow } from '../world/fields.js';
import { mat } from './material.js';
import { PAL, ROCK_TINT } from './uniforms.js';
import { SHADOW, REFLECT } from './layers.js';
import GRASS_TONE from './shaders/grass-tone.glsl.js';

export const terrainMat = mat(`
attribute float aWear; attribute float aShore; attribute float aDepth; attribute float aCover; attribute float aOcc; attribute float aHide; attribute float aForest; attribute float aFlowN; attribute float aPath; attribute float aTill; attribute float aTillDir;
varying vec3 vWP; varying vec3 vN; varying float vWear; varying float vShore; varying float vDepth; varying float vCover; varying float vOcc; varying float vForest; varying float vFlowN; varying float vPath; varying float vTill; varying vec2 vTillDir;
void main(){
  vForest = aForest; vFlowN = aFlowN; vPath = aPath; vTill = aTill; vTillDir = vec2(cos(aTillDir), sin(aTillDir));
  vec3 p = position; p.y -= aHide * 8.0;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWP = w.xyz; vN = normal; vWear = aWear; vShore = aShore; vDepth = aDepth; vCover = aCover; vOcc = aOcc;
  gl_Position = projectionMatrix * viewMatrix * w;
}`, `
uniform vec3 uRoot, uMid, uTipA, uTipB, uSand, uRockTint; uniform float uSnowLine;
uniform sampler2D uRockA, uRockN, uSwardA, uSwardN, uDirtA, uDirtN;   // baked by src/render/texgen.js
varying vec3 vWP; varying vec3 vN; varying float vWear; varying float vShore; varying float vDepth; varying float vCover; varying float vOcc; varying float vForest; varying float vFlowN; varying float vPath; varying float vTill; varying vec2 vTillDir;
${GRASS_TONE}
// triplanar value noise: world-space detail that does not stretch down cliff faces
float triN(vec3 p, vec3 w) { return vnoise(p.zy) * w.x + vnoise(p.xz) * w.y + vnoise(p.xy) * w.z; }
// triplanar texture sample (planes zy, xz, xy at scale s)
vec4 triT(sampler2D t, vec3 p, vec3 w, float s) { return texture2D(t, p.zy * s) * w.x + texture2D(t, p.xz * s) * w.y + texture2D(t, p.xy * s) * w.z; }
// triplanar normal map with whiteout blending (Golus); cavity from the map alpha comes back in cav
vec3 triNormal(sampler2D t, vec3 p, vec3 n, vec3 w, float s, float k, out float cav) {
  vec4 ax = texture2D(t, p.zy * s), ay = texture2D(t, p.xz * s), az = texture2D(t, p.xy * s);
  vec3 tx = ax.xyz * 2.0 - 1.0, ty = ay.xyz * 2.0 - 1.0, tz = az.xyz * 2.0 - 1.0;
  tx.xy *= k; ty.xy *= k; tz.xy *= k;
  tx = vec3(tx.xy + n.zy, abs(tx.z) * n.x); ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y); tz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
  cav = ax.w * w.x + ay.w * w.y + az.w * w.z;
  return normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z);
}
void main(){
  vec3 Ng = normalize(vN), N = Ng; float slope = 1.0 - Ng.y;
  vec3 tw = pow(abs(Ng), vec3(4.0)); tw /= tw.x + tw.y + tw.z;
  float dist = length(vWP - cameraPosition), near = 1.0 - smoothstep(250.0, 1100.0, dist);
  float wet = smoothstep(0.32, 0.8, vFlowN);
  float px = length(fwidth(vWP.xz));   // metres per pixel: detail octaves fade out before they would alias
  vec3 g1 = vnoiseD(vWP.xz * 0.09), g2 = vnoiseD(vWP.xz * 0.31 + 5.0), g3 = vnoiseD(vWP.xz * 0.8 + 3.7);
  float tuftK = 1.0 - smoothstep(0.2, 0.8, px);
  N = normalize(N - vec3(g1.y + g2.y * 0.45, 0.0, g1.z + g2.z * 0.45) * 0.05 * near - vec3(g3.y, 0.0, g3.z) * 0.07 * tuftK * (1.0 - slope));
  float n1 = vnoise(vWP.xz * 0.06);
  float alt = vWP.y;
  // meadow = grass as seen from afar: the blades' average colour (src/render/shaders/grass-tone.glsl.js), mottled
  // by the same tuft field the blades grow in, so blade-covered and blade-less ground are one material
  vec3 gMid, gTip; grassTone(vWP.xz, gMid, gTip);
  float clump = mix(0.5, grassClump(vWP.xz), tuftK);
  float tuft = mix(0.5, vnoise(vWP.xz * 0.21 + 9.0), 1.0 - smoothstep(2.0, 6.0, px));
  float mottle = 0.78 + 0.3 * clump + 0.14 * tuft + 0.12 * fbm(vWP.xz * 0.022 + 4.0);
  // painted sward (baked strokes) at two scales: brightness and how far toward the bleached tip colour
  vec4 sw1 = texture2D(uSwardA, vWP.xz / 1.7), sw2 = texture2D(uSwardA, vWP.xz / 6.3 + 0.37);
  float swB = mix(sw1.r, sw2.r, 0.4) / 0.8, swT = mix(sw1.g, sw2.g, 0.4);
  vec3 meadow = mix(gMid, gTip, clamp(0.22 + swT * 0.55, 0.0, 1.0)) * 0.86 * mottle * mix(1.0, swB, 0.55);
  meadow = mix(meadow, vec3(0.6, 0.62, 0.34), smoothstep(45.0, 130.0, alt + n1 * 25.0) * 0.45);
  meadow = mix(meadow, vec3(0.42, 0.55, 0.3), smoothstep(110.0, 170.0, alt) * 0.5);
  meadow = mix(meadow, vec3(0.24, 0.44, 0.25), wet * 0.45);
  // up close under the blades: the stems' shaded mid tone, so gaps have depth without reading as dark holes
  vec3 sward = mix(gMid, gTip, 0.15 + swT * 0.3) * 0.8 * mottle * mix(1.0, swB, 0.5);
  vec3 base = mix(meadow, sward, clamp(vCover, 0.0, 1.0) * (1.0 - smoothstep(5.0, 30.0, dist)) * 0.95);
  float cavS; vec3 Ns = triNormal(uSwardN, vWP, N, vec3(0.0, 1.0, 0.0), 1.0 / 1.7, 0.6, cavS);
  N = normalize(mix(N, Ns, (1.0 - slope) * tuftK));
  // worn track: packed earth with grit, a ragged grassy edge and a slightly lighter centre
  float worn = smoothstep(0.3, 0.7, vPath + (vnoise(vWP.xz * 0.9) - 0.5) * 0.45);
  vec3 dirt = texture2D(uDirtA, vWP.xz / 3.2).rgb * (0.92 + 0.16 * vnoise(vWP.xz * 0.35)) * mix(1.0, 1.08, smoothstep(0.7, 1.0, vPath));
  float cavD; vec3 Nd = triNormal(uDirtN, vWP, N, vec3(0.0, 1.0, 0.0), 1.0 / 3.2, 1.0, cavD);
  dirt *= mix(0.7, 1.0, cavD);
  base = mix(base, dirt, worn); N = normalize(mix(N, Nd, worn));
  // ploughed field: ridges and furrows along the field's direction (filtered so they fade, not alias, far away)
  float till = smoothstep(0.25, 0.7, vTill);
  if (till > 0.0) {
    float fu = dot(vWP.xz, vec2(-vTillDir.y, vTillDir.x)) / 0.8, fwu = fwidth(fu), ridge = 0.5 + 0.5 * cos(fu * 6.2831);
    ridge = mix(0.5, ridge, 1.0 - smoothstep(0.2, 0.6, fwu));
    vec3 soil = texture2D(uDirtA, vWP.xz / 2.6).rgb * vec3(0.78, 0.7, 0.62) * mix(0.62, 1.08, ridge);
    soil = mix(soil, mix(gMid, gTip, 0.2) * 0.75, smoothstep(0.55, 0.9, ridge) * 0.35 * vnoise(vWP.xz * 0.7));   // weeds along the ridges
    base = mix(base, soil, till);
    vec3 fN = normalize(vec3(-vTillDir.y, 0.0, vTillDir.x)) * sin(fu * 6.2831) * 0.35 * (1.0 - smoothstep(0.2, 0.6, fwu));
    N = normalize(N + fN * till);
  }
  float wear = clamp(vWear, -2.0, 3.0);
  // rock: chunky facets with dark cracks, irregular warped strata, vertical weathering streaks, warm grey-beige
  // stone with lichen; strata widen with distance so they do not alias
  float rockAmt = smoothstep(0.34, 0.56, slope + clamp(wear, 0.0, 3.0) * 0.06 - clamp(-wear, 0.0, 2.0) * 0.08 + (n1 - 0.5) * 0.16);
  float alpine = smoothstep(125.0, 215.0, alt + (n1 - 0.5) * 50.0) * (1.0 - wet * 0.75);
  rockAmt = max(rockAmt, alpine * 0.62);
  vec3 rock = vec3(0.0);
  if (rockAmt > 0.01) {
    // rock: the baked fractured-slab texture (src/render/texgen.js) sampled triplanar at two scales so it never
    // visibly repeats; its normal map is the relief, its cavity term darkens cracks. Tinted per region: warm
    // pink-grey stone with cooler grey and ochre patches, lichen on ledges, faint broad bedding and streaks.
    float c1, c2;
    // 8m tile for fractures you see up close, 38m tile for the big slabs and crevices that shape a whole cliff
    vec3 n1 = triNormal(uRockN, vWP, Ng, tw, 1.0 / 8.0, 0.8, c1), n2 = triNormal(uRockN, vWP + 11.0, Ng, tw, 1.0 / 38.0, 1.6, c2);
    vec3 Nrock = normalize(n1 + n2 - Ng);
    vec3 alb = triT(uRockA, vWP, tw, 1.0 / 8.0).rgb * 0.5 + triT(uRockA, vWP + 11.0, tw, 1.0 / 38.0).rgb * 0.5;
    vec3 tint = mix(vec3(0.95, 0.8, 0.7), vec3(1.05, 0.93, 0.83), triN(vWP * 0.03 + 4.0, tw));
    tint = mix(tint, vec3(0.8, 0.8, 0.78), smoothstep(0.55, 0.75, triN(vWP * 0.012 + 8.0, tw)) * 0.5);
    tint = mix(tint, vec3(0.95, 0.78, 0.55), smoothstep(0.6, 0.8, triN(vWP * 0.02 + 2.0, tw)) * 0.3);
    rock = alb * tint * uRockTint;   // m.env({ rock }) shifts the whole palette (pale limestone, red sandstone)
    rock = mix(rock, vec3(0.42, 0.47, 0.3), smoothstep(0.55, 0.8, triN(vWP * 0.07 + 2.0, tw)) * smoothstep(0.25, 0.75, Nrock.y) * 0.6);
    float bed = sin((alt + triN(vWP * 0.01, tw) * 18.0) * 0.55) * 0.5 + 0.5;
    vec2 th = vec2(-Ng.z, Ng.x); float thl = length(th);
    float along = thl > 0.05 ? dot(vWP.xz, th / thl) : vWP.x;
    float streak = vnoise(vec2(along * 0.45, alt * 0.03)) * 0.6 + vnoise(vec2(along * 1.3, alt * 0.08 + 3.0)) * 0.4;
    rock *= mix(0.72, 1.05, c1) * mix(0.45, 1.1, c2) * (0.96 + 0.06 * bed) * (0.9 + 0.14 * streak) * (1.0 - clamp(wear * 0.1, 0.0, 0.25));
    N = normalize(mix(N, Nrock, rockAmt));
  }
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
    c = mix(c, vec3(0.75, 0.5, 0.2), smoothstep(0.3, 0.6, vPath) * 0.6);
    gl_FragColor = vec4(c, 1.0); return;
  }
  gl_FragColor = vec4(applyFog(c, vWP), 1.0);
}`, { uRoot: { value: PAL.root }, uMid: { value: PAL.mid }, uTipA: { value: PAL.tipA }, uTipB: { value: PAL.tipB }, uSand: { value: PAL.sand }, uRockTint: ROCK_TINT, uSnowLine: { value: 170 },
  uRockA: { value: null }, uRockN: { value: null }, uSwardA: { value: null }, uSwardN: { value: null }, uDirtA: { value: null }, uDirtN: { value: null } },
  { extensions: { derivatives: true } });

// baked textures from src/render/texgen.js bakeTextures()
export function setTerrainTextures(t) {
  const u = terrainMat.uniforms;
  u.uRockA.value = t.rock.albedo; u.uRockN.value = t.rock.normal; u.uSwardA.value = t.sward.albedo; u.uSwardN.value = t.sward.normal; u.uDirtA.value = t.dirt.albedo; u.uDirtN.value = t.dirt.normal;
}

// the FAR mesh shares uniforms but is pushed back in depth so DETAIL wins where they overlap
const farTerrainMat = terrainMat.clone();
farTerrainMat.uniforms = terrainMat.uniforms;
farTerrainMat.polygonOffset = true; farTerrainMat.polygonOffsetFactor = 2; farTerrainMat.polygonOffsetUnits = 2;

// cliff relief (src/terrain/crag.js) applied to the mesh vertices
function crag(G, pos, heights) {
  const n = G.n, st = G.step;
  for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
    const k = j * n + i, dx = (heights[k + 1] - heights[k - 1]) / (2 * st), dz = (heights[k + n] - heights[k - n]) / (2 * st), g = Math.hypot(dx, dz);
    const c = cragOffset(G, pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2], g);
    if (!c) continue;
    pos[k * 3] -= dx / g * c.o; pos[k * 3 + 2] -= dz / g * c.o; pos[k * 3 + 1] += c.dy;
  }
}

function gridGeometry(G, heights, extras) {
  const n = G.n, pos = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const k = j * n + i; pos[k * 3] = G.x(i); pos[k * 3 + 1] = heights[k]; pos[k * 3 + 2] = G.x(j); }
  crag(G, pos, heights);
  const idx = new Uint32Array((n - 1) * (n - 1) * 6); let o = 0;
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = d; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  for (const key in extras) g.setAttribute(key, new THREE.BufferAttribute(extras[key], 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}

// B: blended ground heights on DETAIL vertices (src/water/water.js currentB)
export function buildTerrainMeshes(group, B) {
  ensureFlow();
  const nD = DETAIL.n, flowAttr = new Float32Array(nD * nD), shore = new Float32Array(nD * nD), depth = new Float32Array(nD * nD), hide = new Float32Array(nD * nD), dWear = new Float32Array(nD * nD);
  for (let k = 0; k < nD * nD; k++) { shore[k] = WDIST[k]; depth[k] = WATER[k] > -1e8 ? Math.max(0, WATER[k] - B[k]) : 0; }
  // fold FAR-grid fields into the DETAIL mesh across the seam
  for (let j = 0; j < nD; j++) for (let i = 0; i < nD; i++) { const x = DETAIL.x(i), z = DETAIL.x(j), w = detailW(x, z), k = j * nD + i; dWear[k] = DETAIL.wear[k] + FAR.sample(x, z, FAR.wear) * (1 - w); FOREST_D[k] = Math.max(FOREST_D[k], FAR.sample(x, z, FOREST_F) * (1 - w)); flowAttr[k] = FLOW_D[k] * w + FAR.sample(x, z, FLOW_F) * (1 - w); }
  const detailMesh = new THREE.Mesh(gridGeometry(DETAIL, B, { aWear: dWear, aShore: shore, aDepth: depth, aCover: COVER, aOcc: OCC, aHide: hide, aForest: FOREST_D, aFlowN: flowAttr, aPath: PATH, aTill: TILL, aTillDir: TILL_DIR }), terrainMat);
  detailMesh.layers.enable(SHADOW); detailMesh.layers.enable(REFLECT);
  group.add(detailMesh);
  // FAR vertices well inside DETAIL are sunk 8m (aHide) so they never poke through
  const nF = FAR.n, fHide = new Float32Array(nF * nF), fShore = new Float32Array(nF * nF).fill(999), fZero = new Float32Array(nF * nF);
  for (let j = 0; j < nF; j++) for (let i = 0; i < nF; i++) {
    const x = FAR.x(i), z = FAR.x(j), din = Math.min(x - DETAIL.min, DETAIL.min + DETAIL.size - x, z - DETAIL.min, DETAIL.min + DETAIL.size - z);
    fHide[j * nF + i] = din > FAR.step * 1.6 ? 1 : 0;
  }
  const farMesh = new THREE.Mesh(gridGeometry(FAR, FAR.h, { aWear: FAR.wear, aShore: fShore, aDepth: fZero, aCover: fZero, aOcc: fZero, aHide: fHide, aForest: FOREST_F, aFlowN: FLOW_F, aPath: fZero, aTill: fZero, aTillDir: fZero }), farTerrainMat);
  farMesh.layers.enable(REFLECT); group.add(farMesh);
}
