// Uniforms shared by every scene material (the same objects are referenced, so one write updates all),
// and the editable color palette.
import * as THREE from 'three';
import { FAR } from '../world/grid.js';
import { HZ0, HZ1, HZAO } from './horizon.js';
import { shadowRT, SHADOW_SIZE } from './shadow-map.js';

export const U = {
  uHz0: { value: HZ0 }, uHz1: { value: HZ1 }, uHzAO: { value: HZAO }, uHzMin: { value: new THREE.Vector2(FAR.min, FAR.min) }, uHzSize: { value: FAR.size },
  uMA0: { value: new THREE.Vector4() }, uMA1: { value: new THREE.Vector4() }, uMB0: { value: new THREE.Vector4() }, uMB1: { value: new THREE.Vector4() },
  uHzW: { value: 0 }, uSunTan: { value: 1 }, uHzOn: { value: 0 },
  uShadowMap: { value: shadowRT.depthTexture }, uShadowMatrix: { value: new THREE.Matrix4() }, uShadowOn: { value: 0 }, uShadowTexel: { value: 1 / SHADOW_SIZE },
  uTime: { value: 0 }, uWind: { value: 0.5 }, uWindDir: { value: new THREE.Vector2(0.86, -0.48).normalize() },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color(1, 1, 1) },
  uSkyAmb: { value: new THREE.Color(0.42, 0.52, 0.62) }, uGroundAmb: { value: new THREE.Color(0.3, 0.34, 0.24) },
  uFogColor: { value: new THREE.Color('#bddbe8') }, uZenith: { value: new THREE.Color('#2a76d2') },
  uFogDensity: { value: 0.0034 }, uDebug: { value: 0 }
};

// grass/terrain/water colors; m.env({ grass, water }) overwrites them in place
export const PAL = {
  root: new THREE.Color('#34561f'), mid: new THREE.Color('#62962f'), tipA: new THREE.Color('#d2d862'), tipB: new THREE.Color('#9cc64c'),
  shallow: new THREE.Color('#58c9bf'), deep: new THREE.Color('#1d5a8c'), sand: new THREE.Color('#cdbf96')
};
