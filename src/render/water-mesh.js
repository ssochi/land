// Water surfaces: lake quads at the lake level and river ribbons following the bed, with flow-aligned
// ripples, fresnel reflection (planar lake reflection, sky elsewhere), depth tint, sun glints, shore/rapids
// foam and white water on steep rapids. Where a river drops off a ledge it leaves the bed: a waterfall is a
// translucent two-layer curtain on a ballistic arc from the lip, a ring of foam where it hits the pool, and
// a billowing mist cloud.
import * as THREE from 'three';
import { clamp, smooth } from '../core/math.js';
import { DETAIL, heightAt } from '../world/grid.js';
import { WATERS } from '../water/water.js';
import { mat } from './material.js';
import { PAL } from './uniforms.js';
import { REFL } from './reflection.js';
import { REFLECT } from './layers.js';

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
  if (vDepth < -0.02 || vFall < -0.01) discard;   // aFall -1: this stretch falls free (see the curtain below)
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
  float spark = step(0.86, wav(vWP.xz * 2.6 + uTime * 0.6)) * pow(max(dot(R, uSunDir), 0.0), 8.0) * 1.2 * smoothstep(3.0, 18.0, length(cameraPosition - vWP));  // glints read as blobs up close
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

// waterfall curtain: long streaks sliding down (stretched lower down, where the water is faster), a smooth glassy
// tongue over the lip breaking into white water, translucent between streaks and feathered at the sides
const fallMat = mat(`
attribute vec2 aM; attribute vec2 aUV; attribute float aLayer;
varying vec2 vM; varying vec2 vUV; varying float vLayer; varying vec3 vWP; varying vec3 vN;
void main(){
  vec3 p = position + normal * sin(aM.y * 0.9 - uTime * 3.0 + aM.x * 1.3) * 0.07 * aUV.y;   // the sheet flutters
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWP = w.xyz; vN = normal; vM = aM; vUV = aUV; vLayer = aLayer;
  gl_Position = projectionMatrix * viewMatrix * w;
}`, `
uniform vec3 uShallow, uDeep;
varying vec2 vM; varying vec2 vUV; varying float vLayer; varying vec3 vWP; varying vec3 vN;
void main(){
  float s = vUV.y, edge = 1.0 - abs(vUV.x);
  float yy = vM.y / (1.0 + 1.6 * s) * 0.32 - uTime * 1.5;
  float n = vnoise(vec2(vM.x * 1.7 + vLayer * 7.0, yy)) * 0.5 + vnoise(vec2(vM.x * 4.1 + 3.1, yy * 2.1 + 1.7)) * 0.3
          + vnoise(vec2(vM.x * 9.0 - 2.0, yy * 4.3 + 5.0)) * 0.2;
  float glass = 1.0 - smoothstep(0.02, 0.16, s);
  float foam = smoothstep(0.34 - 0.24 * s, 0.68 - 0.2 * s, n) * (1.0 - glass * 0.85);
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 alb = mix(mix(uDeep, uShallow, 0.4) * 0.5, vec3(0.92, 0.94, 0.96), foam);
  vec3 c = lighting(alb, N, vWP, 0.0) + uSkyAmb * 0.22 * foam;            // foam scatters sky light, never goes dark
  vec3 V = normalize(vWP - cameraPosition);
  c += uSunColor * pow(max(dot(V, uSunDir), 0.0), 4.0) * 0.35 * foam * gShadow;   // light through the sheet
  float a = mix(0.42, 0.94, foam) * smoothstep(0.0, 0.3, edge) * mix(1.0, 0.6, vLayer) * (1.0 - smoothstep(0.9, 1.0, s) * 0.5);
  gl_FragColor = vec4(applyFog(c, vWP), a);
}`, { uShallow: { value: PAL.shallow }, uDeep: { value: PAL.deep } }, { transparent: true, depthWrite: false, side: THREE.DoubleSide });

// churned water where the curtain lands: foam streaming outward over the pool
const plungeMat = mat(`
attribute float aR; varying float vR; varying vec3 vWP;
void main(){ vR = aR; vec4 w = modelMatrix * vec4(position, 1.0); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`, `
uniform vec3 uCenter; varying float vR; varying vec3 vWP;
void main(){
  vec2 d = vWP.xz - uCenter.xz; float r = length(d);
  vec2 q = (d - d / max(r, 0.01) * uTime * 1.1) * 0.9;
  float n = vnoise(q) * 0.6 + vnoise(q * 2.7 + 3.0) * 0.4;
  float foam = smoothstep(0.42 - 0.3 * (1.0 - vR), 0.7, n) * (1.0 - smoothstep(0.35, 1.0, vR)) + (1.0 - smoothstep(0.0, 0.35, vR)) * 0.6;
  vec3 c = lighting(vec3(0.92, 0.95, 0.97), vec3(0.0, 1.0, 0.0), vWP, 0.0) + uSkyAmb * 0.2;
  gl_FragColor = vec4(applyFog(c, vWP), clamp(foam, 0.0, 0.95));
}`, { uCenter: { value: new THREE.Vector3() } }, { transparent: true, depthWrite: false });

