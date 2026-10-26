// Sun shadow pass: a 144m orthographic window placed ahead of the camera, re-rendered only when the
// window moves more than 2.5m or the sun turns.
import * as THREE from 'three';
import { clamp } from '../core/math.js';
import { heightAt } from '../world/grid.js';
import { U } from './uniforms.js';
import { shadowRT, lightCam, depthMat } from './shadow-map.js';

export function createShadows(renderer, scene, camera, controls) {
  const state = { c: new THREE.Vector3(1e9, 0, 0), s: new THREE.Vector3(), force: true };
  const _fwd = new THREE.Vector3(), _sc = new THREE.Vector3();
  return {
    invalidate() { state.force = true; },
    update() {
      camera.getWorldDirection(_fwd); _fwd.y = 0; if (_fwd.lengthSq() < 1e-4) _fwd.set(0, 0, -1); _fwd.normalize();
      const reach = clamp(camera.position.distanceTo(controls.target), 12, 60) * 0.8;
      _sc.set(camera.position.x + _fwd.x * reach, 0, camera.position.z + _fwd.z * reach);
      _sc.x = Math.round(_sc.x / 2) * 2; _sc.z = Math.round(_sc.z / 2) * 2; _sc.y = heightAt(_sc.x, _sc.z);
      const sd = U.uSunDir.value;
      if (!state.force && _sc.distanceTo(state.c) < 2.5 && sd.distanceTo(state.s) < 0.002) return;
      state.force = false; state.c.copy(_sc); state.s.copy(sd);
      lightCam.position.set(_sc.x + sd.x * 450, _sc.y + sd.y * 450, _sc.z + sd.z * 450);
      lightCam.lookAt(_sc); lightCam.updateMatrixWorld(); lightCam.updateProjectionMatrix();
      U.uShadowMatrix.value.multiplyMatrices(lightCam.projectionMatrix, lightCam.matrixWorldInverse);
      U.uShadowOn.value = 0;
      scene.overrideMaterial = depthMat;
      renderer.setRenderTarget(shadowRT); renderer.clear(); renderer.render(scene, lightCam);
      scene.overrideMaterial = null; renderer.setRenderTarget(null);
      U.uShadowOn.value = 1;
    }
  };
}
