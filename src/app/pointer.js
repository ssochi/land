// Cursor push: ray-march the pointer onto the terrain and ease the grass push point (PUSH) toward it.
import * as THREE from 'three';
import { heightAt } from '../world/grid.js';
import { PUSH } from '../render/grass.js';

export function createPointerPush(canvas, camera) {
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), pushTarget = new THREE.Vector3(0, -999, 0);
  let pointerIn = false, pushStrength = 0;
  canvas.addEventListener('pointermove', e => {
    const rect = canvas.getBoundingClientRect(); ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera); const o = ray.ray.origin, d = ray.ray.direction; let prev = 0, hit = -1;
    for (let t = 0.5; t < 80; t += 0.4) { if (o.y + d.y * t < heightAt(o.x + d.x * t, o.z + d.z * t) + 0.35) { hit = t; break; } prev = t; }
    if (hit < 0) { pointerIn = false; return; }
    let lo = prev, hi = hit; for (let i = 0; i < 8; i++) { const m = (lo + hi) / 2; if (o.y + d.y * m < heightAt(o.x + d.x * m, o.z + d.z * m) + 0.35) hi = m; else lo = m; }
    pushTarget.set(o.x + d.x * hi, 0, o.z + d.z * hi); pointerIn = true;
  });
  canvas.addEventListener('pointerleave', () => { pointerIn = false; });
  return {
    // feet: in first person the grass parts around the walker instead of under the cursor
    update(dt, feet) {
      const on = feet ? 1 : pointerIn ? 1 : 0;
      if (feet) pushTarget.set(feet.x, 0, feet.z);
      pushStrength += (on - pushStrength) * Math.min(1, dt * 6);
      PUSH.x += (pushTarget.x - PUSH.x) * Math.min(1, dt * 14); PUSH.z += (pushTarget.z - PUSH.z) * Math.min(1, dt * 14); PUSH.w = pushStrength;
    }
  };
}
