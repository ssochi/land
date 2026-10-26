// Time of day: interpolates sun direction/color, sky, fog and ambient between dawn, noon and dusk keys.
import * as THREE from 'three';
import { U } from './uniforms.js';
import { HZ_DIRS } from './horizon.js';

const KEYS = [
  { elev: 0.14, az: -1.5, sun: [1.0, 0.74, 0.5], si: 1.12, zen: '#6a87c2', fog: '#efcfae', sky: [0.38, 0.40, 0.52], gnd: [0.25, 0.22, 0.18], fd: 0.0034 },
  { elev: 0.95, az: -0.55, sun: [1.0, 0.95, 0.84], si: 1.1, zen: '#2c74cf', fog: '#c2dbe4', sky: [0.34, 0.43, 0.56], gnd: [0.24, 0.26, 0.19], fd: 0.0026 },
  { elev: 0.21, az: 0.55, sun: [1.0, 0.56, 0.3], si: 1.18, zen: '#3d4f8e', fog: '#eea57c', sky: [0.36, 0.33, 0.46], gnd: [0.28, 0.20, 0.16], fd: 0.0032 }
];

// fogOverride: m.env({ fogDensity }) or null; fogBase: the density the frame loop applies;
// haze: m.env({ haze }) colour blended into the time-of-day fog/horizon colour, or null
export const atmosphere = { fogOverride: null, fogBase: 0.0034, haze: null };
const HAZE_MIX = 0.6;

const _ca = new THREE.Color(), _cb = new THREE.Color();
const lerpA = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// pick the two horizon-map azimuths around the sun and the sun's elevation tangent
function updateSunHorizon() {
  const sd = U.uSunDir.value, hl = Math.hypot(sd.x, sd.z) || 1e-4;
  U.uSunTan.value = sd.y / hl;
  let a = Math.atan2(sd.z, sd.x); if (a < 0) a += Math.PI * 2;
  const f = a / (Math.PI * 2) * HZ_DIRS, i0 = Math.floor(f) % HZ_DIRS, i1 = (i0 + 1) % HZ_DIRS, keys = ['x', 'y', 'z', 'w'];
  const set = (vA, vB, i) => { vA.set(0, 0, 0, 0); vB.set(0, 0, 0, 0); (i < 4 ? vA : vB)[keys[i & 3]] = 1; };
  set(U.uMA0.value, U.uMA1.value, i0); set(U.uMB0.value, U.uMB1.value, i1); U.uHzW.value = f - Math.floor(f);
}

// v: 0 dawn · 0.5 noon · 1 dusk
export function applyTOD(v) {
  const seg = v < 0.5 ? 0 : 1, t = v < 0.5 ? v / 0.5 : (v - 0.5) / 0.5, s = t * t * (3 - 2 * t), A = KEYS[seg], B = KEYS[seg + 1];
  const elev = A.elev + (B.elev - A.elev) * s, az = A.az + (B.az - A.az) * s;
  U.uSunDir.value.set(Math.cos(elev) * Math.sin(az), Math.sin(elev), -Math.cos(elev) * Math.cos(az)).normalize();
  const sc = lerpA(A.sun, B.sun, s), si = A.si + (B.si - A.si) * s; U.uSunColor.value.setRGB(sc[0] * si, sc[1] * si, sc[2] * si);
  U.uZenith.value.copy(_ca.set(A.zen)).lerp(_cb.set(B.zen), s); U.uFogColor.value.copy(_ca.set(A.fog)).lerp(_cb.set(B.fog), s);
  if (atmosphere.haze) U.uFogColor.value.lerp(atmosphere.haze, HAZE_MIX * (1 - 0.6 * Math.abs(v - 0.5) * 2));  // strongest at noon, keeps dawn/dusk warmth
  const sk = lerpA(A.sky, B.sky, s), gn = lerpA(A.gnd, B.gnd, s); U.uSkyAmb.value.setRGB(...sk); U.uGroundAmb.value.setRGB(...gn);
  atmosphere.fogBase = atmosphere.fogOverride != null ? atmosphere.fogOverride : A.fd + (B.fd - A.fd) * s; U.uFogDensity.value = atmosphere.fogBase;
  updateSunHorizon();
}

export const todLabel = v => v < 0.12 ? '清晨' : v < 0.4 ? '上午' : v < 0.6 ? '正午' : v < 0.85 ? '午后' : '黄昏';
