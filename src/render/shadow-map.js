// Sun shadow map resources: depth target, orthographic light camera (layer 1 = shadow casters),
// and the depth material (leaf cards alpha-tested so canopies cast dappled shadows).
import * as THREE from 'three';
import { isSmall } from '../platform.js';
import { LEAF_TEX } from './textures.js';
import { SHADOW } from './layers.js';

export const SHADOW_SIZE = isSmall ? 1024 : 2048, SH_HALF = 72;
export const shadowRT = new THREE.WebGLRenderTarget(SHADOW_SIZE, SHADOW_SIZE);
shadowRT.depthTexture = new THREE.DepthTexture(SHADOW_SIZE, SHADOW_SIZE);
shadowRT.depthTexture.type = THREE.UnsignedIntType;
export const lightCam = new THREE.OrthographicCamera(-SH_HALF, SH_HALF, SH_HALF, -SH_HALF, 1, 1000);
lightCam.layers.set(SHADOW);
export const depthMat = new THREE.ShaderMaterial({
  uniforms: { uLeaf: { value: LEAF_TEX } },
  vertexShader: `attribute vec2 aUV; attribute float aCard; varying vec2 vUV; varying float vCard;
void main() {
  vUV = aUV; vCard = aCard;
  mat4 m = modelMatrix;
#ifdef USE_INSTANCING
  m = modelMatrix * instanceMatrix;
#endif
  gl_Position = projectionMatrix * viewMatrix * m * vec4(position, 1.0);
}`,
  fragmentShader: `uniform sampler2D uLeaf; varying vec2 vUV; varying float vCard; void main() { if (vCard > 0.5 && vCard < 1.5 && texture2D(uLeaf, vUV).a < 0.42) discard; gl_FragColor = vec4(1.0); }`,
  side: THREE.DoubleSide
});
