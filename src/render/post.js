// Post: ambient occlusion, outlines, bloom, screen-space god rays toward the sun, highlight shoulder, split-tone grade
// and vignette.
// Scene alpha: 0 sky, 0.5 grass (no outline), 1 everything else.
import * as THREE from 'three';
import { clamp, smooth } from '../core/math.js';
import { isSmall } from '../platform.js';
import { U } from './uniforms.js';
import { A2C } from './props.js';

// three.js backs a render target's depth with a 16-bit renderbuffer unless a depth texture is attached: at the
// 0.2–4000m camera range that is ~1m of depth resolution at 100m, and distant canopies and pine tiers z-fight
// (shimmer) as the camera moves. An UnsignedInt depth texture gets a 24-bit buffer, multisampled or not.
export function depth24(renderer) {
  if (!renderer.capabilities.isWebGL2 && !renderer.extensions.has('WEBGL_depth_texture')) return null;
  const d = new THREE.DepthTexture(4, 4); d.type = THREE.UnsignedIntType; return d;
}

export function createPost(renderer, scene, camera) {
  const gl2 = renderer.capabilities.isWebGL2;
  const type = gl2 ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const rtScene = new THREE.WebGLRenderTarget(4, 4, { type, samples: gl2 && !isSmall ? 4 : 0 });
  rtScene.depthTexture = depth24(renderer);
  A2C.value = rtScene.samples > 0 ? 1 : 0;
  const rtA = new THREE.WebGLRenderTarget(4, 4, { type, depthBuffer: false }), rtB = new THREE.WebGLRenderTarget(4, 4, { type, depthBuffer: false }), rtC = new THREE.WebGLRenderTarget(4, 4, { type, depthBuffer: false });
  const rtAO = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false }), rtAO2 = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false });
  const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), qScene = new THREE.Scene(), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false; qScene.add(quad);
  const vs = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
  const M = (fs, uniforms) => new THREE.ShaderMaterial({ uniforms, vertexShader: vs, fragmentShader: fs, depthTest: false, depthWrite: false });
  const bright = M(`uniform sampler2D tSrc; varying vec2 vUv;
void main(){ vec3 c = texture2D(tSrc, vUv).rgb; float l = dot(c, vec3(0.299, 0.587, 0.114)); gl_FragColor = vec4(c * smoothstep(1.0, 1.55, l), 1.0); }`, { tSrc: { value: null } });
  const blur = M(`uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
void main(){ vec3 s = texture2D(tSrc, vUv).rgb * 0.227;
  s += (texture2D(tSrc, vUv + uDir * 1.385).rgb + texture2D(tSrc, vUv - uDir * 1.385).rgb) * 0.316;
  s += (texture2D(tSrc, vUv + uDir * 3.231).rgb + texture2D(tSrc, vUv - uDir * 3.231).rgb) * 0.070;
  gl_FragColor = vec4(s, 1.0); }`, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
  // Ambient occlusion (m.env ao), at half resolution: what grounds things — the dark under the eaves, where a wall meets
  // the grass, around a barrel's foot, between houses. Scalable-ambient-obscurance style: each pixel's view-space
  // position and normal come from the depth buffer (the normal from the neighbour on the nearer side, so silhouettes
  // do not smear it); 12 taps on a spiral over a disc of uRadius metres projected to the screen, rotated per pixel,
  // each occluding by how far it rises over the tangent plane, falling off with distance. Grass (scene alpha 0.5)
  // takes occlusion but casts none (its blades would grey every meadow); the sky gets none.
  const LIN = `uniform vec2 uNF; float linZ(float d) { return uNF.x * uNF.y / (uNF.y - d * (uNF.y - uNF.x)); }`;
  const ao = M(`uniform sampler2D tDepth; uniform sampler2D tScene; uniform vec2 uTan; uniform vec2 uRes; uniform float uRadius; varying vec2 vUv;
${LIN}
vec3 viewPos(vec2 uv) { float z = linZ(texture2D(tDepth, uv).r); return vec3((uv * 2.0 - 1.0) * uTan * z, -z); }
void main(){
  if (texture2D(tDepth, vUv).r >= 0.99999 || texture2D(tScene, vUv).a < 0.25) { gl_FragColor = vec4(1.0); return; }
  // the normal over a 3-pixel baseline: depth steps over a single pixel are coarse enough to tilt it, and on a wall
  // seen at a slant every step is a vertical contour, which came out as stripes of false occlusion
  vec2 px = 1.0 / uRes, q = 3.0 * px;
  vec3 P = viewPos(vUv), pr = viewPos(vUv + vec2(q.x, 0.0)), pl = viewPos(vUv - vec2(q.x, 0.0)), pu = viewPos(vUv + vec2(0.0, q.y)), pd = viewPos(vUv - vec2(0.0, q.y));
  vec3 dx = abs(pr.z - P.z) < abs(P.z - pl.z) ? pr - P : P - pl, dy = abs(pu.z - P.z) < abs(P.z - pd.z) ? pu - P : P - pd;
  vec3 N = normalize(cross(dx, dy));
  float z = -P.z, rpx = clamp(uRadius * uRes.y / (2.0 * uTan.y * z), 1.5, 90.0);
  float ang = 6.2831 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))), occ = 0.0;
  for (int i = 0; i < 12; i++) {
    float t = (float(i) + 0.5) / 12.0, a = ang + float(i) * 2.3998;   // golden-angle spiral
    vec2 uv = vUv + vec2(cos(a), sin(a)) * sqrt(t) * rpx * px;
    if (texture2D(tScene, uv).a < 0.75) continue;
    vec3 v = viewPos(uv) - P; float vv = dot(v, v);
    occ += max(0.0, dot(v, N) - 0.02 * z - 0.02) / (vv + 0.02) * max(0.0, 1.0 - vv / (uRadius * uRadius));
  }
  float k = clamp(1.0 - occ * uRadius / 12.0 * 2.8, 0.0, 1.0);
  gl_FragColor = vec4(vec3(mix(k, 1.0, smoothstep(80.0, 160.0, z))), 1.0);
}`, { tDepth: { value: rtScene.depthTexture }, tScene: { value: null }, uNF: { value: new THREE.Vector2(0.2, 4000) }, uTan: { value: new THREE.Vector2() }, uRes: { value: new THREE.Vector2() }, uRadius: { value: 1.4 } });
  // depth-aware blur of the occlusion: neighbours at a very different depth (another object) do not mix in
  const aoBlur = M(`uniform sampler2D tSrc; uniform sampler2D tDepth; uniform vec2 uDir; varying vec2 vUv;
${LIN}
void main(){
  float z0 = linZ(texture2D(tDepth, vUv).r), s = 0.0, w = 0.0;
  for (int i = -4; i <= 4; i++) {
    vec2 uv = vUv + uDir * float(i);
    float wt = exp(-float(i * i) / 10.0) * exp(-abs(linZ(texture2D(tDepth, uv).r) - z0) / (0.03 * z0 + 0.05));
    s += texture2D(tSrc, uv).r * wt; w += wt;
  }
  gl_FragColor = vec4(vec3(s / max(w, 1e-4)), 1.0);
}`, { tSrc: { value: null }, tDepth: { value: rtScene.depthTexture }, uNF: { value: new THREE.Vector2(0.2, 4000) }, uDir: { value: new THREE.Vector2() } });
  // radial march toward the sun over sky pixels (alpha 0) that are bright
  const rays = M(`uniform sampler2D tSrc; uniform vec2 uSun; varying vec2 vUv;
void main(){ vec2 d = (uSun - vUv) / 40.0, uv = vUv; float illum = 1.0, sum = 0.0;
  for (int i = 0; i < 40; i++) { uv += d; vec4 sm = texture2D(tSrc, clamp(uv, 0.0, 1.0)); sum += step(sm.a, 0.25) * smoothstep(0.85, 1.25, dot(sm.rgb, vec3(0.333))) * illum; illum *= 0.965; }
  gl_FragColor = vec4(vec3(sum / 40.0), 1.0); }`, { tSrc: { value: null }, uSun: { value: new THREE.Vector2() } });
  // uGlare: sun colour x strength x facing; the veil is scaled by how much sky is visible right at the sun
  const comp = M(`uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tRays; uniform vec3 uRay; uniform float uBloom;
uniform vec3 uGlare; uniform vec2 uSunUV; uniform float uAspect; varying vec2 vUv;
uniform sampler2D tDepth; uniform vec2 uNF; uniform vec2 uPx; uniform float uOutline; uniform float uToon; uniform sampler2D tAO; uniform float uAO;
float linZ(float d) { return uNF.x * uNF.y / (uNF.y - d * (uNF.y - uNF.x)); }
// outlines (m.env outline), the drawn-line half of the anime look: a pixel whose neighbour lies well behind it
// (a jump of more than ~5% of its distance, or the sky) is on a silhouette, and takes a darker, slightly cool
// version of its own colour, so lines follow the forms' hues instead of being black ink. Grass is skipped
// (scene alpha 0.5), and lines fade out by 160m, where they would only add noise.
vec3 outline(vec3 c) {
  vec4 s0 = texture2D(tScene, vUv);
  if (uOutline <= 0.0 || s0.a < 0.75) return c;
  float z0 = linZ(texture2D(tDepth, vUv).r), th = max(0.3, 0.05 * z0), e = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 o = i == 0 ? vec2(uPx.x, 0.0) : i == 1 ? vec2(-uPx.x, 0.0) : i == 2 ? vec2(0.0, uPx.y) : vec2(0.0, -uPx.y);
    e = max(e, smoothstep(th, th * 2.0, linZ(texture2D(tDepth, vUv + o).r) - z0));
  }
  return mix(c, c * vec3(0.5, 0.47, 0.55), e * uOutline * (1.0 - smoothstep(60.0, 160.0, z0)));
}
// soft highlight roll-off from 0.7, on the brightest channel with the others scaled alike, so a sunlit cream wall or
// peach roof keeps its hue instead of being squeezed toward white channel by channel; only the very brightest (the
// sun's glare, specular) drift to white
vec3 shoulder(vec3 c){
  float m = max(max(c.r, c.g), c.b);
  if (m <= 0.7) return c;
  float k = 0.7 + 0.3 * (1.0 - exp(-(m - 0.7) / 0.3));
  return mix(c * (k / m), vec3(k), smoothstep(0.95, 1.9, m) * 0.75);
}
void main(){
  // occlusion bites most where the light is open sky and sun (a cast shadow is already dark: darkening it again
  // would crush the lifted shade the toon look keeps)
  vec3 sc = texture2D(tScene, vUv).rgb;
  sc *= mix(1.0, texture2D(tAO, vUv).r, uAO * (0.35 + 0.65 * smoothstep(0.08, 0.45, dot(sc, vec3(0.299, 0.587, 0.114)))));
  vec3 c = outline(sc) + texture2D(tBloom, vUv).rgb * uBloom + texture2D(tRays, vUv).rgb * uRay;
  if (uGlare.r + uGlare.g + uGlare.b > 0.001) {
    float vis = 0.0;
    for (int i = 0; i < 5; i++) { float a = float(i) * 1.2566; vis += step(texture2D(tScene, clamp(uSunUV + vec2(cos(a), sin(a)) * 0.012 * float(i > 0), 0.002, 0.998)).a, 0.25); }
    vec2 dd = (vUv - uSunUV) * vec2(uAspect, 1.0); float r2 = dot(dd, dd);
    c += uGlare * (vis / 5.0) * (exp(-r2 * 5.0) * 0.32 + exp(-r2 * 45.0) * 0.45);
  }
  c = shoulder(max(c, 0.0));
  c = c * (1.0 - 0.09 * uToon) + vec3(0.075, 0.082, 0.09) * uToon;   // toon: lifted, slightly cool blacks, as in BotW's airy frames
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, 0.97 + 0.1 * uToon);   // toon: a touch more colour, so the lifted blacks do not wash it out
  c = mix(c * vec3(0.93, 0.98, 1.07), c, smoothstep(0.05, 0.5, l));
  c = mix(c, c * vec3(1.04, 1.0, 0.93), smoothstep(0.6, 1.0, l));
  vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * 0.42;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`, { tScene: { value: null }, tBloom: { value: null }, tRays: { value: null }, uRay: { value: new THREE.Vector3() }, uBloom: { value: 0.28 },
    uGlare: { value: new THREE.Vector3() }, uSunUV: { value: new THREE.Vector2() }, uAspect: { value: 1 },
    tDepth: { value: rtScene.depthTexture }, uNF: { value: new THREE.Vector2(0.2, 4000) }, uPx: { value: new THREE.Vector2() }, uOutline: { value: 0 }, uToon: U.uToon,
    tAO: { value: rtAO.texture }, uAO: { value: 0 } });
  const size = new THREE.Vector2(), sunScreen = new THREE.Vector3(), camDir = new THREE.Vector3();
  function resize() {
    renderer.getDrawingBufferSize(size);
    rtScene.setSize(size.x, size.y);
    rtAO.setSize(Math.max(1, size.x >> 1), Math.max(1, size.y >> 1)); rtAO2.setSize(Math.max(1, size.x >> 1), Math.max(1, size.y >> 1));
    rtA.setSize(Math.max(1, size.x >> 2), Math.max(1, size.y >> 2)); rtB.setSize(Math.max(1, size.x >> 2), Math.max(1, size.y >> 2)); rtC.setSize(Math.max(1, size.x >> 2), Math.max(1, size.y >> 2));
  }
  function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(qScene, qCam); }
  function render() {
    renderer.setRenderTarget(rtScene); renderer.render(scene, camera);
    const aoOn = rtScene.depthTexture && U.uAO.value > 0.001 && !isSmall;   // phones skip it (two extra half-size passes)
    comp.uniforms.uAO.value = aoOn ? U.uAO.value : 0;
    if (aoOn) {
      const t = Math.tan(camera.fov * Math.PI / 360);
      ao.uniforms.uNF.value.set(camera.near, camera.far); aoBlur.uniforms.uNF.value.set(camera.near, camera.far);
      ao.uniforms.uTan.value.set(t * camera.aspect, t); ao.uniforms.uRes.value.set(rtAO.width, rtAO.height); ao.uniforms.tScene.value = rtScene.texture;
      pass(ao, rtAO);
      aoBlur.uniforms.tSrc.value = rtAO.texture; aoBlur.uniforms.uDir.value.set(1 / rtAO.width, 0); pass(aoBlur, rtAO2);
      aoBlur.uniforms.tSrc.value = rtAO2.texture; aoBlur.uniforms.uDir.value.set(0, 1 / rtAO.height); pass(aoBlur, rtAO);
    }
    bright.uniforms.tSrc.value = rtScene.texture; pass(bright, rtA);
    for (let i = 0; i < 2; i++) {
      blur.uniforms.tSrc.value = rtA.texture; blur.uniforms.uDir.value.set((1 + i * 1.5) / rtA.width, 0); pass(blur, rtB);
      blur.uniforms.tSrc.value = rtB.texture; blur.uniforms.uDir.value.set(0, (1 + i * 1.5) / rtA.height); pass(blur, rtA);
    }
    const sp = sunScreen.copy(U.uSunDir.value).multiplyScalar(1000).add(camera.position).project(camera);
    camera.getWorldDirection(camDir);
    const facing = camDir.dot(U.uSunDir.value), edge = Math.max(Math.abs(sp.x), Math.abs(sp.y));
    const k = facing > 0 ? smooth(0.0, 0.5, facing) * smooth(1.8, 0.9, edge) * (1 - smooth(0.55, 1.15, Math.asin(clamp(U.uSunDir.value.y, -1, 1)))) * 0.85 : 0;
    if (k > 0.001) { rays.uniforms.tSrc.value = rtScene.texture; rays.uniforms.uSun.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5); pass(rays, rtC); }
    comp.uniforms.uRay.value.set(U.uSunColor.value.r * k, U.uSunColor.value.g * k, U.uSunColor.value.b * k);
    const g = facing > 0 ? smooth(0.0, 0.6, facing) * smooth(2.2, 1.0, edge) * U.uGlare.value : 0;
    comp.uniforms.uGlare.value.set(U.uSunColor.value.r * g, U.uSunColor.value.g * g, U.uSunColor.value.b * g);
    comp.uniforms.uSunUV.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5); comp.uniforms.uAspect.value = size.x / size.y;
    // lines about a pixel wide at 900px tall, scaling with the resolution
    const w = Math.max(1, size.y / 900);
    comp.uniforms.uOutline.value = rtScene.depthTexture ? U.uOutline.value : 0; comp.uniforms.uNF.value.set(camera.near, camera.far); comp.uniforms.uPx.value.set(w / size.x, w / size.y);
    comp.uniforms.tScene.value = rtScene.texture; comp.uniforms.tBloom.value = rtA.texture; comp.uniforms.tRays.value = rtC.texture; pass(comp, null);
  }
  resize();
  return { resize, render };
}
