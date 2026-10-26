// Prop materials (trees, flowers, rocks) with wind sway, leaf-card alpha test, translucency and rim light,
// and the instanced meshes built from the placement list.
import * as THREE from 'three';
import { normalAt } from '../world/grid.js';
import { KINDS, kindGeo } from '../objects/kinds.js';
import { INST } from '../objects/placement.js';
import { mat } from './material.js';
import { LEAF_TEX } from './textures.js';
import { SHADOW, REFLECT } from './layers.js';

// 1 when the scene target is multisampled (set by src/render/post.js): leaf cards then use alpha to coverage
export const A2C = { value: 0 };
// baked rock texture (src/render/texgen.js) for textured stone; set by setPropTextures()
const ROCK_A = { value: null }, ROCK_N = { value: null };
export function setPropTextures(t) { ROCK_A.value = t.rock.albedo; ROCK_N.value = t.rock.normal; }

const propMat = (o) => mat(`
attribute vec3 aColor; attribute float aSway; attribute vec2 aUV; attribute float aCard;
uniform float uSwayAmp; uniform float uSwayFreq;
varying vec3 vC; varying vec3 vWP; varying vec3 vSP; varying vec3 vN; varying vec2 vUV; varying float vCard; varying float vH;
void main(){
  vUV = aUV; vCard = aCard;
  mat4 m = modelMatrix * instanceMatrix;
  vec4 w = m * vec4(position, 1.0);
  vSP = w.xyz;   // unswayed: shadows are looked up here, matching the (unswayed) shadow pass, so swaying leaves do not shimmer
  vec3 root = (m * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vH = w.y - root.y;   // height above the model's base (ivy climbs from the ground)
  float g = gustAt(root.xz);
  float ph = sin(uTime * uSwayFreq * (1.0 + uWind) + root.x * 0.37 + root.z * 0.23 + position.y * 0.5);
  float amt = aSway * uSwayAmp * (0.15 + uWind * (0.5 + 0.9 * g));
  w.xz += uWindDir * amt * (0.6 + 0.4 * ph) + vec2(-uWindDir.y, uWindDir.x) * amt * 0.3 * ph;
  w.y -= amt * amt * 0.2;
  vWP = w.xyz; vN = normalize(mat3(m) * normal); vC = aColor;
  gl_Position = projectionMatrix * viewMatrix * w;
}`, `
uniform float uSharp; uniform float uTrans; uniform sampler2D uLeaf; uniform float uA2C; uniform sampler2D uRockA, uRockN;
varying vec3 vC; varying vec3 vWP; varying vec3 vSP; varying vec3 vN; varying vec2 vUV; varying float vCard; varying float vH;
void main(){
  vec3 alb = vC; float alpha = 1.0;
  bool card = vCard > 0.5 && vCard < 1.5;
  if (card) {
    vec4 lt = texture2D(uLeaf, vUV);
    // small mips average leaf alpha toward the gaps, so distant canopies would thin out and sparkle: boost by mip level
    vec2 tx = vUV * vec2(512.0, 256.0);
    float lod = max(0.0, 0.5 * log2(max(dot(dFdx(tx), dFdx(tx)), dot(dFdy(tx), dFdy(tx)))));
    float a = lt.a * (1.0 + lod * 0.22);
    // alpha to coverage: a sharpened alpha gives MSAA-smoothed leaf edges instead of stair-stepped cut-outs
    alpha = clamp((a - 0.42) / max(fwidth(a), 1e-4) + 0.5, 0.0, 1.0);
    if (alpha < mix(0.5, 0.02, uA2C)) discard;
    alb *= 0.74 + 0.4 * lt.r;
  }
  vec3 N = normalize(vN); if (!gl_FrontFacing && !card) N = -N;
  if (vCard > 2.5) {
    // textured stone (boulders, outcrops): the baked rock texture and normal map, triplanar in world space
    vec3 tw = pow(abs(N), vec3(4.0)); tw /= tw.x + tw.y + tw.z;
    vec3 P = vSP / 2.6;
    vec4 ax = texture2D(uRockN, P.zy), ay = texture2D(uRockN, P.xz), az = texture2D(uRockN, P.xy);
    vec3 tx = ax.xyz * 2.0 - 1.0, ty = ay.xyz * 2.0 - 1.0, tz = az.xyz * 2.0 - 1.0;
    tx = vec3(tx.xy + N.zy, abs(tx.z) * N.x); ty = vec3(ty.xy + N.xz, abs(ty.z) * N.y); tz = vec3(tz.xy + N.xy, abs(tz.z) * N.z);
    N = normalize(tx.zyx * tw.x + ty.xzy * tw.y + tz.xyz * tw.z);
    vec3 ta = texture2D(uRockA, P.zy).rgb * tw.x + texture2D(uRockA, P.xz).rgb * tw.y + texture2D(uRockA, P.xy).rgb * tw.z;
    alb *= ta / 0.76 * mix(0.6, 1.05, ax.w * tw.x + ay.w * tw.y + az.w * tw.z);
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
  vec3 V = normalize(vWP - cameraPosition);
  float back = pow(max(dot(V, uSunDir), 0.0), 3.0);
  c += uSunColor * mix(alb, vec3(0.72, 0.86, 0.3), card ? 0.35 : 0.0) * back * (uTrans + (card ? 0.45 : 0.0)) * gShadow;   // leaves glow when backlit
  float rim = pow(1.0 - max(dot(N, -V), 0.0), 3.0) * max(dot(N, uSunDir) + 0.3, 0.0);
  c += uSunColor * rim * 0.14;
  gl_FragColor = vec4(applyFog(c, vWP), alpha);
}`, { uSwayAmp: { value: o.amp }, uSwayFreq: { value: o.freq }, uSharp: { value: o.sharp }, uTrans: { value: o.trans }, uLeaf: { value: LEAF_TEX }, uA2C: A2C, uRockA: ROCK_A, uRockN: ROCK_N },
  { side: o.double ? THREE.DoubleSide : THREE.FrontSide, alphaToCoverage: !!o.double, extensions: { derivatives: true } });

