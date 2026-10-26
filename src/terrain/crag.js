// Crag relief: steep ground is pushed in and out along its downhill direction by 3D noise, so cliffs read as
// craggy rock instead of a smooth stretched sheet. The terrain mesh applies it to its vertices
// (src/render/terrain-mesh.js); groundAt() inverts it so objects, grass and the walker sit on the rock that is
// actually drawn instead of floating off a cliff face. Faded out near the DETAIL border so the meshes still meet.
import { smooth } from '../core/math.js';
import { vnoise3 } from '../core/noise.js';
import { DETAIL, FAR, detailW, heightAt } from '../world/grid.js';

// for a vertex of grid G at (x, y, z) whose height gradient has length g: { o, dy } — the push against the
// gradient direction and the vertical jitter, or null where the ground is not steep
export function cragOffset(G, x, y, z, g) {
  const steep = smooth(0.7, 1.6, g);
  if (steep <= 0) return null;
  const din = Math.min(x - DETAIL.min, DETAIL.min + DETAIL.size - x, z - DETAIL.min, DETAIL.min + DETAIL.size - z);
  const amp = G === DETAIL ? 1.8 : 3.4, f = G === DETAIL ? 0.1 : 0.05, a = amp * steep * smooth(6, 24, Math.abs(din));
  if (a <= 0) return null;
  return { o: (vnoise3(x * f, y * f, z * f) - 0.5) * 2 * a, dy: (vnoise3(x * f + 7.1, y * f, z * f - 3.3) - 0.5) * a * 0.6 };
}

// height of the drawn ground at (x, z): a mesh vertex V moves to V - ĝ·o(V), so the vertex that lands on
// (x, z) is found by fixed-point iteration V = P + ĝ·o(V)
export function groundAt(x, z) {
  const G = detailW(x, z) >= 1 ? DETAIL : FAR, e = G.step;
  const gx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e), gz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e), g = Math.hypot(gx, gz);
  const h0 = heightAt(x, z);
  if (g < 0.7) return h0;
  let vx = x, vz = z, c = null;
  for (let it = 0; it < 3; it++) {
    c = cragOffset(G, vx, heightAt(vx, vz), vz, g);
    if (!c) return h0;
    vx = x + gx / g * c.o; vz = z + gz / g * c.o;
  }
  return heightAt(vx, vz) + c.dy;
}
