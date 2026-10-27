// First-person walker physics over the generated world: walk, sprint, jump, swim and free flight, with a
// slope limit (cliffs cannot be walked up, but ledges can be jumped onto) and collision against trees,
// rocks and ruins. Pure — the input is a plain object — so it runs in the page, headless and in tests.
import { clamp } from '../core/math.js';
import { heightAt } from '../world/grid.js';
import { waterLevelAt } from '../world/fields.js';
import { obstPush } from '../objects/placement.js';
import { groundAt } from '../terrain/crag.js';

export const WALK = {
  walk: 4.6, sprint: 8.8, swim: 2.6, swimSprint: 4.2, fly: 14, flySprint: 42,  // m/s
  jump: 6.4, gravity: 17,          // jump speed m/s, gravity m/s² (~1.2 m jump)
  eye: 1.65, radius: 0.35,         // eye height and body radius, m
  maxSlope: 1.15,                  // steepest walkable rise per metre (~49°); higher ledges need a jump
  float: 1.3,                      // in water deeper than this the walker swims, eye just above the surface
  bound: 1080
};

// what the feet stand on at (x, z): the ground, or a floating height in deep water
function support(x, z) {
  const g = groundAt(x, z), wl = waterLevelAt(x, z);
  return wl != null && wl - g > WALK.float ? { y: wl - WALK.float, swim: true } : { y: g, swim: false };
}

export function createWalker(x, z, { yaw = 0, pitch = 0, y = null, flying = false } = {}) {
  const s = support(x, z);
  return { x, y: y != null ? Math.max(y, s.y) : s.y, z, vx: 0, vy: 0, vz: 0, yaw, pitch, grounded: y == null, flying, swimming: false, sprinting: false, bob: 0 };
}

// input: { forward, right ∈ [-1, 1], sprint, up, down (held), jump, toggleFly (edge: consumed here) }
export function stepWalker(w, dt, input) {
  const P = WALK;
  if (input.toggleFly) { w.flying = !w.flying; input.toggleFly = false; if (w.flying) { w.vy = Math.max(w.vy, 3); w.grounded = false; } }  // lift off
  // wish direction in world space; yaw 0 looks toward -z, right is +x
  const f = clamp(input.forward || 0, -1, 1), r = clamp(input.right || 0, -1, 1), mag = Math.hypot(f, r), k = Math.min(1, mag) / (mag || 1);
  const sy = Math.sin(w.yaw), cy = Math.cos(w.yaw), wx = (-sy * f + cy * r) * k, wz = (-cy * f - sy * r) * k;
  const here = support(w.x, w.z);
  w.swimming = !w.flying && here.swim && w.y <= here.y + 0.05;
  w.sprinting = !!input.sprint && mag > 0.1;
  const speed = w.flying ? (input.sprint ? P.flySprint : P.fly) : w.swimming ? (input.sprint ? P.swimSprint : P.swim) : (input.sprint ? P.sprint : P.walk);
  const a = 1 - Math.exp(-(w.flying ? 4 : w.grounded || w.swimming ? 12 : 2.5) * dt);  // ground grip vs air control
  w.vx += (wx * speed - w.vx) * a; w.vz += (wz * speed - w.vz) * a;
  if (w.flying) w.vy += (((input.up ? 1 : 0) - (input.down ? 1 : 0)) * speed * 0.6 - w.vy) * a;
  else if (w.swimming) w.vy = 0;
  else { if (input.jump && w.grounded) { w.vy = P.jump; w.grounded = false; } w.vy -= P.gravity * dt; }
  input.jump = false;

  // horizontal move: refuse rises steeper than maxSlope (try sliding along one axis), then push out of obstacles
  const ox = w.x, oz = w.z;
  let nx = clamp(w.x + w.vx * dt, -P.bound, P.bound), nz = clamp(w.z + w.vz * dt, -P.bound, P.bound);
  if (!w.flying) {
    const ok = (x, z) => support(x, z).y <= w.y + 1e-4 + P.maxSlope * Math.hypot(x - ox, z - oz);  // measured from the feet, so a jump clears ledges
    if (!ok(nx, nz)) { if (ok(nx, oz)) nz = oz; else if (ok(ox, nz)) nx = ox; else { nx = ox; nz = oz; } }
  }
  if (!w.flying || w.y - heightAt(nx, nz) < 3) ({ x: nx, z: nz } = obstPush(nx, nz, P.radius));
  if (dt > 0 && (nx !== ox + w.vx * dt || nz !== oz + w.vz * dt)) { w.vx = (nx - ox) / dt; w.vz = (nz - oz) / dt; }
  w.x = nx; w.z = nz;

  // vertical: land, follow the ground down slopes, float on deep water, or stay above it while flying
  const s = support(w.x, w.z);
  w.y += w.vy * dt;
  if (w.flying) {
    if (w.y <= s.y) { w.y = s.y; if (w.vy < 0) { w.vy = 0; w.flying = false; w.grounded = !s.swim; } }   // flying down into the ground lands
  } else if (w.y <= s.y || (w.grounded && w.vy <= 0 && w.y - s.y < 0.6)) {
    w.y = s.y; w.vy = 0; w.grounded = !s.swim; w.swimming = s.swim;
  } else w.grounded = false;
  const hs = Math.hypot(w.vx, w.vz);
  if (w.grounded) w.bob += hs * dt;
  return w;
}

// camera pose for the walker: eye position (with a little head bob) and look direction
export function walkerView(w) {
  const hs = Math.hypot(w.vx, w.vz), bob = w.grounded ? Math.sin(w.bob * 1.9) * 0.035 * Math.min(1, hs / 4) : 0;
  const cp = Math.cos(w.pitch);
  return { x: w.x, y: w.y + WALK.eye + bob, z: w.z, dx: -Math.sin(w.yaw) * cp, dy: Math.sin(w.pitch), dz: -Math.cos(w.yaw) * cp };
}

export function walkerState(w) {
  const r = v => +v.toFixed(2);
  return { x: r(w.x), y: r(w.y), z: r(w.z), yaw: r(w.yaw), pitch: r(w.pitch), speed: r(Math.hypot(w.vx, w.vz)), vy: r(w.vy),
    grounded: w.grounded, flying: w.flying, swimming: w.swimming, sprinting: w.sprinting };
}