// keyed by KINDS[kind].mat
const MATS = {
  tree: propMat({ amp: 1, freq: 1.3, sharp: 0.5, trans: 0.3, double: true }),
  flower: propMat({ amp: 1, freq: 2.4, sharp: 0.3, trans: 0.5, double: true }),
  rock: propMat({ amp: 0, freq: 0, sharp: 0.75, trans: 0 })
};

const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _pp = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

// one InstancedMesh per kind/variant/LOD; returns placed counts per kind
export function buildInstances(group) {
  const counts = {};
  for (const key in INST) {
    const [kind, v, lo] = key.split('|'), list = INST[key], K = KINDS[kind];
    const geo = kindGeo(kind, +v, lo === '1');
    const mesh = new THREE.InstancedMesh(geo, MATS[K.mat], list.length);
    list.forEach((o, i) => {
      _e.set(0, o.r, 0); _q.setFromEuler(_e);
      if (o.tilt) { const n = normalAt(o.x, o.z); const q2 = new THREE.Quaternion().setFromUnitVectors(_up, n.clone().lerp(_up, 0.4).normalize()); _q.premultiply(q2); }
      _m4.compose(_pp.set(o.x, o.y, o.z), _q, _s.set(o.s, o.s, o.s));
      mesh.setMatrixAt(i, _m4);
    });
    mesh.frustumCulled = false;
    if (!K.small) { mesh.layers.enable(SHADOW); mesh.layers.enable(REFLECT); }  // flowers: thin stems would only shadow themselves
    group.add(mesh);
    counts[kind] = (counts[kind] || 0) + list.length;
  }
  return counts;
}
