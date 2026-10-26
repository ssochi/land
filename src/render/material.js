// Scene material factory: shared uniforms + the common GLSL prelude, plus per-material extras.
import * as THREE from 'three';
import { U } from './uniforms.js';
import COMMON from './shaders/common.glsl.js';

export function mat(vs, fs, extra, opts) {
  return new THREE.ShaderMaterial(Object.assign({ uniforms: Object.assign({}, U, extra || {}), vertexShader: COMMON + vs, fragmentShader: COMMON + fs }, opts || {}));
}
