// Prop materials (trees, flowers, rocks, buildings) with wind sway, leaf-card alpha to coverage, translucency
// and rim light, and the LOD-bucketed instanced meshes built from the placement list.
import * as THREE from 'three';
import { isSmall } from '../platform.js';
import { normalAt } from '../world/grid.js';
import { KINDS, kindGeo, lodLevels } from '../objects/kinds.js';
import { INST } from '../objects/placement.js';
import { mat } from './material.js';
import { LEAF_TEX } from './textures.js';
import { SHADOW, REFLECT } from './layers.js';
import { ROCK_TINT, U } from './uniforms.js';
import { ATLAS } from './texgen.js';

// 1 when the scene target is multisampled (set by src/render/post.js): leaf cards then use alpha to coverage
export const A2C = { value: 0 };
// baked textures (src/render/texgen.js): rock for textured stone, the building-material atlas; set by
// setPropTextures(). Keep the shader's texture count at 16 or below (see checkTextureUnits in editor.js).
const ROCK_A = { value: null }, ROCK_N = { value: null }, BLD_A = { value: null }, BLD_N = { value: null };
export function setPropTextures(t) {
  ROCK_A.value = t.rock.albedo; ROCK_N.value = t.rock.normal; BLD_A.value = t.atlas.albedo; BLD_N.value = t.atlas.normal;
}
// GLSL constants for the atlas layout
const AT = `const vec2 AT_SIZE = vec2(${ATLAS.w}.0, ${ATLAS.h}.0); const float AT_COLS = ${ATLAS.cols}.0, AT_CELL = ${ATLAS.cell}.0, AT_PAD = ${ATLAS.pad}.0;`;