// mist rising from the plunge pool: soft, noisy puffs that billow up and drift downwind, lit on the sun side;
// MIST_PX = drawing-buffer height in pixels (set on resize), so puffs are sized in metres
export const MIST_PX = { value: 720 };
const mistMat = mat(`attribute vec4 aSeed; uniform float uPx; varying float vA; varying vec3 vWP; varying float vSeed;
void main(){
  float t = fract(uTime * (0.07 + aSeed.w * 0.06) + aSeed.z);
  vec2 out2 = (aSeed.xy - 0.5) * 2.0;
  // most puffs stay low in a dense billow around the plunge; a few climb high and drift downwind
  float rise = aSeed.w * aSeed.w * 12.0 + 1.5;
  vec3 p = position + vec3(out2.x * 5.0 * sqrt(t) + uWindDir.x * t * 4.0, t * rise, out2.y * 5.0 * sqrt(t) + uWindDir.y * t * 4.0);
  vec4 mv = viewMatrix * vec4(p, 1.0); vWP = p; vSeed = aSeed.w;
  float size = (2.4 + 4.5 * t) * (0.7 + aSeed.y * 0.6);                      // metres across
  gl_PointSize = size * projectionMatrix[1][1] * 0.5 * uPx / max(-mv.z, 1.0);
  vA = smoothstep(0.0, 0.1, t) * (1.0 - smoothstep(0.4, 1.0, t)) * (0.85 - 0.45 * aSeed.w);
  gl_Position = projectionMatrix * mv;
}`, `varying float vA; varying vec3 vWP; varying float vSeed;
void main(){
  vec2 pc = gl_PointCoord - 0.5;
  float n = vnoise(pc * 3.5 + vSeed * 31.0) * 0.6 + vnoise(pc * 7.0 - vSeed * 17.0) * 0.4;
  float a = smoothstep(0.5, 0.1, length(pc) * (0.8 + 0.5 * n)) * vA * 0.42;
  vec3 c = vec3(0.95, 0.97, 1.0) * (uSkyAmb * 0.85 + uSunColor * (0.45 + 0.25 * max(uSunDir.y, 0.0)));
  gl_FragColor = vec4(applyFog(c, vWP), a);
}`, { uPx: MIST_PX }, { transparent: true, depthWrite: false });

function addMist(group, x, y, z, spread, seed) {
  const N = 160, pos = new Float32Array(N * 3), sd = new Float32Array(N * 4);
  let r = seed * 9301 + 49297;
  const R = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  for (let i = 0; i < N; i++) { pos.set([x + (R() - 0.5) * spread, y + R() * 0.6, z + (R() - 0.5) * spread], i * 3); sd.set([R(), R(), R(), R()], i * 4); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4));
  const pts = new THREE.Points(g, mistMat); pts.frustumCulled = false; pts.renderOrder = 5; group.add(pts);
}

const FALL_V0 = 2.5, G = 9.8;   // speed over the lip (m/s) and gravity: the curtain's ballistic arc

