// Water surfaces: lake quads at the lake level and river ribbons following the bed, with flow-aligned
// ripples, fresnel reflection (planar lake reflection, sky elsewhere), depth tint, sun glints, shore/rapids
// foam, white falling sheets where a river drops steeply, and mist at the foot of each waterfall.
import * as THREE from 'three';
import { clamp, smooth } from '../core/math.js';
import { DETAIL, heightAt } from '../world/grid.js';
import { WATERS } from '../water/water.js';
import { mat } from './material.js';
import { PAL } from './uniforms.js';
import { REFL } from './reflection.js';

const waterMat = mat(`
attribute float aGround; attribute vec2 aFlow; attribute float aFall;
varying vec3 vWP; varying float vDepth; varying vec2 vFlow; varying float vFall;
void main(){
  vec3 p = position;
  p.y += (sin(p.x * 0.35 + uTime * 1.1) + sin(p.z * 0.28 - uTime * 0.9)) * 0.025;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWP = w.xyz; vDepth = position.y - aGround; vFlow = aFlow; vFall = aFall;
  gl_Position = projectionMatrix * viewMatrix * w;
}`, `
uniform vec3 uShallow, uDeep, uSand;
uniform sampler2D uRefl; uniform mat4 uReflMatrix; uniform float uReflOn; uniform float uReflLevel;
varying vec3 vWP; varying float vDepth; varying vec2 vFlow; varying float vFall;
float wav(vec2 p){ return vnoise(p) * 0.6 + vnoise(p * 2.3 + 4.1) * 0.4; }
void main(){
  if (vDepth < -0.02) discard;
  float speed = length(vFlow);
  vec2 uv = vWP.xz * 0.55 - vFlow * uTime * 0.9;
  vec2 uv2 = vWP.xz * 0.21 + vec2(uTime * 0.05, -uTime * 0.035) - vFlow * uTime * 0.4;
  float e = 0.15;
  float h0 = wav(uv) * 0.6 + wav(uv2) * 0.4;
  float hx = wav(uv + vec2(e, 0.0)) * 0.6 + wav(uv2 + vec2(e, 0.0)) * 0.4;
  float hz = wav(uv + vec2(0.0, e)) * 0.6 + wav(uv2 + vec2(0.0, e)) * 0.4;
  vec3 N = normalize(vec3((h0 - hx) * (0.5 + speed), 1.0, (h0 - hz) * (0.5 + speed)));
  vec3 V = normalize(cameraPosition - vWP);
  float fres = 0.07 + 0.88 * pow(1.0 - max(dot(N, V), 0.0), 3.5);
  vec3 R = reflect(-V, N);
  vec3 skyR = mix(uFogColor, uZenith, clamp(R.y * 1.8, 0.0, 1.0));
  // planar reflection where this surface lies on the reflected lake plane; sky gradient elsewhere
  if (uReflOn > 0.5) {
    float onPlane = 1.0 - smoothstep(0.15, 0.8, abs(vWP.y - uReflLevel));
    vec4 rp = uReflMatrix * vec4(vWP.x, uReflLevel, vWP.z, 1.0);
    if (onPlane > 0.0) skyR = mix(skyR, texture2D(uRefl, rp.xy / rp.w + N.xz * 0.06).rgb * 0.92, onPlane);
  }
  float d = max(vDepth, 0.0);
  vec3 body = mix(uShallow, uDeep, smoothstep(0.3, 5.5, d));
  vec3 bed = lighting(uSand * 0.9, vec3(0.0, 1.0, 0.0), vWP, 0.0);
  vec3 col = mix(bed, body * (uSkyAmb + uSunColor * 0.55), smoothstep(0.0, 1.4, d));
  col = mix(col, skyR, fres * smoothstep(0.0, 0.5, d));
  float cs = cloudShadow(vWP.xz);
  float spec = pow(max(dot(R, uSunDir), 0.0), 220.0) * 3.5 + pow(max(dot(R, uSunDir), 0.0), 24.0) * 0.18;
  float spark = step(0.86, wav(vWP.xz * 2.6 + uTime * 0.6)) * pow(max(dot(R, uSunDir), 0.0), 8.0) * 1.2;
  col += uSunColor * (spec + spark) * cs;
  float fn = vnoise(vWP.xz * 1.6 - vFlow * uTime * 1.4 + uTime * 0.2);
  float shoreFoam = (1.0 - smoothstep(0.0, 0.28 + 0.12 * sin(uTime * 1.6 + fn * 6.0), d)) * smoothstep(0.35, 0.6, fn + 0.25);
  float flowFoam = smoothstep(0.72, 0.9, fn) * clamp(speed * 1.2, 0.0, 0.8);
  col = mix(col, vec3(0.97, 0.99, 1.0) * (uSkyAmb * 0.6 + uSunColor * 0.6), clamp(shoreFoam + flowFoam, 0.0, 1.0));
  if (vFall > 0.01) {
    // falling sheet: white streaks running down, blue-green gaps between them
    vec2 fuv = vec2(dot(vWP.xz, normalize(vec2(-vFlow.y, vFlow.x) + 1e-4)) * 2.4, vWP.y * 0.32 + uTime * 2.8);
    float streak = vnoise(fuv) * 0.6 + vnoise(fuv * vec2(2.3, 1.7) + 3.0) * 0.4;
    vec3 white = vec3(0.96, 0.98, 1.0) * (uSkyAmb * 0.75 + uSunColor * 0.6);
    col = mix(col, mix(body * (uSkyAmb + uSunColor * 0.4), white, smoothstep(0.3, 0.62, streak)), vFall);
  }
  float a = smoothstep(-0.02, 0.22, d);
  gl_FragColor = vec4(applyFog(col, vWP), a);
}`, Object.assign({ uShallow: { value: PAL.shallow }, uDeep: { value: PAL.deep }, uSand: { value: PAL.sand } }, REFL), { transparent: true, side: THREE.DoubleSide });