const propMat = (o) => mat(`
attribute vec3 aColor; attribute float aSway; attribute vec2 aUV; attribute float aCard; attribute float aFade;
uniform float uSwayAmp; uniform float uSwayFreq;
varying vec3 vC; varying vec3 vWP; varying vec3 vSP; varying vec3 vN; varying vec2 vUV; varying float vCard; varying float vH; varying float vFade;
void main(){
  vUV = aUV; vCard = aCard; vFade = aFade;
  mat4 m = modelMatrix * instanceMatrix;
  vec3 pos = position, nrm = normal;
  if (aCard > 19.5) {
    // windmill rotor: spins about the model's z axis through the hub (hub height in aSway); card − 20 is its material
    float hub = aSway, ang = uTime * (0.5 + uWind * 0.9) + fract(sin(dot(m[3].xz, vec2(12.9898, 78.233))) * 43758.5) * 6.2831;
    mat2 rot = mat2(cos(ang), sin(ang), -sin(ang), cos(ang));
    pos.xy = rot * (pos.xy - vec2(0.0, hub)) + vec2(0.0, hub); nrm.xy = rot * nrm.xy; vCard = aCard - 20.0;
  }
  vec4 w = m * vec4(pos, 1.0);
  vSP = w.xyz;   // unswayed: shadows are looked up here, matching the (unswayed) shadow pass, so swaying leaves do not shimmer
  vec3 root = (m * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vH = w.y - root.y;   // height above the model's base (ivy climbs from the ground)
  float g = gustAt(root.xz);
  float ph = sin(uTime * uSwayFreq * (1.0 + uWind) + root.x * 0.37 + root.z * 0.23 + position.y * 0.5);
  float amt = aCard > 19.5 ? 0.0 : aSway * uSwayAmp * (0.15 + uWind * (0.5 + 0.9 * g));
  w.xz += uWindDir * amt * (0.6 + 0.4 * ph) + vec2(-uWindDir.y, uWindDir.x) * amt * 0.3 * ph;
  w.y -= amt * amt * 0.2;
  vWP = w.xyz; vN = normalize(mat3(m) * nrm); vC = aColor;
  gl_Position = projectionMatrix * viewMatrix * w;
}`, `
uniform float uSharp; uniform float uTrans; uniform sampler2D uLeaf; uniform float uA2C; uniform sampler2D uRockA, uRockN; uniform vec3 uRockTint;
uniform sampler2D uBldA, uBldN;
${AT}
// one building material from the atlas: tile with fract(), but take the filter footprint from the continuous
// uv (no mip seam where the tile wraps) and cap it so the filter stays inside the cell's 32px gutter
void bld(float slot, vec2 uv, out vec4 a, out vec4 n) {
  vec2 sc = vec2(AT_CELL - 2.0 * AT_PAD) / AT_SIZE;
  vec2 st = (vec2(mod(slot, AT_COLS), floor(slot / AT_COLS)) * AT_CELL + AT_PAD) / AT_SIZE + fract(uv) * sc;
  vec2 gx = dFdx(uv) * sc, gy = dFdy(uv) * sc;
  float px = max(length(gx * AT_SIZE), length(gy * AT_SIZE));
  float k = min(1.0, 12.0 / max(px, 1e-4));
  a = texture2DGradEXT(uBldA, st, gx * k, gy * k); n = texture2DGradEXT(uBldN, st, gx * k, gy * k);
  // past the cap the pattern is under-filtered and speckles (roof tiles seen at a grazing angle): fade toward the
  // material's average, a tiny mip of the middle of its cell
  float far = smoothstep(12.0, 36.0, px);
  if (far > 0.0) {
    vec2 mid = (vec2(mod(slot, AT_COLS), floor(slot / AT_COLS)) + 0.5) * AT_CELL / AT_SIZE;
    a = mix(a, texture2DLodEXT(uBldA, mid, 6.0), far); n = mix(n, texture2DLodEXT(uBldN, mid, 6.0), far);
  }
}
// normal map on uv-mapped geometry without stored tangents: a cotangent frame from screen-space derivatives
vec3 perturb(vec3 N, vec3 p, vec2 uv, vec3 tn) {
  vec3 dp1 = dFdx(p), dp2 = dFdy(p); vec2 du1 = dFdx(uv), du2 = dFdy(uv);
  vec3 d2 = cross(dp2, N), d1 = cross(N, dp1), T = d2 * du1.x + d1 * du2.x, B = d2 * du1.y + d1 * du2.y;
  float im = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
  return normalize(mat3(T * im, B * im, N) * tn);
}
varying vec3 vC; varying vec3 vWP; varying vec3 vSP; varying vec3 vN; varying vec2 vUV; varying float vCard; varying float vH; varying float vFade;
void main(){
  if (lodClip(vFade, gl_FragCoord.xy)) discard;
  vec3 alb = vC; float alpha = 1.0;
  bool card = vCard > 0.5 && vCard < 1.5;
  bool foliage = card || (vCard > 11.5 && vCard < 12.5);   // leaf cards, and the leaf masses of far trees (12)
  if (card) {
    vec4 lt = texture2D(uLeaf, vUV);
    // small mips average leaf alpha toward the gaps, so distant canopies would thin out and sparkle: boost by mip level
    vec2 tx = vUV * vec2(1024.0, 512.0);
    float lod = max(0.0, 0.5 * log2(max(dot(dFdx(tx), dFdx(tx)), dot(dFdy(tx), dFdy(tx)))));
    float a = lt.a * (1.0 + lod * 0.22);
    // alpha to coverage: a sharpened alpha gives MSAA-smoothed leaf edges instead of stair-stepped cut-outs
    alpha = clamp((a - 0.42) / max(fwidth(a), 1e-4) + 0.5, 0.0, 1.0);
    if (alpha < mix(0.5, 0.02, uA2C)) discard;
    alb *= 0.74 + 0.4 * lt.r;
  }
  vec3 N = normalize(vN); if (!gl_FrontFacing && !card) N = -N;
  float glow = 0.0;
  if ((vCard > 3.5 && vCard < 11.5) || (vCard > 12.5 && vCard < 13.5)) {
    // building surfaces, uv in metres, textures tile every 2m: 4 thatch · 5 shingle · 6 window · 7 wood · 8 plaster
    // · 9 clay tile · 10 rubble stone · 11 lamp glass (glows by day too, brighter at night) · 13 dressed stone
    vec2 uv = vUV * 0.5; vec4 ta, tn;
    if (vCard > 5.5 && vCard < 6.5) { ta = vec4(vec3(0.06, 0.07, 0.085) / max(vC, vec3(0.01)), 1.0); tn = vec4(0.5, 0.5, 1.0, 1.0); glow = 1.0; }   // dark glass by day
    else if (vCard > 10.5 && vCard < 11.5) { ta = vec4(1.0); tn = vec4(0.5, 0.5, 1.0, 1.0); glow = 2.0; }
    else {
      // atlas slots (texgen.js ATLAS): thatch 0 · shingle 1 · plaster 2 · wood 3 · tile 4 · rubble 5 · dressed stone 6
      float slot = vCard < 4.5 ? 0.0 : vCard < 5.5 ? 1.0 : vCard < 7.5 ? 3.0 : vCard < 8.5 ? 2.0 : vCard < 9.5 ? 4.0 : vCard < 10.5 ? 5.0 : 6.0;
      bld(slot, uv, ta, tn);
      if (vCard > 7.5 && vCard < 8.5 && abs(N.y) < 0.7) {
        // stucco over metres (the 2m tile alone would repeat): a broad tone, grime splashed up from the ground,
        // and plaster worn off near the ground along a ragged edge (and in the odd patch higher up), showing the
        // rubble stones it covers, set back under a thin lip that shades the stone just below it. Heights are
        // from the wall's foot: stucco v starts at 0 there (buildings.js), whatever the house stands on.
        vec2 tg = vec2(-N.z, N.x) / max(length(N.xz), 1e-3), wq = vec2(dot(vSP.xz, tg), vSP.y);
        float hb = vUV.y;
        float tone = vnoise(wq * 0.4 + 3.1) * 0.65 + vnoise(wq * 1.4 + 7.7) * 0.35;
        float edge = -0.2 + 0.8 * vnoise(vec2(wq.x * 0.7, 1.7)) + 0.25 * vnoise(vec2(wq.x * 3.1, 5.3));   // below 0: intact to the base
        // the edge hugs the stones: it rides up over a stone's crown and dips into the joints around it
        vec4 ra, rn; bld(5.0, uv, ra, rn);
        float aw = max(0.015, fwidth(hb)), d = hb - edge - (ra.a - 0.45) * 0.3;
        float patchN = vnoise(wq * vec2(0.9, 1.3) + 11.0) + 0.15 * vnoise(wq * 4.0 + 2.0) + (ra.a - 0.45) * 0.12;
        float bare = max(1.0 - smoothstep(-aw, aw, d), smoothstep(0.85, 0.87, patchN) * (1.0 - smoothstep(0.9, 2.1, hb)));
        ta.rgb *= (0.93 + 0.12 * tone) * mix(0.84, 1.0, smoothstep(0.0, 1.2, hb + (tone - 0.5) * 0.8));
        ta.rgb *= 1.0 + 0.07 * (1.0 - smoothstep(0.0, 0.03 + aw, d)) * step(0.0, d);       // the plaster's lit edge
        if (bare > 0.001) {
          ra.rgb *= vec3(0.78, 0.73, 0.64) / max(vC, vec3(0.05)) * (1.0 - 0.4 * smoothstep(-0.06, 0.0, d) * step(d, 0.0));
          ta = mix(ta, ra, bare); tn = mix(tn, rn, bare);
        }
      }
    }
    // toon: flatter relief and shallower cavities — the painted look carries the material, not fine shading
    N = perturb(N, vSP, uv, (tn.xyz * 2.0 - 1.0) * vec3(1.0 - 0.4 * uToon, 1.0 - 0.4 * uToon, 1.0));
    alb *= ta.rgb * mix(mix(0.62, 0.8, uToon), 1.05, tn.w) * 1.25;
  } else if (vCard > 2.5 && vCard < 3.5) {
    // textured stone (boulders, outcrops): the baked rock texture and normal map, triplanar in world space
    vec3 tw = pow(abs(N), vec3(4.0)); tw /= tw.x + tw.y + tw.z;
    vec3 P = vSP / 2.6;
    vec4 ax = texture2D(uRockN, P.zy), ay = texture2D(uRockN, P.xz), az = texture2D(uRockN, P.xy);
    vec3 tx = ax.xyz * 2.0 - 1.0, ty = ay.xyz * 2.0 - 1.0, tz = az.xyz * 2.0 - 1.0;
    tx = vec3(tx.xy + N.zy, abs(tx.z) * N.x); ty = vec3(ty.xy + N.xz, abs(ty.z) * N.y); tz = vec3(tz.xy + N.xy, abs(tz.z) * N.z);
    N = normalize(tx.zyx * tw.x + ty.xzy * tw.y + tz.xyz * tw.z);
    vec3 ta = texture2D(uRockA, P.zy).rgb * tw.x + texture2D(uRockA, P.xz).rgb * tw.y + texture2D(uRockA, P.xy).rgb * tw.z;
    alb *= ta / 0.76 * mix(0.6, 1.05, ax.w * tw.x + ay.w * tw.y + az.w * tw.z) * uRockTint;
  } else if (vCard > 1.5) {
    // masonry: courses 0.55m high in world y, blocks ~1.1m along the face, staggered per course, each with its
    // own tone; joints and tones are filtered by the pixel footprint and fade to their average with distance
    vec2 tg = vec2(-N.z, N.x); tg /= max(length(tg), 1e-3);
    float v = vSP.y / 0.55, row = floor(v);
    float u = dot(vSP.xz, tg) / 1.1 + 0.5 * mod(row, 2.0) + hash12(vec2(row, 7.3)) * 0.4, col = floor(u);
    vec2 fw = fwidth(vec2(u, v)), f = abs(fract(vec2(u, v)) - 0.5);
    float detail = 1.0 - smoothstep(0.1, 0.32, max(fw.x, fw.y)) * step(0.0, 1.0 - abs(N.y));
    float ju = 1.0 - smoothstep(0.03 - fw.x, 0.03 + fw.x, 0.5 - f.x);     // 0.5 - f: distance to the joint line
    float jv = 1.0 - smoothstep(0.055 - fw.y, 0.055 + fw.y, 0.5 - f.y);
    float joint = mix(0.14, max(ju, jv), detail) * (1.0 - step(0.9, abs(N.y)));   // flat tops have no courses
    float bh = hash12(vec2(col, row) + 0.37);
    float streak = vnoise(vec2(dot(vSP.xz, tg) * 1.7, vSP.y * 0.06));   // rain streaks down the face
    // stone grain inside the blocks: the baked rock texture on continuous uvs (a per-block offset would break
    // the uv derivatives at every joint and pick a tiny mip there, drawing bright seams)
    vec4 sg = texture2D(uRockA, vec2(dot(vSP.xz, tg), vSP.y) / 1.5);
    alb *= mix(vec3(1.0), (0.86 + 0.28 * bh) * (0.9 + 0.16 * streak) * mix(vec3(1.0), sg.rgb / 0.76, 0.6), detail) * (1.0 - 0.3 * joint);
    // ivy: leafy patches creeping up from the ground; the leaf atlas gives their edges a foliage silhouette
    float along = dot(vSP.xz, tg), iv = vnoise(vec2(along * 0.45, vSP.y * 0.22) + 3.7) * 0.65 + vnoise(vec2(along * 1.6, vSP.y * 0.9)) * 0.35;
    vec4 lf = texture2D(uLeaf, vec2(along, vSP.y) * vec2(0.28, 0.28) * vec2(0.5, 1.0));
    float reach = 1.0 - smoothstep(1.0, 5.5, vH - (iv - 0.5) * 6.0);
    float ivy = smoothstep(0.5, 0.56, iv * 0.75 + lf.a * 0.35) * reach * (1.0 - step(0.9, abs(N.y)));
    vec3 leaf = mix(vec3(0.16, 0.28, 0.11), vec3(0.42, 0.56, 0.2), lf.r * mix(0.5, 1.0, detail));
    alb = mix(alb, leaf, ivy);
  }
  vec3 c = lighting(alb, N, vSP, uSharp);
  // a crown is porous and its leaves translucent, but the shadow map sees every leaf card as opaque, so a crown
  // would shade itself black inside: in shadow, foliage still gets part of the sun (more on the side facing it),
  // as grass blades still pass skylight
  if (foliage) c += alb * uSunColor * (1.0 - gShadow) * 0.4 * (0.35 + 0.65 * clamp(dot(N, uSunDir) * 0.5 + 0.5, 0.0, 1.0));
  vec3 V = normalize(vWP - cameraPosition);
  float back = pow(max(dot(V, uSunDir), 0.0), 3.0);
  c += uSunColor * mix(alb, vec3(0.72, 0.86, 0.3), card ? 0.35 : 0.0) * back * (uTrans + (card ? 0.45 : 0.0)) * gShadow;   // leaves glow when backlit
  // rim light; toon makes it a crisp band along the lit side of the silhouette (the BotW contour glow)
  float fr = 1.0 - max(dot(N, -V), 0.0);
  float rim = mix(pow(fr, 3.0), smoothstep(0.62, 0.72, fr) * 0.55, uToon) * max(dot(N, uSunDir) + 0.3, 0.0);
  c += uSunColor * rim * (0.14 + 0.1 * uToon) * mix(1.0, gShadow, uToon * 0.6);
  // lit windows (and lantern glass): warm interior light that comes up as the sun goes down
  if (glow > 0.0) {
    vec3 Vw = normalize(cameraPosition - vSP), Rw = reflect(-Vw, N);
    c += mix(uFogColor, uZenith, clamp(Rw.y * 1.5, 0.0, 1.0)) * (0.05 + 0.3 * pow(1.0 - max(dot(N, Vw), 0.0), 3.0)) * (1.0 - uNight);   // glass reflects the sky
    c = mix(c, vC * vec3(1.0, 0.72, 0.4) * (1.6 + 0.3 * sin(uTime * 2.3 + vSP.x * 3.1)), max(uNight, glow > 1.5 ? 0.55 : 0.0));
  }
  gl_FragColor = vec4(applyFog(c, vWP), alpha);
}`, { uSwayAmp: { value: o.amp }, uSwayFreq: { value: o.freq }, uSharp: { value: o.sharp }, uTrans: { value: o.trans }, uLeaf: { value: LEAF_TEX }, uA2C: A2C, uRockA: ROCK_A, uRockN: ROCK_N, uRockTint: ROCK_TINT, uBldA: BLD_A, uBldN: BLD_N },
  { side: o.double ? THREE.DoubleSide : THREE.FrontSide, alphaToCoverage: !!o.double, extensions: { derivatives: true, shaderTextureLOD: true } });

