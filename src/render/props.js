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

const propMat = (o) => mat(`
attribute vec3 aColor; attribute float aSway; attribute vec2 aUV; attribute float aCard;
uniform float uSwayAmp; uniform float uSwayFreq;
varying vec3 vC; varying vec3 vWP; varying vec3 vSP; varying vec3 vN; varying vec2 vUV; varying float vCard;
void main(){
  vUV = aUV; vCard = aCard;
  mat4 m = modelMatrix * instanceMatrix;
  vec4 w = m * vec4(position, 1.0);
  vSP = w.xyz;   // unswayed: shadows are looked up here, matching the (unswayed) shadow pass, so swaying leaves do not shimmer
  vec3 root = (m * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float g = gustAt(root.xz);
  float ph = sin(uTime * uSwayFreq * (1.0 + uWind) + root.x * 0.37 + root.z * 0.23 + position.y * 0.5);
  float amt = aSway * uSwayAmp * (0.15 + uWind * (0.5 + 0.9 * g));
  w.xz += uWindDir * amt * (0.6 + 0.4 * ph) + vec2(-uWindDir.y, uWindDir.x) * amt * 0.3 * ph;
  w.y -= amt * amt * 0.2;
  vWP = w.xyz; vN = normalize(mat3(m) * normal); vC = aColor;
  gl_Position = projectionMatrix * viewMatrix * w;
}`, `
uniform float uSharp; uniform float uTrans; uniform sampler2D uLeaf; uniform float uA2C;
varying vec3 vC; varying vec3 vWP; varying vec3 vSP; varying vec3 vN; varying vec2 vUV; varying float vCard;
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
  if (vCard > 1.5) {
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
    alb *= mix(1.0, (0.86 + 0.28 * bh) * (0.9 + 0.16 * streak), detail) * (1.0 - 0.42 * joint);
  }
  vec3 c = lighting(alb, N, vSP, uSharp);
  vec3 V = normalize(vWP - cameraPosition);
  float back = pow(max(dot(V, uSunDir), 0.0), 3.0);
  c += uSunColor * alb * back * (uTrans + vCard * 0.35) * gShadow;
  float rim = pow(1.0 - max(dot(N, -V), 0.0), 3.0) * max(dot(N, uSunDir) + 0.3, 0.0);
  c += uSunColor * rim * 0.14;
  gl_FragColor = vec4(applyFog(c, vWP), alpha);
}`, { uSwayAmp: { value: o.amp }, uSwayFreq: { value: o.freq }, uSharp: { value: o.sharp }, uTrans: { value: o.trans }, uLeaf: { value: LEAF_TEX }, uA2C: A2C },
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
