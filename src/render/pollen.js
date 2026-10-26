// Floating pollen motes: a 70m tile of points wrapped around the orbit target, glowing when backlit.
import * as THREE from 'three';
import { mulberry32 } from '../core/math.js';
import { isSmall } from '../platform.js';
import { mat } from './material.js';

export function createPollen(scene, renderer) {
  const N = isSmall ? 260 : 520, R = mulberry32(31), p = new Float32Array(N * 3), d = new Float32Array(N);
  for (let i = 0; i < N; i++) { p[i * 3] = (R() - 0.5) * 70; p[i * 3 + 1] = 0.3 + R() * 5; p[i * 3 + 2] = (R() - 0.5) * 70; d[i] = R(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aRand', new THREE.BufferAttribute(d, 1));
  const m = mat(`attribute float aRand; uniform vec3 uCenter; uniform float uPx; varying float vA; varying float vBack;
void main(){ vec3 q = position; q.xz += uWindDir * uTime * (0.6 + uWind * 2.2) * (0.6 + aRand * 0.6); q.xz = mod(q.xz + 35.0, 70.0) - 35.0; q.y += sin(uTime * 0.8 + aRand * 20.0) * 0.35;
  vec3 w = q + uCenter; vec4 mv = viewMatrix * vec4(w, 1.0); float dist = -mv.z;
  gl_PointSize = uPx * (1.6 + aRand * 1.8) * (14.0 / max(dist, 1.0));
  vA = (0.35 + 0.65 * (sin(uTime * 2.0 + aRand * 31.0) * 0.5 + 0.5)) * smoothstep(60.0, 20.0, dist) * smoothstep(0.5, 2.0, dist);
  vBack = pow(max(dot(normalize(w - cameraPosition), uSunDir), 0.0), 4.0); gl_Position = projectionMatrix * mv; }`,
  `varying float vA; varying float vBack; void main(){ float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)); vec3 col = mix(vec3(1.0, 0.98, 0.86), uSunColor, 0.4) * (1.0 + vBack * 1.4); gl_FragColor = vec4(col, a * vA * 0.75); }`,
  { uCenter: { value: new THREE.Vector3() }, uPx: { value: renderer.getPixelRatio() } }, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 6; scene.add(pts);
  return { pts, m };
}
