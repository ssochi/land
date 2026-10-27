// Planar lake reflection: the scene (sky, terrain, trees, rocks, rivers — objects on the REFLECT layer) rendered
// from the camera mirrored across the lake surface, with an oblique near plane so nothing below the water
// leaks in (Lengyel's oblique clipping, as in three's Reflector). Half resolution, skipped when no lake is visible.
import * as THREE from 'three';
import { isSmall } from '../platform.js';
import { REFLECT } from './layers.js';
import { depth24 } from './post.js';

// sampled by the water shader: world position on the plane -> reflection texture uv
export const REFL = { uRefl: { value: null }, uReflMatrix: { value: new THREE.Matrix4() }, uReflOn: { value: 0 }, uReflLevel: { value: 0 } };

export function createReflection(renderer, scene, camera) {
  const type = renderer.capabilities.isWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const rt = new THREE.WebGLRenderTarget(4, 4, { type });
  rt.depthTexture = depth24(renderer);
  REFL.uRefl.value = rt.texture;
  const virtualCam = new THREE.PerspectiveCamera();
  virtualCam.layers.set(REFLECT);
  const plane = new THREE.Plane(), clip = new THREE.Vector4(), q = new THREE.Vector4(), fwd = new THREE.Vector3(), tgt = new THREE.Vector3();
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), size = new THREE.Vector2();
  let lakes = [];  // [{ level, sphere }]
  const scale = isSmall ? 0.35 : 0.5;

  function resize() { renderer.getDrawingBufferSize(size); rt.setSize(Math.max(1, Math.round(size.x * scale)), Math.max(1, Math.round(size.y * scale))); }

  // the visible lake whose surface is closest to the camera, or null
  function pickLake() {
    pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pv);
    let best = null, bd = Infinity;
    for (const L of lakes) {
      if (camera.position.y < L.level || !frustum.intersectsSphere(L.sphere)) continue;
      const d = L.sphere.distanceToPoint(camera.position);
      if (d < bd) { bd = d; best = L; }
    }
    return best;
  }

  function update() {
    const L = pickLake();
    REFL.uReflOn.value = L ? 1 : 0;
    if (!L) return;
    const h = L.level;
    camera.updateMatrixWorld();
    virtualCam.position.set(camera.position.x, 2 * h - camera.position.y, camera.position.z);
    camera.getWorldDirection(fwd);
    tgt.copy(camera.position).add(fwd); tgt.y = 2 * h - tgt.y;
    virtualCam.up.set(0, 1, 0).applyQuaternion(camera.quaternion); virtualCam.up.y = -virtualCam.up.y;
    virtualCam.lookAt(tgt);
    virtualCam.near = camera.near; virtualCam.far = camera.far;
    virtualCam.updateMatrixWorld();
    virtualCam.projectionMatrix.copy(camera.projectionMatrix);
    REFL.uReflMatrix.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(virtualCam.projectionMatrix).multiply(virtualCam.matrixWorldInverse);
    REFL.uReflLevel.value = h;
    // oblique near plane = the water surface
    plane.set(new THREE.Vector3(0, 1, 0), -h).applyMatrix4(virtualCam.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const e = virtualCam.projectionMatrix.elements;
    q.set((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    clip.multiplyScalar(2 / clip.dot(q));
    e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1 - 0.003; e[14] = clip.w;
    const prev = renderer.getRenderTarget();
    // rivers (waterfalls) are reflected too: unbind the texture being drawn, or WebGL drops their draws as a feedback loop
    REFL.uReflOn.value = 0; REFL.uRefl.value = null;
    renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, virtualCam);
    renderer.setRenderTarget(prev);
    REFL.uReflOn.value = 1; REFL.uRefl.value = rt.texture;
  }

  resize();
  return { update, resize, setLakes(list) { lakes = list; } };
}