// keyed by KINDS[kind].mat
const MATS = {
  tree: propMat({ amp: 1, freq: 1.3, sharp: 0.5, trans: 0.3, double: true }),
  flower: propMat({ amp: 1, freq: 2.4, sharp: 0.3, trans: 0.5, double: true }),
  rock: propMat({ amp: 0, freq: 0, sharp: 0.75, trans: 0 }),
  building: propMat({ amp: 0, freq: 0, sharp: 0.55, trans: 0 })
};

const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _pp = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

// LOD tuning, shared with the agent API (mapEditor.debug.lod): fade is the cross-fade time in seconds; force ≥ 0
// pins every instance to that level (clamped to the kind's last one) for side-by-side checks of two levels;
// bias scales every switch distance. Set dirty after changing force or bias.
export const LOD = { fade: 0.6, force: -1, bias: isSmall ? 0.65 : 1, dirty: false };

// One InstancedMesh per kind / variant / LOD level. Instances are re-bucketed by distance to the camera
// whenever it has moved a couple of metres: the detailed model up close, lighter ones farther out (KINDS[k].lod
// distances × LOD.bias, with 6% hysteresis so nothing flickers at a boundary), nothing beyond KINDS[k].cull.
// A level change never pops: for LOD.fade seconds the instance sits in both meshes and the two dissolve into
// each other (aFade, lodClip in common.glsl.js); past the cull distance a model dissolves away the same way and
// fades back in when the camera returns. Jumps (a camera teleport, the first frame after a pause or a
// rebuild) switch at once, so a snapshot never catches a half-faded scene.
// Returns { counts, lights, smoke, update(camera, force) }: lights ([x, y, z, radius]) and smoke emitters
// ([x, y, z]) are the models' userData points placed in the world, for src/render/lights.js and smoke.js.
const _v = new THREE.Vector3();
export function buildInstances(group) {
  const counts = {}, sets = [], lights = [], smoke = [];
  for (const key in INST) {
    const [kind, vs] = key.split('|'), v = +vs, list = INST[key], K = KINDS[kind], levels = lodLevels(kind);
    const mats = new Float32Array(list.length * 16), pos = new Float32Array(list.length * 3);
    list.forEach((o, i) => {
      _e.set(0, o.r, 0); _q.setFromEuler(_e);
      if (o.tilt) { const n = normalAt(o.x, o.z); const q2 = new THREE.Quaternion().setFromUnitVectors(_up, n.clone().lerp(_up, 0.4).normalize()); _q.premultiply(q2); }
      _m4.compose(_pp.set(o.x, o.y, o.z), _q, _s.set(o.s, o.s, o.s)).toArray(mats, i * 16);
      pos[i * 3] = o.x; pos[i * 3 + 1] = o.y; pos[i * 3 + 2] = o.z;
    });
    const ud = kindGeo(kind, v, 0).userData || {};
    if ((ud.lights && ud.lights.length) || (ud.smoke && ud.smoke.length)) list.forEach((o, i) => {
      _m4.fromArray(mats, i * 16);
      for (const [x, y, z, r] of ud.lights || []) { _v.set(x, y, z).applyMatrix4(_m4); lights.push([_v.x, _v.y, _v.z, r * o.s]); }
      for (const [x, y, z] of ud.smoke || []) { _v.set(x, y, z).applyMatrix4(_m4); smoke.push([_v.x, _v.y, _v.z]); }
    });
    const meshes = [];
    for (let l = 0; l < levels; l++) {
      // the cached model geometry is shared by every placement of it; this mesh draws it through a wrapper that
      // shares its buffers and adds the per-instance fade
      const src = kindGeo(kind, v, l), geo = new THREE.BufferGeometry(), fade = new THREE.InstancedBufferAttribute(new Float32Array(list.length), 1);
      for (const a in src.attributes) geo.setAttribute(a, src.attributes[a]);
      geo.setIndex(src.index); geo.setAttribute('aFade', fade.setUsage(THREE.DynamicDrawUsage));
      const mesh = new THREE.InstancedMesh(geo, MATS[K.mat], list.length);
      mesh.fade = fade; mesh.userData = { kind, variant: v, level: l };
      mesh.count = 0; mesh.frustumCulled = false;
      if (!K.small) { mesh.layers.enable(SHADOW); mesh.layers.enable(REFLECT); }  // flowers: thin stems would only shadow themselves
      group.add(mesh); meshes.push(mesh);
    }
    const n = list.length;
    sets.push({ lod: K.lod || [], cull: K.cull || Infinity, mats, pos, meshes, last: new Int8Array(n).fill(-1), prev: new Int8Array(n).fill(-1), t0: new Float32Array(n), fading: [] });
    counts[kind] = (counts[kind] || 0) + n;
  }
  const at = new THREE.Vector3(1e9, 0, 0);
  let lastT = -1e9, fadeEnd = -1e9;
  // where instance i goes: its level now, or meshes.length when culled
  function levelOf(S, i, d) {
    const L = S.lod, hidden = S.meshes.length;
    if (LOD.force >= 0) return d > S.cull ? hidden : Math.min(LOD.force, hidden - 1);
    let l = 0; while (l < L.length && d > L[l] * LOD.bias) l++;
    const was = S.last[i];
    if (was >= 0 && l !== was && was < hidden) {
      if (l > was && d < L[was] * LOD.bias * 1.06) l = was;            // hysteresis: stay until clearly past the boundary
      else if (l < was && d > L[l] * LOD.bias * 0.94) l = was;
    }
    return d > S.cull * (was === hidden ? 0.97 : 1) ? hidden : l;
  }
  // fade value of an outgoing (+h) or incoming (−h) copy, h = how far the fade has run
  const fadeOut = h => Math.min(1, Math.max(h, 1e-4)), fadeIn = h => -Math.min(1, Math.max(h, 1e-4));
  function rebucket(c, now, instant) {
    fadeEnd = -1e9;
    for (const S of sets) {
      const n = S.last.length, hidden = S.meshes.length, fill = S.meshes.map(() => 0);
      S.fading.length = 0;
      const put = (l, i, f) => {
        const M = S.meshes[l], j = fill[l]++;
        M.instanceMatrix.array.set(S.mats.subarray(i * 16, i * 16 + 16), j * 16); M.fade.array[j] = f;
        return j;
      };
      for (let i = 0; i < n; i++) {
        const dx = S.pos[i * 3] - c.x, dy = S.pos[i * 3 + 1] - c.y, dz = S.pos[i * 3 + 2] - c.z;
        const l = levelOf(S, i, Math.sqrt(dx * dx + dy * dy + dz * dz)), was = S.last[i];
        if (instant) S.prev[i] = -1;
        if (l !== was) {
          // a new fade starts from the level on screen; one already running carries on from where it was
          if (instant || was < 0) S.prev[i] = -1;
          else if (S.prev[i] < 0 || now - S.t0[i] >= LOD.fade) { S.prev[i] = was; S.t0[i] = now; }
          else if (S.prev[i] === l) { S.prev[i] = was; S.t0[i] = now - (LOD.fade - (now - S.t0[i])); }   // turned back mid-fade
          S.last[i] = l;
        }
        const p = S.prev[i], h = p >= 0 ? (now - S.t0[i]) / LOD.fade : 1;
        if (p >= 0 && h < 1) {
          const e = { i, h0: S.t0[i], a: -1, b: -1, la: l, lb: p };
          if (l < hidden) e.a = put(l, i, fadeIn(h));
          if (p < hidden) e.b = put(p, i, fadeOut(h));
          S.fading.push(e); fadeEnd = Math.max(fadeEnd, S.t0[i] + LOD.fade);
        } else {
          S.prev[i] = -1;
          if (l < hidden) put(l, i, 0);
        }
      }
      S.meshes.forEach((M, l) => { M.count = fill[l]; M.instanceMatrix.needsUpdate = true; M.fade.needsUpdate = true; });
    }
  }
  // between re-buckets only the running fades move on
  function advance(now) {
    for (const S of sets) {
      if (!S.fading.length) continue;
      for (const e of S.fading) {
        const h = (now - e.h0) / LOD.fade;
        if (e.a >= 0) S.meshes[e.la].fade.array[e.a] = fadeIn(h);
        if (e.b >= 0) S.meshes[e.lb].fade.array[e.b] = fadeOut(h);
      }
      for (const M of S.meshes) M.fade.needsUpdate = true;
    }
  }
  function update(camera, force) {
    const c = camera.position, now = U.uTime.value;
    const jump = force || LOD.dirty || now - lastT > 0.25 || c.distanceToSquared(at) > 30 * 30;
    lastT = now;
    if (jump || c.distanceToSquared(at) >= 4 || (fadeEnd > -1e9 && now >= fadeEnd)) {
      at.copy(c); rebucket(c, now, jump); LOD.dirty = false;
    } else if (now < fadeEnd) advance(now);
  }
  return { counts, lights, smoke, update };
}
