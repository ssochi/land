// Prop materials (trees, flowers, rocks) with wind sway, leaf-card alpha test, translucency and rim light,
// and the instanced meshes built from the placement list.
import * as THREE from 'three';
import { normalAt } from '../world/grid.js';
import { KINDS, kindGeo } from '../objects/kinds.js';
import { INST } from '../objects/placement.js';
import { mat } from './material.js';
import { LEAF_TEX } from './textures.js';

const propMat = (o) => mat(`
attribute vec3 aColor; attribute float aSway; attribute vec2 aUV; attribute float aCard;
uniform float uSwayAmp; uniform float uSwayFreq;
varying vec3 vC; varying vec3 vWP; varying vec3 vN; varying vec2 vUV; varying float vCard;
void main(){
  vUV = aUV; vCard = aCard;
  mat4 m = modelMatrix * instanceMatrix;
  vec4 w = m * vec4(position, 1.0);
  vec3 root = (m * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float g = gustAt(root.xz);
  float ph = sin(uTime * uSwayFreq * (1.0 + uWind) + root.x * 0.37 + root.z * 0.23 + position.y * 0.5);
  float amt = aSway * uSwayAmp * (0.15 + uWind * (0.5 + 0.9 * g));
  w.xz += uWindDir * amt * (0.6 + 0.4 * ph) + vec2(-uWindDir.y, uWindDir.x) * amt * 0.3 * ph;
  w.y -= amt * amt * 0.2;
  vWP = w.xyz; vN = normalize(mat3(m) * normal); vC = aColor;
  gl_Position = projectionMatrix * viewMatrix * w;
}`, `
uniform float uSharp; uniform float uTrans; uniform sampler2D uLeaf;
varying vec3 vC; varying vec3 vWP; varying vec3 vN; varying vec2 vUV; varying float vCard;
void main(){
  vec3 alb = vC;
  if (vCard > 0.5) { vec4 lt = texture2D(uLeaf, vUV); if (lt.a < 0.42) discard; alb *= 0.74 + 0.4 * lt.r; }
  vec3 N = normalize(vN); if (!gl_FrontFacing && vCard < 0.5) N = -N;
  vec3 c = lighting(alb, N, vWP, uSharp);
  vec3 V = normalize(vWP - cameraPosition);
  float back = pow(max(dot(V, uSunDir), 0.0), 3.0);
  c += uSunColor * alb * back * (uTrans + vCard * 0.35) * gShadow;
  float rim = pow(1.0 - max(dot(N, -V), 0.0), 3.0) * max(dot(N, uSunDir) + 0.3, 0.0);
  c += uSunColor * rim * 0.14;
  gl_FragColor = vec4(applyFog(c, vWP), 1.0);
}`, { uSwayAmp: { value: o.amp }, uSwayFreq: { value: o.freq }, uSharp: { value: o.sharp }, uTrans: { value: o.trans }, uLeaf: { value: LEAF_TEX } }, { side: o.double ? THREE.DoubleSide : THREE.FrontSide });

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
    mesh.frustumCulled = false; mesh.layers.enable(1);
    group.add(mesh);
    counts[kind] = (counts[kind] || 0) + list.length;
  }
  return counts;
}
