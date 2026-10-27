// Texture baker: paints tileable material textures on the GPU once at startup — albedo + height in one pass,
// then a normal map and a cavity (ambient-occlusion) term derived from the heights — and keeps mipmaps.
// Materials sample these like authored game textures instead of evaluating noise per pixel: detail is drawn
// once with care (slabs, fractures, strokes, pebbles), it costs a texture fetch, and distant surfaces filter
// through the mip chain instead of shimmering.
//
// Every texture tiles: all noise and cell lattices are periodic over the [0,1] uv square.
import * as THREE from 'three';

// uMap stretches the quad's uv (an atlas cell paints its tile plus a wrapped gutter around it)
const VS = `uniform vec2 uMap; varying vec2 vUv; void main(){ vUv = uv * uMap.x + uMap.y; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// periodic hash / value noise / fbm / voronoi (period `per` lattice cells across the tile)
const LIB = /* glsl */`
varying vec2 vUv;
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.103, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float pnoise(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  float a = h12(mod(i, per)), b = h12(mod(i + vec2(1.0, 0.0), per)), c = h12(mod(i + vec2(0.0, 1.0), per)), d = h12(mod(i + 1.0, per));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float pfbm(vec2 p, float per) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * pnoise(p, per); p *= 2.0; per *= 2.0; a *= 0.5; } return v; }
// x: distance to nearest site, y: second nearest, z: cell hash; rel = pixel − nearest site; id = nearest cell.
// per is the lattice period on each axis (cells across the tile), so cells can be stretched and still tile
vec3 pvoro(vec2 p, vec2 per, out vec2 rel, out vec2 id) {
  vec2 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0; rel = vec2(0.0); id = vec2(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)), c = mod(i + g, per), r = g + h22(c) * 0.9 + 0.05 - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; rel = -r; id = c; } else if (d < d2) d2 = d;
  }
  return vec3(sqrt(d1), sqrt(d2), h12(id + 17.3));
}
`;

// Rock: fractured slabs. Domain-warped voronoi cells are slabs, each tilted its own way and bevelled toward
// its edges; a finer voronoi splits them with hairline fractures; grain on top. Albedo is a light neutral
// stone (materials tint it per region) with darker cracks and worn, lighter edges.
const ROCK = /* glsl */`
void main(){
  vec2 uv = vUv;
  vec2 w = vec2(pfbm(uv * 3.0, 3.0), pfbm(uv * 3.0 + 7.3, 3.0)) - 0.5;
  vec2 q = uv + w * vec2(0.1, 0.18);
  // slabs taller than wide: on cliff faces (v = world up) they read as weathered fracture columns
  vec2 rel, id; vec3 v = pvoro(q * vec2(5.0, 3.0), vec2(5.0, 3.0), rel, id);
  vec2 dir = h22(id + 3.1) * 2.0 - 1.0;
  float gap = v.y - v.x, bevel = smoothstep(0.0, 0.4, gap);
  float slab = 0.5 + dot(rel, dir) * 0.6 + (h12(id + 5.0) - 0.5) * 0.3;
  float seen = smoothstep(0.3, 0.65, pnoise(q * 9.0 + 4.0, 9.0));             // fractures fade in and out along their length
  vec2 rel2, id2; vec3 v2 = pvoro(q * vec2(12.0, 7.0) + w * 2.0, vec2(12.0, 7.0), rel2, id2);
  float sub = 1.0 - smoothstep(0.0, 0.09, v2.y - v2.x);
  float lump = pfbm(uv * 7.0 + 2.0, 7.0), grain = pfbm(uv * 28.0, 28.0), fine = pnoise(uv * 112.0, 112.0);
  float h = slab * mix(mix(0.8, 0.3, seen), 1.0, bevel) + (lump - 0.5) * 0.5 - sub * 0.08 * bevel * seen + (grain - 0.5) * 0.16 + (fine - 0.5) * 0.04;
  float crack = (1.0 - smoothstep(0.0, 0.06, gap)) * seen;
  vec3 c = mix(vec3(0.66, 0.63, 0.6), vec3(0.88, 0.85, 0.8), v.z * 0.4 + lump * 0.6);
  c *= 1.0 - crack * 0.3;
  c *= 1.0 - sub * 0.1 * bevel * seen;
  c *= 1.0 + (1.0 - smoothstep(0.05, 0.22, gap)) * (1.0 - crack) * 0.08;    // worn, lighter slab edges
  c *= 0.9 + 0.2 * grain + (fine - 0.5) * 0.1;
  gl_FragColor = vec4(c, clamp(h, 0.0, 1.0));
}`;

// Sward seen from above: overlapping short blade strokes, painterly. Stored as modulation, not colour:
// r = brightness (≈1 on average), g = how far toward the sun-bleached tip colour, a = height.
const SWARD = /* glsl */`
void main(){
  const float N = 22.0;
  vec2 p = vUv * N;
  float top = -1.0, bright = 0.62, tipness = 0.15, h = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) for (int k = 0; k < 3; k++) {
    vec2 cell = mod(floor(p) + vec2(float(x), float(y)), N), base = floor(p) + vec2(float(x), float(y));
    vec2 r = h22(cell + float(k) * 13.7);
    vec2 c = base + r;
    float a = h12(cell + float(k) * 7.1) * 6.2831, len = 0.55 + h12(cell + float(k) * 3.3) * 0.75, wid = 0.1 + h12(cell + float(k) * 9.9) * 0.08;
    vec2 d = vec2(cos(a), sin(a)), o = p - c;
    float t = clamp(dot(o, d) / len + 0.5, 0.0, 1.0), dist = length(o - d * (t - 0.5) * len), wt = wid * (1.0 - t * 0.85);
    float cover = 1.0 - smoothstep(wt * 0.6, wt, dist);
    float order = h12(cell + float(k) * 21.1);
    if (cover > 0.5 && order > top) {
      top = order;
      bright = 0.78 + 0.45 * order + 0.15 * t;
      tipness = smoothstep(0.4, 1.0, t) * (0.4 + 0.6 * h12(cell + float(k) * 5.5));
      h = 0.35 + 0.55 * order * (1.0 - dist / wt * 0.5);
    }
  }
  float clump = pfbm(vUv * 5.0, 5.0);
  gl_FragColor = vec4(bright * (0.85 + 0.3 * clump) * 0.82, tipness, 0.0, h);
}`;

// Packed earth with pebbles: rounded voronoi stones of a few earth tones over gritty soil.
const DIRT = /* glsl */`
void main(){
  vec2 uv = vUv;
  vec2 w = vec2(pfbm(uv * 6.0, 6.0), pfbm(uv * 6.0 + 3.7, 6.0)) - 0.5;
  // a few half-buried stones (irregular voronoi cells, rounded), clods and grit in packed earth
  vec2 rel, id; vec3 v = pvoro(uv * 11.0 + w * 0.8, vec2(11.0), rel, id);
  float isP = step(0.78, h12(id + 9.0)), gap = v.y - v.x;
  float stone = isP * smoothstep(0.0, 0.25, gap - 0.12) , dome = isP * smoothstep(0.12, 0.5, gap);
  vec2 rel2, id2; vec3 v2 = pvoro(uv * 34.0, vec2(34.0), rel2, id2);
  float grit = smoothstep(0.28, 0.12, v2.x) * step(0.55, v2.z);
  vec2 rel3, id3; vec3 v3 = pvoro(uv * 5.0 + w, vec2(5.0), rel3, id3);
  float clod = 1.0 - smoothstep(0.0, 0.05, v3.y - v3.x);                       // faint dry cracks between clods
  float soil = pfbm(uv * 8.0, 8.0), fine = pnoise(uv * 128.0, 128.0);
  vec3 c = mix(vec3(0.47, 0.39, 0.3), vec3(0.62, 0.53, 0.41), soil) * (0.9 + 0.2 * fine) * (1.0 - clod * 0.12) * (0.92 + 0.08 * v3.z);
  vec3 pc = mix(vec3(0.5, 0.46, 0.4), vec3(0.64, 0.59, 0.51), h12(id + 4.0)) * (0.85 + 0.25 * dome);
  c = mix(c * (1.0 - isP * smoothstep(0.05, 0.12, gap) * 0.15), pc, stone);
  c = mix(c, vec3(0.66, 0.6, 0.51), grit * 0.35);
  float h = 0.35 + soil * 0.2 + stone * (0.12 + 0.3 * dome) - clod * 0.05 + grit * 0.06 + (fine - 0.5) * 0.05;
  gl_FragColor = vec4(c, h);
}`;

// Thatch: bundles of straw laid in courses down the roof (v runs down the slope): thin strands with their own
// tone, darker shadowed gaps between bundles, each course overlapping the one below.
const THATCH = /* glsl */`
void main(){
  vec2 uv = vUv;
  float course = fract(uv.y * 6.0 + pnoise(vec2(uv.x * 8.0, 0.0), 8.0) * 0.25), row = floor(uv.y * 6.0);
  float x = uv.x * 90.0 + pnoise(vec2(uv.x * 30.0, uv.y * 6.0), 30.0) * 3.0;
  float strand = pnoise(vec2(x, row * 3.1), 90.0), strand2 = pnoise(vec2(uv.x * 220.0, row * 7.7 + uv.y * 4.0), 220.0);
  float bundle = pnoise(vec2(uv.x * 14.0, row * 5.3), 14.0);
  float lap = smoothstep(0.0, 0.25, course) * (1.0 - smoothstep(0.85, 1.0, course) * 0.6);
  float h = 0.3 + 0.45 * lap + strand * 0.18 + strand2 * 0.08 + bundle * 0.12;
  vec3 c = mix(vec3(0.5, 0.4, 0.24), vec3(0.8, 0.68, 0.44), strand * 0.6 + bundle * 0.4);
  c = mix(c, vec3(0.42, 0.4, 0.3), smoothstep(0.6, 0.85, pfbm(uv * 4.0, 4.0)) * 0.45);     // weathered grey patches
  c *= mix(0.55, 1.0, lap) * (0.85 + 0.25 * strand2);
  gl_FragColor = vec4(c, h);
}`;

// Shingles: rows of split wooden shingles (v down the slope), staggered, each with its own tone and grain,
// a shadowed lower edge and thin gaps.
const SHINGLE = /* glsl */`
void main(){
  vec2 uv = vUv;
  float rows = 10.0, cols = 7.0, r = floor(uv.y * rows), fy = fract(uv.y * rows);
  float x = uv.x * cols + (mod(r, 2.0) * 0.5) + h12(vec2(r, 3.0)) * 0.3, cx = floor(x), fx = fract(x);
  float id = h12(vec2(mod(cx, cols), mod(r, rows)) + 1.7);
  float gap = smoothstep(0.0, 0.04, fx) * smoothstep(1.0, 0.96, fx);
  float grain = pnoise(vec2(uv.x * 160.0, uv.y * 12.0 + id * 9.0), 160.0);
  float lowEdge = smoothstep(1.0, 0.82, fy);                                       // thick butt end at the bottom
  float h = (0.35 + 0.5 * fy * lowEdge + grain * 0.06) * gap;
  vec3 c = mix(vec3(0.42, 0.33, 0.25), vec3(0.66, 0.54, 0.4), id) * (0.85 + 0.25 * grain);
  c *= mix(0.45, 1.0, gap) * mix(0.7, 1.0, smoothstep(0.0, 0.25, fy));
  gl_FragColor = vec4(c, h);
}`;

// Stucco: near-white so the vertex colour sets the wash (ochre, cream, peach); soft trowel mottling at a few
// scales, the faint sweep of the trowel and a fine sandy grain. No cracks: at Hateno's scale they read as dirt.
const PLASTER = /* glsl */`
void main(){
  vec2 uv = vUv;
  float m = pfbm(uv * 3.0, 3.0), f = pfbm(uv * 11.0 + 3.0, 11.0), g = pnoise(uv * 160.0, 160.0);
  float sweep = pnoise(vec2(uv.x * 7.0 + pnoise(uv * 5.0, 5.0) * 1.5, uv.y * 26.0), 7.0);     // trowel strokes
  float blot = smoothstep(0.58, 0.8, pfbm(uv * 6.0 + 7.0, 6.0));                             // damp, darker patches
  vec3 c = vec3(0.96, 0.95, 0.93) * (0.9 + 0.1 * m + 0.06 * f + (g - 0.5) * 0.05) * (0.97 + 0.04 * sweep);
  c *= 1.0 - blot * vec3(0.1, 0.11, 0.13);
  gl_FragColor = vec4(c, 0.5 + (f - 0.5) * 0.12 + (sweep - 0.5) * 0.05 + (g - 0.5) * 0.05);
}`;

// Clay roof tiles (v runs down the slope): staggered rows of flat terracotta tiles with rounded lower corners;
// each tile has its own fired colour, a lighter worn top and a thick shadowed lower edge over the row below,
// and the odd dark or mossy one.
const TILE = /* glsl */`
void main(){
  vec2 uv = vUv;
  float rows = 8.0, cols = 7.0, r = floor(uv.y * rows), fy = fract(uv.y * rows);
  float x = uv.x * cols + mod(r, 2.0) * 0.5, cx = floor(x), fx = fract(x);
  vec2 cell = vec2(mod(cx, cols), mod(r, rows));
  float id = h12(cell + 3.1), id2 = h12(cell + 9.7);
  // rounded bottom corners: distance into the tile from its sides and lower edge
  float rc = 0.22, ex = min(fx, 1.0 - fx) * 1.0, ey = (1.0 - fy) * cols / rows;
  float corner = length(max(vec2(rc) - vec2(ex, ey), 0.0));
  float inside = smoothstep(0.0, 0.035, min(ex, ey)) * (1.0 - smoothstep(rc - 0.03, rc, corner));
  float lowEdge = smoothstep(1.0, 0.86, fy);
  float grain = pnoise(uv * 96.0, 96.0), spot = pfbm(uv * 12.0 + id, 12.0);
  vec3 c = mix(vec3(0.66, 0.29, 0.19), vec3(0.8, 0.45, 0.27), id);
  c = mix(c, vec3(0.5, 0.25, 0.17), step(0.86, id2) * 0.7);                                   // dark, over-fired tiles
  c = mix(c, vec3(0.47, 0.47, 0.27), smoothstep(0.62, 0.8, spot) * step(0.6, id2) * 0.55);     // lichen
  c *= (0.88 + 0.2 * fy * lowEdge) * (0.92 + 0.12 * grain);
  c = mix(vec3(0.17, 0.08, 0.06), c, inside);                                                  // gaps between tiles
  float h = (0.3 + 0.55 * fy * lowEdge + grain * 0.04) * mix(0.25, 1.0, inside);
  gl_FragColor = vec4(c, h);
}`;

// Rubble stonework (house bases, tower feet, dry walls): irregular rounded stones of mixed size set in mortar,
// each with its own grey-beige tone, a domed face with grain, and recessed, shadowed joints. Near-neutral so the
// rock colour (m.env rock) and the vertex colour set the stone.
const RUBBLE = /* glsl */`
void main(){
  vec2 uv = vUv;
  vec2 w = vec2(pfbm(uv * 4.0, 4.0), pfbm(uv * 4.0 + 5.0, 4.0)) - 0.5;
  vec2 rel, id; vec3 v = pvoro(uv * vec2(6.0, 8.0) + w * 0.6, vec2(6.0, 8.0), rel, id);
  float edge = v.y - v.x;                                             // distance to the nearest joint
  float stone = smoothstep(0.02, 0.09, edge), dome = smoothstep(0.0, 0.5, edge);
  float tone = h12(id + 2.3), grain = pnoise(uv * 120.0, 120.0), mott = pfbm(uv * 18.0 + tone * 7.0, 18.0);
  vec3 c = mix(vec3(0.74, 0.71, 0.66), vec3(0.9, 0.88, 0.83), tone) * (0.88 + 0.14 * mott) * (0.94 + 0.08 * grain);
  c = mix(c, vec3(0.6, 0.62, 0.5), smoothstep(0.62, 0.8, pfbm(uv * 5.0 + 3.0, 5.0)) * 0.35);   // lichen
  c = mix(vec3(0.6, 0.57, 0.52), c, stone);                                                   // mortar
  float h = 0.15 + 0.55 * stone * (0.5 + 0.5 * dome) + grain * 0.04 + mott * 0.06;
  gl_FragColor = vec4(c, h);
}`;

// Planks: boards along u with grooves between them, stretched grain, the odd knot, per-board tone.
const WOOD = /* glsl */`
void main(){
  vec2 uv = vUv;
  float boards = 6.0, b = floor(uv.y * boards), fy = fract(uv.y * boards);
  float off = h12(vec2(b, 1.0)), x = uv.x + off;
  float id = h12(vec2(mod(b, boards), 2.0));
  float grain = pnoise(vec2(x * 6.0, uv.y * 120.0 + pnoise(vec2(x * 3.0, uv.y * 30.0), 30.0) * 4.0), 6.0);
  float fine = pnoise(vec2(x * 40.0, uv.y * 600.0), 40.0);
  vec2 kc = vec2(fract(x * 2.0 + id) - 0.5, (fy - 0.5) * 0.4); float knot = smoothstep(0.08, 0.0, length(kc)) * step(0.7, id);
  float groove = smoothstep(0.0, 0.06, fy) * smoothstep(1.0, 0.94, fy);
  vec3 c = mix(vec3(0.48, 0.36, 0.25), vec3(0.7, 0.56, 0.4), id * 0.6 + grain * 0.4) * (0.88 + 0.2 * fine);
  c = mix(c, vec3(0.3, 0.2, 0.13), knot * 0.8) * mix(0.5, 1.0, groove);
  gl_FragColor = vec4(c, (0.5 + grain * 0.1 + fine * 0.04 - knot * 0.1) * mix(0.3, 1.0, groove));
}`;

// normal (rgb) + cavity (a) from the height in alpha of tH; uRect maps the tile's uv into tH (an atlas cell)
const NORMAL = /* glsl */`
uniform sampler2D tH; uniform vec2 uTexel; uniform vec4 uRect; uniform float uStrength;
float H(vec2 o) { return texture2D(tH, uRect.xy + vUv * uRect.zw + o * uTexel).a; }
void main(){
  float l = H(vec2(-1.0, 0.0)), r = H(vec2(1.0, 0.0)), d = H(vec2(0.0, -1.0)), u = H(vec2(0.0, 1.0)), c = H(vec2(0.0));
  vec3 n = normalize(vec3((l - r) * uStrength, (d - u) * uStrength, 1.0));
  float m = 0.0;
  for (int i = 0; i < 8; i++) { float a = float(i) * 0.785; m += H(vec2(cos(a), sin(a)) * 3.0) + H(vec2(cos(a + 0.39), sin(a + 0.39)) * 9.0); }
  float cav = clamp(0.62 + (c - m / 16.0) * 3.5, 0.0, 1.0);
  gl_FragColor = vec4(n * 0.5 + 0.5, cav);
}`;

// terrain textures, each its own repeating texture: name: [painter, size, normal strength]
const SPECS = { rock: [ROCK, 1024, 7.0], sward: [SWARD, 512, 4.0], dirt: [DIRT, 512, 5.0] };

// Building materials share one atlas, so the prop shader needs two texture units for all of them instead of
// two each (many GPUs allow only 16 per shader; past that the whole material fails to compile). 4 × 2 cells
// of 512px; each tile fills the middle 448px with a 32px gutter of wrapped-around texture, so filtering near
// the tile edge reads the tile's own continuation. Building textures tile every 2m (uv scale in props.js).
export const ATLAS = { w: 2048, h: 1024, cols: 4, cell: 512, pad: 32, slots: { thatch: 0, shingle: 1, plaster: 2, wood: 3, tile: 4, rubble: 5 } };
const ATLAS_PAINT = { thatch: [THATCH, 6.0], shingle: [SHINGLE, 6.0], plaster: [PLASTER, 3.0], wood: [WOOD, 4.0], tile: [TILE, 7.0], rubble: [RUBBLE, 6.0] };

// returns { rock, sward, dirt, atlas: { albedo, normal, targets } } — repeating (terrain) and atlased (building)
// mipmapped textures
export function bakeTextures(renderer) {
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false; scene.add(quad);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const target = (w, h, wrap) => {
    const rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: wrap, wrapT: wrap });
    rt.texture.anisotropy = aniso; return rt;
  };
  // paint fs into rt (or into the cell [x, y, size] of it), uv mapped by uMap
  const draw = (fs, rt, uniforms = {}, cell = null, uMap = [1, 0]) => {
    quad.material = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: LIB + fs, uniforms: Object.assign({ uMap: { value: new THREE.Vector2(...uMap) } }, uniforms), depthTest: false, depthWrite: false });
    const prev = renderer.getRenderTarget(), clear = renderer.autoClear;
    if (cell) { rt.viewport.set(cell[0], cell[1], cell[2], cell[2]); renderer.autoClear = false; }   // a clear would wipe the other cells
    renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(prev);
    rt.viewport.set(0, 0, rt.width, rt.height); renderer.autoClear = clear;
    quad.material.dispose();
  };
  const out = {};
  for (const [name, [fs, size, strength]] of Object.entries(SPECS)) {
    const albedo = target(size, size, THREE.RepeatWrapping), normal = target(size, size, THREE.RepeatWrapping);
    draw(fs, albedo);
    draw(NORMAL, normal, { tH: { value: albedo.texture }, uTexel: { value: new THREE.Vector2(1 / size, 1 / size) }, uRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uStrength: { value: strength } });
    out[name] = { albedo: albedo.texture, normal: normal.texture, targets: [albedo, normal] };
  }
  const A = ATLAS, inner = A.cell - 2 * A.pad, g = A.pad / inner, map = [1 + 2 * g, -g];
  const albedo = target(A.w, A.h, THREE.ClampToEdgeWrapping), normal = target(A.w, A.h, THREE.ClampToEdgeWrapping);
  for (const [name, [fs, strength]] of Object.entries(ATLAS_PAINT)) {
    const k = A.slots[name], x = (k % A.cols) * A.cell, y = Math.floor(k / A.cols) * A.cell, cell = [x, y, A.cell];
    draw(fs, albedo, {}, cell, map);
    draw(NORMAL, normal, { tH: { value: albedo.texture }, uTexel: { value: new THREE.Vector2(1 / A.w, 1 / A.h) },
      uRect: { value: new THREE.Vector4((x + A.pad) / A.w, (y + A.pad) / A.h, inner / A.w, inner / A.h) }, uStrength: { value: strength * inner / A.cell } }, cell, map);
  }
  out.atlas = { albedo: albedo.texture, normal: normal.texture, targets: [albedo, normal] };
  quad.geometry.dispose();
  return out;
}

// read a baked texture back as a PNG data URL (debugging and agent inspection: mapEditor.debug.textures())
export function textureToDataURL(renderer, rt) {
  const w = rt.width, h = rt.height, px = new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const img = cv.getContext('2d').createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w * 4; x++) img.data[y * w * 4 + x] = (x & 3) === 3 ? 255 : px[(h - 1 - y) * w * 4 + x];
  cv.getContext('2d').putImageData(img, 0, 0);
  return cv.toDataURL('image/png');
}
