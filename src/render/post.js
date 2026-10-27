// Post: outlines, bloom, screen-space god rays toward the sun, highlight shoulder, split-tone grade and vignette.
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
  // radial march toward the sun over sky pixels (alpha 0) that are bright
  const rays = M(`uniform sampler2D tSrc; uniform vec2 uSun; varying vec2 vUv;
void main(){ vec2 d = (uSun - vUv) / 40.0, uv = vUv; float illum = 1.0, sum = 0.0;
  for (int i = 0; i < 40; i++) { uv += d; vec4 sm = texture2D(tSrc, clamp(uv, 0.0, 1.0)); sum += step(sm.a, 0.25) * smoothstep(0.85, 1.25, dot(sm.rgb, vec3(0.333))) * illum; illum *= 0.965; }
  gl_FragColor = vec4(vec3(sum / 40.0), 1.0); }`, { tSrc: { value: null }, uSun: { value: new THREE.Vector2() } });
  // uGlare: sun colour x strength x facing; the veil is scaled by how much sky is visible right at the sun
  const comp = M(`uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tRays; uniform vec3 uRay; uniform float uBloom;
uniform vec3 uGlare; uniform vec2 uSunUV; uniform float uAspect; varying vec2 vUv;
uniform sampler2D tDepth; uniform vec2 uNF; uniform vec2 uPx; uniform float uOutline; uniform float uToon;
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
// soft highlight roll-off from 0.7: skies and sunlit tops keep their colour instead of clipping to white
vec3 shoulder(vec3 c){ vec3 k = 0.7 + 0.3 * (1.0 - exp(-(c - 0.7) / 0.3)); return mix(c, k, step(0.7, c)); }
void main(){
  vec3 c = outline(texture2D(tScene, vUv).rgb) + texture2D(tBloom, vUv).rgb * uBloom + texture2D(tRays, vUv).rgb * uRay;
  if (uGlare.r + uGlare.g + uGlare.b > 0.001) {
    float vis = 0.0;
    for (int i = 0; i < 5; i++) { float a = float(i) * 1.2566; vis += step(texture2D(tScene, clamp(uSunUV + vec2(cos(a), sin(a)) * 0.012 * float(i > 0), 0.002, 0.998)).a, 0.25); }
    vec2 dd = (vUv - uSunUV) * vec2(uAspect, 1.0); float r2 = dot(dd, dd);
    c += uGlare * (vis / 5.0) * (exp(-r2 * 5.0) * 0.32 + exp(-r2 * 45.0) * 0.45);
  }
  c = shoulder(max(c, 0.0));
  c = c * (1.0 - 0.07 * uToon) + vec3(0.06, 0.065, 0.075) * uToon;   // toon: lifted, slightly cool blacks, as in BotW's airy frames
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, 0.97 + 0.1 * uToon);   // toon: a touch more colour, so the lifted blacks do not wash it out
  c = mix(c * vec3(0.93, 0.98, 1.07), c, smoothstep(0.05, 0.5, l));
  c = mix(c, c * vec3(1.04, 1.0, 0.93), smoothstep(0.6, 1.0, l));
  vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * 0.42;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`, { tScene: { value: null }, tBloom: { value: null }, tRays: { value: null }, uRay: { value: new THREE.Vector3() }, uBloom: { value: 0.28 },
    uGlare: { value: new THREE.Vector3() }, uSunUV: { value: new THREE.Vector2() }, uAspect: { value: 1 },
    tDepth: { value: rtScene.depthTexture }, uNF: { value: new THREE.Vector2(0.2, 4000) }, uPx: { value: new THREE.Vector2() }, uOutline: { value: 0 }, uToon: U.uToon });
  const size = new THREE.Vector2(), sunScreen = new THREE.Vector3(), camDir = new THREE.Vector3();
  function resize() {
    renderer.getDrawingBufferSize(size);
    rtScene.setSize(size.x, size.y);
    rtA.setSize(Math.max(1, size.x >> 2), Math.max(1, size.y >> 2)); rtB.setSize(Math.max(1, size.x >> 2), Math.max(1, size.y >> 2)); rtC.setSize(Math.max(1, size.x >> 2), Math.max(1, size.y >> 2));
  }
  function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(qScene, qCam); }
  function render() {
    renderer.setRenderTarget(rtScene); renderer.render(scene, camera);
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
