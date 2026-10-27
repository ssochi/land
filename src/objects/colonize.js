// Space colonization (Runions, Lane & Prusinkiewicz 2007): branches grow toward attraction points inside the crown
// envelope; branch radii follow the pipe model r^n = sum(child r^n).
// Growth starts from the skeleton o.nodes ({ p, parent }, parents before children: a trunk, or the result of an
// earlier, coarser pass); o.jitter is the random kink per step (gnarl).
import { V3, addTube } from './mesh-builder.js';

export function colonize(R, o) {
  const nodes = [], cs = o.infl, grid = new Map(), jit = o.jitter != null ? o.jitter : 0.18;
  const key = (x, y, z) => (Math.floor(x / cs) + 512) * 1048576 + (Math.floor(y / cs) + 512) * 1024 + (Math.floor(z / cs) + 512);
  const add = (p, parent) => { const id = nodes.length; nodes.push({ p, parent, ch: [], r: 0 }); if (parent >= 0) nodes[parent].ch.push(id); const k = key(p.x, p.y, p.z); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(id); return id; };
  const near = (p, rad, fn) => { const cx = Math.floor(p.x / cs), cy = Math.floor(p.y / cs), cz = Math.floor(p.z / cs), K = Math.ceil(rad / cs);
    for (let a = -K; a <= K; a++) for (let b = -K; b <= K; b++) for (let c = -K; c <= K; c++) { const l = grid.get((cx + a + 512) * 1048576 + (cy + b + 512) * 1024 + (cz + c + 512)); if (l) for (const id of l) fn(id); } };
  for (const nd of o.nodes) add(nd.p.clone(), nd.parent);
  let A = []; for (let k = 0; k < o.count; k++) A.push(o.envelope(R));
  const i2 = o.infl * o.infl, k2 = o.kill * o.kill, dup2 = o.seg * o.seg * 0.09;
  for (let it = 0; it < o.iters && A.length; it++) {
    const pull = new Map();
    for (const a of A) {
      let best = -1, bd = i2;
      near(a, o.infl, id => { const d = nodes[id].p.distanceToSquared(a); if (d < bd) { bd = d; best = id; } });
      if (best >= 0) { const v = a.clone().sub(nodes[best].p).normalize(), sv = pull.get(best); if (sv) sv.add(v); else pull.set(best, v); }
    }
    if (!pull.size) break;
    let grown = 0;
    for (const [id, v] of pull) {
      v.normalize(); v.y += o.tropism; v.x += (R() - 0.5) * jit; v.z += (R() - 0.5) * jit; v.y += (R() - 0.5) * jit * 0.5; v.normalize();
      const p = nodes[id].p.clone().addScaledVector(v, o.seg);
      let dup = false; near(p, o.seg, j => { if (!dup && nodes[j].p.distanceToSquared(p) < dup2) dup = true; });
      if (dup) continue;
      add(p, id); grown++;
    }
    if (!grown) break;
    A = A.filter(a => { let hit = false; near(a, o.kill, id => { if (!hit && nodes[id].p.distanceToSquared(a) < k2) hit = true; }); return !hit; });
  }
  for (let k = nodes.length - 1; k >= 0; k--) { const nd = nodes[k]; if (!nd.ch.length) nd.r = o.tipR; else { let sm = 0; for (const c of nd.ch) sm += Math.pow(nodes[c].r, o.pipe); nd.r = Math.pow(sm, 1 / o.pipe); } }
  const sc = o.baseR / nodes[0].r; for (const nd of nodes) nd.r = Math.max(o.minR, nd.r * sc);
  return nodes;
}

// walk the node tree into chains (runs of single-child nodes) and sweep a tube along each, starting inside its
// parent a little wider than itself, with at most maxSegs sides and rings at least `step` apart; chains thinner
// than minR are left out (inside a dense canopy they would only poke through the leaves as bare sticks)
export function branchesToMesh(mb, nodes, barkCol, sway, minR = 0.011, maxSegs = 9, step = 0) {
  const stack = [[0, -1]];
  while (stack.length) {
    const [start, from] = stack.pop(), pts = [], rad = [];
    if (from >= 0) { pts.push(nodes[from].p); rad.push(Math.min(nodes[from].r, nodes[start].r * 1.5)); }   // flared where it leaves its parent, no step
    else { const p0 = nodes[0].p; pts.push(V3(p0.x, -0.45, p0.z)); rad.push(nodes[0].r * 1.55); }
    let cur = start;
    for (;;) {
      const end = nodes[cur].ch.length !== 1;
      if (end || cur === start || pts[pts.length - 1].distanceTo(nodes[cur].p) >= step) { pts.push(nodes[cur].p); rad.push(nodes[cur].r); }
      if (end) break; cur = nodes[cur].ch[0];
    }
    const rmax = Math.max(...rad);
    if (pts.length >= 2 && rmax > minR) addTube(mb, pts, rad, Math.min(maxSegs, rmax > 0.18 ? 9 : rmax > 0.07 ? 6 : 4), barkCol, sway);
    for (const c of nodes[cur].ch) stack.push([c, cur]);
  }
}
