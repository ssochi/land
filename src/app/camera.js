// Orbit camera and preset resolution. Presets are written ground-relative (at/eye, look/lookEye) or absolute (pos/target).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { heightAt } from '../world/grid.js';
import { waterLevelAt } from '../world/fields.js';

export function createControls(camera, canvas) {
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.07; controls.enablePan = true; controls.screenSpacePanning = false;
  // up to ~26° above the horizon: low shots looking up at cliffs and towers (the frame loop keeps the camera above ground)
  controls.minDistance = 2; controls.maxDistance = 1200; controls.maxPolarAngle = Math.PI * 0.5 + 0.45; controls.rotateSpeed = 0.55;
  return controls;
}

// ground or water surface, whichever is higher
export const surfaceAt = (x, z) => Math.max(heightAt(x, z), waterLevelAt(x, z) || -1e9);

export function resolveCam(c) {
  let pos, tgt;
  if (c.pos) pos = new THREE.Vector3(...c.pos);
  else { const [x, z] = c.at || [0, 30]; pos = new THREE.Vector3(x, surfaceAt(x, z) + c.eye, z); }
  if (c.target) tgt = new THREE.Vector3(...c.target);
  else { const [x, z] = c.look || [0, 0]; tgt = new THREE.Vector3(x, surfaceAt(x, z) + c.lookEye, z); }
  return { pos, tgt };
}
