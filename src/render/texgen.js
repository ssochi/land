// Texture baker: paints tileable material textures on the GPU once at startup — albedo + height in one pass,
// then a normal map and a cavity (ambient-occlusion) term derived from the heights — and keeps mipmaps.
// Materials sample these like authored game textures instead of evaluating noise per pixel: detail is drawn
// once with care (slabs, fractures, strokes, pebbles), it costs a texture fetch, and distant surfaces filter
// through the mip chain instead of shimmering.
//
// Every texture tiles: all noise and cell lattices are periodic over the [0,1] uv square.
import * as THREE from 'three';

const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

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

// normal (rgb) + cavity (a) from the height in alpha of tH
const NORMAL = /* glsl */`
uniform sampler2D tH; uniform float uTexel; uniform float uStrength;
float H(vec2 o) { return texture2D(tH, vUv + o * uTexel).a; }
void main(){
  float l = H(vec2(-1.0, 0.0)), r = H(vec2(1.0, 0.0)), d = H(vec2(0.0, -1.0)), u = H(vec2(0.0, 1.0)), c = H(vec2(0.0));
  vec3 n = normalize(vec3((l - r) * uStrength, (d - u) * uStrength, 1.0));
  float m = 0.0;
  for (int i = 0; i < 8; i++) { float a = float(i) * 0.785; m += H(vec2(cos(a), sin(a)) * 3.0) + H(vec2(cos(a + 0.39), sin(a + 0.39)) * 9.0); }
  float cav = clamp(0.62 + (c - m / 16.0) * 3.5, 0.0, 1.0);
  gl_FragColor = vec4(n * 0.5 + 0.5, cav);
}`;

const SPECS = { rock: [ROCK, 1024, 7.0], sward: [SWARD, 512, 4.0], dirt: [DIRT, 512, 5.0] };

// returns { rock: { albedo, normal }, sward: {…}, dirt: {…} } — textures that repeat and are mipmapped
export function bakeTextures(renderer) {
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false; scene.add(quad);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const target = size => {
    const rt = new THREE.WebGLRenderTarget(size, size, { depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping });
    rt.texture.anisotropy = aniso; return rt;
  };
  const draw = (fs, rt, uniforms = {}) => {
    quad.material = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: LIB + fs, uniforms, depthTest: false, depthWrite: false });
    const prev = renderer.getRenderTarget(); renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(prev);
    quad.material.dispose();
  };
  const out = {};
  for (const [name, [fs, size, strength]] of Object.entries(SPECS)) {
    const albedo = target(size), normal = target(size);
    draw(fs, albedo);
    draw(NORMAL, normal, { tH: { value: albedo.texture }, uTexel: { value: 1 / size }, uStrength: { value: strength } });
    out[name] = { albedo: albedo.texture, normal: normal.texture, targets: [albedo, normal] };
  }
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
