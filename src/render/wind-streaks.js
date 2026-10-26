// BotW-style wind streaks: camera-facing ribbons that drift downwind near the orbit target,
// some curling into a loop. Count scales with wind strength.
import * as THREE from 'three';
import { clamp, smooth, mulberry32 } from '../core/math.js';
import { heightAt } from '../world/grid.js';
import { waterLevelAt } from '../world/fields.js';
import { U } from './uniforms.js';

const NS = 14, NP = 44;  // streaks, points per streak

export function createStreaks(scene, camera, controls) {
  const streakPos = new Float32Array(NS * NP * 6), streakA = new Float32Array(NS * NP * 2);
  const streakGeo = new THREE.BufferGeometry();
  const idx = []; for (let s = 0; s < NS; s++) for (let k = 0; k < NP - 1; k++) { const a = (s * NP + k) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  streakGeo.setIndex(idx);
  streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3).setUsage(THREE.DynamicDrawUsage));
  streakGeo.setAttribute('aAlpha', new THREE.BufferAttribute(streakA, 1).setUsage(THREE.DynamicDrawUsage));
  const streakMesh = new THREE.Mesh(streakGeo, new THREE.ShaderMaterial({
    vertexShader: `attribute float aAlpha; varying float vA; void main(){ vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(1.0, 0.99, 0.95, vA * 0.8); }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  streakMesh.frustumCulled = false; streakMesh.renderOrder = 5; scene.add(streakMesh);

  const SR = mulberry32(5), streaks = [];
  const _p = Array.from({ length: NP }, () => new THREE.Vector3()), _tan = new THREE.Vector3(), _side = new THREE.Vector3(), _toCam = new THREE.Vector3();

  function spawn(s, initial) {
    const wd = U.uWindDir.value, T = controls.target;
    const a = SR() * 6.283, r = 5 + SR() * 26;
    Object.assign(s, { x0: T.x + Math.cos(a) * r - wd.x * 9, z0: T.z + Math.sin(a) * r - wd.y * 9, y0: 0.9 + SR() * 3.2, speed: 5 + SR() * 4, len: 0.9 + SR() * 0.8,
      life: 3.4 + SR() * 2.6, age: initial ? -SR() * 5 : -SR() * 1.5, ph: SR() * 6.283, loop: SR() < 0.65, loopAt: 0.9 + SR() * 1.6, loopDur: 0.85 + SR() * 0.3, loopR: 0.45 + SR() * 0.55, width: 0.032 + SR() * 0.022 });
  }
  for (let i = 0; i < NS; i++) { const s = {}; spawn(s, true); streaks.push(s); }

  // position of a streak's particle `tau` seconds into its life, hugging the ground or water
  function point(s, tau, out) {
    const wd = U.uWindDir.value, lt = s.loop ? (tau - s.loopAt) / s.loopDur : -1, ltc = clamp(lt, 0, 1);
    let along = s.speed * (tau - s.loopDur * ltc * 0.85), up = 0;
    if (lt > 0 && lt < 1) { const ang = lt * 6.283; along += Math.sin(ang) * s.loopR; up = (1 - Math.cos(ang)) * s.loopR; }
    const wig = Math.sin(tau * 1.3 + s.ph) * 0.7, x = s.x0 + wd.x * along - wd.y * wig, z = s.z0 + wd.y * along + wd.x * wig;
    const ground = heightAt(x, z), wl = waterLevelAt(x, z);
    return out.set(x, Math.max(ground, wl || -1e9) + s.y0 + Math.sin(tau * 2.1 + s.ph) * 0.3 + up, z);
  }

  const api = {
    visible: true,
    respawnAll() { streaks.forEach(s => spawn(s, true)); },
    update(dt) {
      const active = api.visible ? Math.round(NS * Math.min(1, 0.15 + U.uWind.value * 0.95)) : 0;
      for (let si = 0; si < NS; si++) {
        const s = streaks[si]; s.age += dt * (0.6 + U.uWind.value * 0.7); if (s.age > s.life) spawn(s, false);
        const fade = si < active && s.age > 0 ? smooth(0, 0.6, s.age) * (1 - smooth(s.life - 0.9, s.life, s.age)) : 0;
        for (let k = 0; k < NP; k++) point(s, Math.max(0, s.age - s.len * (1 - k / (NP - 1))), _p[k]);
        for (let k = 0; k < NP; k++) {
          const u = k / (NP - 1);
          _tan.subVectors(_p[Math.min(NP - 1, k + 1)], _p[Math.max(0, k - 1)]); _toCam.subVectors(camera.position, _p[k]); _side.crossVectors(_tan, _toCam);
          const L = _side.length(), env = Math.sin(Math.PI * u), w = s.width * (0.25 + 0.75 * Math.pow(env, 0.6));
          if (L > 1e-6) _side.multiplyScalar(w / L); else _side.set(0, 0, 0);
          const o = (si * NP + k) * 6;
          streakPos[o] = _p[k].x + _side.x; streakPos[o + 1] = _p[k].y + _side.y; streakPos[o + 2] = _p[k].z + _side.z;
          streakPos[o + 3] = _p[k].x - _side.x; streakPos[o + 4] = _p[k].y - _side.y; streakPos[o + 5] = _p[k].z - _side.z;
          streakA[(si * NP + k) * 2] = streakA[(si * NP + k) * 2 + 1] = Math.pow(env, 1.4) * fade;
        }
      }
      streakGeo.attributes.position.needsUpdate = true; streakGeo.attributes.aAlpha.needsUpdate = true;
    }
  };
  return api;
}