// a waterfall from the lip (x, yTop, z) along horizontal flow direction (dx, dz) down to the pool at yPool:
// the arc is ballistic but pushed out wherever it would cut into the cliff
function addCurtain(group, x, z, dx, dz, halfW, yTop, yPool, seed) {
  const K = 26, A = 7, T = Math.sqrt(2 * Math.max(yTop - yPool, 0.5) / G), sx = -dz, sz = dx;
  const centre = [];
  let off = 0;
  for (let k = 0; k <= K; k++) {
    const t = T * k / K, y = k === K ? yPool - 0.3 : yTop - 0.5 * G * t * t;
    off = Math.max(off, FALL_V0 * t);
    while (off < 30 && heightAt(x + dx * off, z + dz * off) > y - 0.5) off += 0.2;   // keep clear of the rock
    centre.push([x + dx * off, y, z + dz * off]);
  }
  const pos = [], uv = [], m = [], layer = [], idx = [];
  for (let L = 0; L < 2; L++) {
    const back = L ? 0.7 : 0, wk = L ? 0.85 : 1, base = pos.length / 3;
    let along = 0;
    for (let k = 0; k <= K; k++) {
      const c = centre[k];
      if (k) along += Math.hypot(c[0] - centre[k - 1][0], c[1] - centre[k - 1][1], c[2] - centre[k - 1][2]);
      const s = k / K, hw = halfW * wk * (1 + 0.4 * s);
      for (let a = 0; a < A; a++) {
        const u = a / (A - 1) * 2 - 1;
        pos.push(c[0] + sx * u * hw - dx * back, c[1], c[2] + sz * u * hw - dz * back);
        uv.push(u, s); m.push(u * hw, along); layer.push(L);
      }
    }
    for (let k = 0; k < K; k++) for (let a = 0; a < A - 1; a++) { const i0 = base + k * A + a, i1 = i0 + 1, i2 = i0 + A, i3 = i2 + 1; idx.push(i0, i2, i1, i1, i2, i3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aUV', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aM', new THREE.Float32BufferAttribute(m, 2));
  g.setAttribute('aLayer', new THREE.Float32BufferAttribute(layer, 1));
  g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
  const curtain = new THREE.Mesh(g, fallMat); curtain.renderOrder = 4; curtain.layers.enable(REFLECT); group.add(curtain);
  // foam disc on the pool
  const [px, , pz] = centre[K], R = halfW * 2.8, rings = 6, segs = 32, fp = [], fr = [], fi = [];
  for (let i = 0; i <= rings; i++) for (let j = 0; j < segs; j++) {
    const rr = R * i / rings, a = j / segs * Math.PI * 2;
    fp.push(px + Math.cos(a) * rr, yPool + 0.04, pz + Math.sin(a) * rr); fr.push(i / rings);
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) { const a = i * segs + j, b = i * segs + (j + 1) % segs, c = a + segs, d = b + segs; fi.push(a, c, b, b, c, d); }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); fg.setAttribute('aR', new THREE.Float32BufferAttribute(fr, 1)); fg.setIndex(fi); fg.computeBoundingSphere();
  const pm = plungeMat.clone(); pm.uniforms = Object.assign({}, plungeMat.uniforms, { uCenter: { value: new THREE.Vector3(px, yPool, pz) } });
  const foam = new THREE.Mesh(fg, pm); foam.renderOrder = 4; group.add(foam);
  addMist(group, px, yPool, pz, halfW * 2, seed);
}

const DROP = 2.0;   // river surface slope (m/m) beyond which the water falls free instead of flowing as a ribbon

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
    // free falls: runs of rows reached by a drop steeper than DROP; each becomes a curtain from the row above
    const slopeIn = i => (i > 0 ? (surf[i - 1] - surf[i]) / (pts[i].distanceTo(pts[i - 1]) || 1) : 0);
    const free = new Uint8Array(N);
    for (let i = 1; i < N; i++) free[i] = slopeIn(i) > DROP ? 1 : 0;
    for (let i = 1; i < N; i++) if (free[i] && !free[i - 1]) {
      let b = i; while (b + 1 < N && free[b + 1]) b++;
      const lip = pts[i - 1], d = pts[i].clone().sub(lip).normalize(), pool = surf[Math.min(b + 1, N - 1)];
      addCurtain(group, lip.x, lip.y, d.x, d.y, p.width * 0.5, surf[i - 1], pool, i + 7);
    }
    for (let i = 0; i < N; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N - 1, i + 1)];
      const tx = b.x - a.x, tz = b.y - a.y, tl = Math.hypot(tx, tz) || 1;
      const sx = -tz / tl, sz = tx / tl;
      const slopeL = i < N - 1 ? (surf[i] - surf[i + 1]) / (pts[i].distanceTo(pts[i + 1]) || 1) : 0;
      const sp = clamp(0.35 + slopeL * 14, 0.35, 1.6), fall = free[i] ? -1 : i + 1 < N && free[i + 1] ? 0.2 : smooth(0.5, 1.2, slopeL);   // the lip row stays smooth water
      for (let k = 0; k < A; k++) {
        const u = k / (A - 1) * 2 - 1, x = pts[i].x + sx * u * half, z = pts[i].y + sz * u * half;
        pos.push(x, surf[i], z); gr.push(heightAt(x, z)); fl.push(tx / tl * sp, tz / tl * sp); fa.push(fall);
      }
    }
    for (let i = 0; i < N - 1; i++) for (let k = 0; k < A - 1; k++) { const a = i * A + k, b = a + 1, c = a + A, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aGround', new THREE.Float32BufferAttribute(gr, 1));
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(fl, 2));
    g.setAttribute('aFall', new THREE.Float32BufferAttribute(fa, 1));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, waterMat); m.renderOrder = 3; m.layers.enable(REFLECT); group.add(m);
  }
  return lakes;
}
