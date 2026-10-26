// Instanced grass blades: bend with wind gusts, part around the cursor (uPush), tint by meadow noise.
import * as THREE from 'three';
import { GRASS_CHUNK } from '../objects/grass.js';
import { mat } from './material.js';
import { PAL } from './uniforms.js';

function bladeGeometry(segs) {
  const pos = [], idx = [];
  for (let i = 0; i < segs; i++) { const t = i / segs, half = 0.5 * Math.pow(1 - t, 0.72); pos.push(-half, t, 0, half, t, 0); }
  pos.push(0, 1, 0);
  for (let i = 0; i < segs - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const l = (segs - 1) * 2; idx.push(l, l + 1, l + 2);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
}
export const BLADE_HI = bladeGeometry(5), BLADE_LO = bladeGeometry(3);

// cursor push: xz = position, w = strength (animated by src/app/pointer.js)
export const PUSH = new THREE.Vector4(0, -999, 0, 0);

const grassMat = mat(`
attribute vec3 iOffset; attribute vec4 iData; attribute vec3 iNormal; attribute float iOcc;
uniform vec4 uPush;
varying float vT; varying vec3 vWP; varying vec3 vN; varying float vRand; varying float vGust; varying float vOcc;
void main(){
  float t = position.y, ang = iData.x, h = iData.y, w = iData.z, rnd = iData.w;
  vec3 side = vec3(cos(ang), 0.0, sin(ang)), face = vec3(-side.z, 0.0, side.x);
  vec2 xz = iOffset.xz;
  float gust = gustAt(xz);
  float flutter = sin(uTime * (2.0 + uWind * 3.2) + rnd * 6.2831 + dot(xz, vec2(0.7, 0.5))) * 0.5 + 0.5;
  float bend = uWind * (0.16 + gust * 1.1) + flutter * 0.07 * (0.35 + uWind);
  vec2 toP = xz - uPush.xz; float pd = length(toP);
  float push = (1.0 - smoothstep(0.2, 2.2, pd)) * uPush.w;
  vec2 dir = uWindDir * bend + face.xz * (0.12 + rnd * 0.32) + (toP / max(pd, 0.001)) * push * 1.6;
  float amt = length(dir), tt = t * t;
  vec3 p = side * position.x * w; p.y = t * h; p.xz += dir * tt * h; p.y -= h * tt * min(amt * amt * 0.34, 0.62);
  vec3 world = iOffset + p;
  if (dot(face, cameraPosition - world) < 0.0) face = -face;
  vN = normalize(mix(face, iNormal, 0.72)); vT = t; vRand = rnd; vGust = gust * uWind; vWP = world; vOcc = iOcc;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`, `
uniform vec3 uRoot, uMid, uTipA, uTipB;
varying float vT; varying vec3 vWP; varying vec3 vN; varying float vRand; varying float vGust; varying float vOcc;
void main(){
  float pn = fbm(vWP.xz * 0.035), pn2 = vnoise(vWP.xz * 0.13 + 7.0);
  vec3 tip = mix(uTipB, uTipA, smoothstep(0.35, 0.7, pn));
  float big = fbm(vWP.xz * 0.0075 + 13.0);
  tip = mix(tip, vec3(0.88, 0.82, 0.44), smoothstep(0.55, 0.72, big) * 0.5);
  vec3 midc = mix(uMid * (0.86 + 0.28 * pn2), vec3(0.30, 0.52, 0.32), smoothstep(0.45, 0.28, big) * 0.55);
  tip = mix(tip, vec3(0.55, 0.74, 0.42), smoothstep(0.45, 0.28, big) * 0.45);
  vec3 col = mix(uRoot, midc, smoothstep(0.0, 0.55, vT));
  col = mix(col, tip, smoothstep(0.42, 1.0, vT)) * (0.9 + vRand * 0.2);
  float cs = cloudShadow(vWP.xz);
  vec3 lit = lighting(col, normalize(vN), vWP, 0.2) * mix(0.64, 1.0, smoothstep(0.0, 0.62, vT));
  lit *= 1.0 - vOcc * 0.3;
  vec3 V = normalize(vWP - cameraPosition);
  lit += uSunColor * tip * pow(max(dot(V, uSunDir), 0.0), 3.0) * vT * 0.6 * gShadow;
  lit += vec3(0.21, 0.23, 0.12) * vGust * smoothstep(0.45, 1.0, vT) * gShadow;
  gl_FragColor = vec4(applyFog(lit, vWP), 1.0);
}`, { uRoot: { value: PAL.root }, uMid: { value: PAL.mid }, uTipA: { value: PAL.tipA }, uTipB: { value: PAL.tipB }, uPush: { value: PUSH } }, { side: THREE.DoubleSide });

// chunks from src/objects/grass.js distributeGrass(); chunks farther than 50m from the origin use the 3-segment blade
export function buildGrassMeshes(group, chunks) {
  const CH = GRASS_CHUNK;
  for (const B of chunks) {
    const base = Math.hypot(B.cx, B.cz) > 50 ? BLADE_LO : BLADE_HI;
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.setAttribute('position', base.attributes.position);
    g.setAttribute('iOffset', new THREE.InstancedBufferAttribute(new Float32Array(B.off), 3));
    g.setAttribute('iData', new THREE.InstancedBufferAttribute(new Float32Array(B.data), 4));
    g.setAttribute('iNormal', new THREE.InstancedBufferAttribute(new Float32Array(B.nor), 3));
    g.setAttribute('iOcc', new THREE.InstancedBufferAttribute(new Float32Array(B.occ), 1));
    g.instanceCount = B.off.length / 3;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(B.cx, (B.minY + B.maxY) / 2 + 0.6, B.cz), CH * 0.75 + (B.maxY - B.minY) / 2 + 2.5);
    group.add(new THREE.Mesh(g, grassMat));
  }
}
