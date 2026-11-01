// Sun shadow map resources: depth target, orthographic light camera (layer 1 = shadow casters),
// and the depth material (leaf cards alpha-tested so canopies cast dappled shadows; a model fading between LOD
// levels casts the shadow of one level at a time, switching halfway through the fade — the map is re-rendered
// only now and then, so a dithered shadow could stay stuck half-faded).
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
  vertexShader: `attribute vec2 aUV; attribute float aCard; attribute float aFade; varying vec2 vUV; varying float vCard; varying float vFade;
void main() {
  vUV = aUV; vCard = aCard; vFade = aFade;
  mat4 m = modelMatrix;
#ifdef USE_INSTANCING
  m = modelMatrix * instanceMatrix;
#endif
  gl_Position = projectionMatrix * viewMatrix * m * vec4(position, 1.0);
}`,
  fragmentShader: `uniform sampler2D uLeaf; varying vec2 vUV; varying float vCard; varying float vFade;
void main() {
  if (vFade > 0.5 || (vFade < 0.0 && vFade > -0.5)) discard;
  if (vCard > 0.5 && vCard < 1.5 && texture2D(uLeaf, vUV).a < 0.42) discard;
  gl_FragColor = vec4(1.0);
}`,
  side: THREE.DoubleSide
});
