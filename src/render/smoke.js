// Chimney smoke: soft puffs that rise from each chimney top, swell, drift downwind and fade. Sized in metres
// (like the waterfall mist); greyer and dimmer at night.
import * as THREE from 'three';
import { mat } from './material.js';
import { MIST_PX } from './water-mesh.js';

const smokeMat = mat(`attribute vec4 aSeed; uniform float uPx; varying float vA; varying vec3 vWP; varying float vSeed;
void main(){
  float t = fract(uTime * (0.045 + aSeed.w * 0.025) + aSeed.z);
  vec2 wob = vec2(sin(t * 6.0 + aSeed.x * 6.28), cos(t * 5.0 + aSeed.y * 6.28)) * 0.5 * t;
  vec3 p = position + vec3(uWindDir.x * t * t * (4.0 + uWind * 10.0) + wob.x, t * 9.0, uWindDir.y * t * t * (4.0 + uWind * 10.0) + wob.y);
  vec4 mv = viewMatrix * vec4(p, 1.0); vWP = p; vSeed = aSeed.x;
  gl_PointSize = (0.5 + 3.0 * t) * (0.8 + aSeed.y * 0.4) * projectionMatrix[1][1] * 0.5 * uPx / max(-mv.z, 1.0);
  vA = smoothstep(0.0, 0.06, t) * (1.0 - t) * 0.38;
  gl_Position = projectionMatrix * mv;
}`, `varying float vA; varying vec3 vWP; varying float vSeed;
void main(){
  vec2 pc = gl_PointCoord - 0.5;
  float n = vnoise(pc * 3.0 + vSeed * 27.0) * 0.6 + vnoise(pc * 6.5 - vSeed * 13.0) * 0.4;
  float a = smoothstep(0.5, 0.1, length(pc) * (0.75 + 0.5 * n)) * vA;
  vec3 c = vec3(0.78, 0.78, 0.8) * (uSkyAmb * 0.9 + uSunColor * 0.45 * max(uSunDir.y + 0.2, 0.0));
  c = mix(c, uFogColor, 0.4) * mix(1.0, 0.85, uNight);   // pale, picks up the haze colour so it never reads as soot
  gl_FragColor = vec4(applyFog(c, vWP), a);
}`, { uPx: MIST_PX }, { transparent: true, depthWrite: false });

// emitters: [[x, y, z], …]
export function buildSmoke(group, emitters) {
  if (!emitters.length) return;
  const per = 18, N = emitters.length * per, pos = new Float32Array(N * 3), sd = new Float32Array(N * 4);
  let r = 12345;
  const R = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  emitters.forEach(([x, y, z], e) => { for (let k = 0; k < per; k++) { const i = e * per + k; pos.set([x + (R() - 0.5) * 0.3, y, z + (R() - 0.5) * 0.3], i * 3); sd.set([R(), R(), (k + R() * 0.5) / per, R()], i * 4); } });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4));
  const pts = new THREE.Points(g, smokeMat); pts.frustumCulled = false; pts.renderOrder = 6; group.add(pts);
}