// mist rising at the foot of a waterfall: soft sprites that drift up and out, then fade and respawn
export const MIST_PX = { value: 1 };
const mistMat = mat(`attribute vec4 aSeed; uniform float uPx; varying float vA; varying vec3 vWP;
void main(){
  float t = fract(uTime * (0.1 + aSeed.w * 0.08) + aSeed.z);
  vec3 p = position + vec3((aSeed.x - 0.5) * 7.0 * t + uWindDir.x * t * 3.0, t * 6.0, (aSeed.y - 0.5) * 7.0 * t + uWindDir.y * t * 3.0);
  vec4 mv = viewMatrix * vec4(p, 1.0); vWP = p;
  gl_PointSize = uPx * (90.0 + 140.0 * t) / max(-mv.z, 1.0);
  vA = sin(t * 3.1416) * (0.6 - 0.3 * aSeed.w);
  gl_Position = projectionMatrix * mv;
}`, `varying float vA; varying vec3 vWP;
void main(){
  float a = smoothstep(0.5, 0.05, length(gl_PointCoord - 0.5)) * vA * 0.32;
  gl_FragColor = vec4(applyFog(vec3(0.95, 0.97, 1.0) * (uSkyAmb * 0.8 + uSunColor * 0.5), vWP), a);
}`, { uPx: MIST_PX }, { transparent: true, depthWrite: false });

function addMist(group, x, y, z, seed) {
  const N = 70, pos = new Float32Array(N * 3), sd = new Float32Array(N * 4);
  let r = seed * 9301 + 49297;
  const R = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  for (let i = 0; i < N; i++) { pos.set([x + (R() - 0.5) * 3, y + R() * 0.5, z + (R() - 0.5) * 3], i * 3); sd.set([R(), R(), R(), R()], i * 4); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4));
  const pts = new THREE.Points(g, mistMat); pts.frustumCulled = false; pts.renderOrder = 4; group.add(pts);
}

// builds lake and river meshes into `group`; returns the lakes as [{ level, sphere }] for the reflection pass
export function buildWaterMeshes(group) {
  const n = DETAIL.n, lakes = [];
  // lakes: one quad per wet cell (dilated by one cell), at the lake level
  for (const L of WATERS.lakes) {
    const pos = [], gr = [], fl = [], fa = [];
    for (let j = Math.max(0, L.minJ - 1); j < Math.min(n - 1, L.maxJ + 1); j++) for (let i = Math.max(0, L.minI - 1); i < Math.min(n - 1, L.maxI + 1); i++) {
      const k = j * n + i;
      if (!(L.mask[k] || L.mask[k + 1] || L.mask[k + n] || L.mask[k + n + 1])) continue;
      const corners = [[i, j], [i, j + 1], [i + 1, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]];
      for (const [a, b] of corners) { const x = DETAIL.x(a), z = DETAIL.x(b); pos.push(x, L.level, z); gr.push(heightAt(x, z)); fl.push(0, 0); fa.push(0); }
    }
    if (!pos.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aGround', new THREE.Float32BufferAttribute(gr, 1));
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(fl, 2));
    g.setAttribute('aFall', new THREE.Float32BufferAttribute(fa, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, waterMat); m.renderOrder = 3; group.add(m);
    lakes.push({ level: L.level, sphere: g.boundingSphere.clone() });
  }
  // rivers: ribbon along the path
  for (const r of WATERS.rivers) {
    const { pts, surf, p } = r, N = Math.min(pts.length, r.end), half = p.width * 0.5 + p.bank, A = 9;
    if (N < 2) continue;
    const pos = [], gr = [], fl = [], fa = [], idx = [];
    let wasFall = false;
    for (let i = 0; i < N; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N - 1, i + 1)];
      const tx = b.x - a.x, tz = b.y - a.y, tl = Math.hypot(tx, tz) || 1;
      const sx = -tz / tl, sz = tx / tl;
      const slopeL = i < N - 1 ? (surf[i] - surf[i + 1]) / (pts[i].distanceTo(pts[i + 1]) || 1) : 0;
      const sp = clamp(0.35 + slopeL * 14, 0.35, 1.6), fall = smooth(0.5, 1.2, slopeL);
      for (let k = 0; k < A; k++) {
        const u = k / (A - 1) * 2 - 1, x = pts[i].x + sx * u * half, z = pts[i].y + sz * u * half;
        pos.push(x, surf[i], z); gr.push(heightAt(x, z)); fl.push(tx / tl * sp, tz / tl * sp); fa.push(fall);
      }
      if (wasFall && fall < 0.3) addMist(group, pts[i].x, surf[i], pts[i].y, i + 7);  // the foot of a drop
      wasFall = fall > 0.5;
    }
    for (let i = 0; i < N - 1; i++) for (let k = 0; k < A - 1; k++) { const a = i * A + k, b = a + 1, c = a + A, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aGround', new THREE.Float32BufferAttribute(gr, 1));
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(fl, 2));
    g.setAttribute('aFall', new THREE.Float32BufferAttribute(fa, 1));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, waterMat); m.renderOrder = 3; group.add(m);
  }
  return lakes;
}
