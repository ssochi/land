// GLSL prelude prepended to every scene material: shared uniforms, noise, wind gusts, cloud shadows,
// the toon-ish lighting model (sun + shadow map + horizon map + sky ambient) and height fog.
export default /* glsl */`
uniform float uTime; uniform float uWind; uniform vec2 uWindDir;
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uSkyAmb; uniform vec3 uGroundAmb;
uniform vec3 uFogColor; uniform vec3 uZenith; uniform float uFogDensity; uniform float uDebug;
uniform float uHazeFar; uniform vec3 uVFog; uniform float uCloudCover; uniform float uGlare; uniform float uNight;
uniform vec4 uPL[12]; uniform vec3 uPLColor; uniform float uToon; uniform vec3 uShadeTint;
uniform sampler2D uShadowMap; uniform mat4 uShadowMatrix; uniform float uShadowOn; uniform float uShadowTexel;
uniform sampler2D uHz0; uniform sampler2D uHz1; uniform sampler2D uHzAO; uniform vec2 uHzMin; uniform float uHzSize;
uniform vec4 uMA0; uniform vec4 uMA1; uniform vec4 uMB0; uniform vec4 uMB1; uniform float uHzW; uniform float uSunTan; uniform float uHzOn;
float gShadow = 1.0;
float shadowAt(vec3 wp, vec3 N) {
  if (uShadowOn < 0.5) return 1.0;
  vec4 sc = uShadowMatrix * vec4(wp + N * 0.12, 1.0);
  vec3 p = sc.xyz * 0.5 + 0.5;
  if (p.x <= 0.0 || p.y <= 0.0 || p.x >= 1.0 || p.y >= 1.0 || p.z >= 1.0) return 1.0;
  float edge = smoothstep(0.0, 0.1, min(min(p.x, p.y), min(1.0 - p.x, 1.0 - p.y)));
  // a 3-texel box over bilinearly weighted depth tests (4 × 4 texel centres, the outer ones weighted by how far
  // the point sits between centres): smooth shadow edges instead of the stair steps of a grid of hard tests,
  // which show wherever a shadow falls along a wall at a grazing angle
  vec2 t = p.xy / uShadowTexel - 0.5, f = fract(t), b = (floor(t) - 0.5) * uShadowTexel;
  float s = 0.0;
  for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) {
    float wx = i == 0 ? 1.0 - f.x : i == 3 ? f.x : 1.0, wy = j == 0 ? 1.0 - f.y : j == 3 ? f.y : 1.0;
    s += wx * wy * step(p.z - 0.0004, texture2D(uShadowMap, b + (vec2(float(i), float(j)) + 0.5) * uShadowTexel).r);
  }
  return mix(1.0, s / 9.0, edge);
}
// LOD cross-fade (src/render/props.js): while a model swaps level, both levels are drawn for a moment and
// split the screen's pixels between them by a dither threshold, the old one dissolving as the new one fills
// in. fade 0: drawn whole; h in (0, 1): the outgoing level, gone where the dither < h; −h: the incoming one,
// there only where the dither < h — together every pixel is drawn exactly once. Interleaved gradient noise
// (Jimenez) spreads the kept pixels evenly, so mid-fade reads as a blend rather than a pattern.
bool lodClip(float fade, vec2 px) {
  if (fade == 0.0) return false;
  float d = fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715))));
  return fade > 0.0 ? d < fade : d >= -fade;
}
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y); }
vec3 vnoiseD(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);
  float a = hash12(i), b = hash12(i + vec2(1.0, 0.0)), c = hash12(i + vec2(0.0, 1.0)), d = hash12(i + vec2(1.0, 1.0)), k = a - b - c + d;
  return vec3(a + (b - a) * u.x + (c - a) * u.y + k * u.x * u.y, du.x * ((b - a) + k * u.y), du.y * ((c - a) + k * u.x));
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; } return v; }
float gustAt(vec2 xz) { vec2 w = xz * 0.042 - uWindDir * uTime * (0.7 + uWind * 1.5); return smoothstep(0.4, 0.82, vnoise(w) * 0.62 + vnoise(w * 2.4 + 3.1) * 0.38); }
float cloudShadow(vec2 xz) { float c = fbm(xz * 0.0085 + uWindDir * uTime * 0.018 + vec2(3.7, 1.3)); return 1.0 - 0.45 * smoothstep(0.52, 0.68, c); }
vec3 lighting(vec3 alb, vec3 N, vec3 wp, float sharp) {
  float ndl = dot(N, uSunDir);
  // a soft terminator (the stylised look) blended with a wrapped Lambert falloff, so gentle slopes still
  // read as lit vs turned-away instead of all saturating to full sun
  float diff = smoothstep(-0.12 + sharp * 0.12, 0.5 - sharp * 0.32, ndl) * mix(0.7, 1.0, smoothstep(0.0, 0.8, ndl));
  float ts = 1.0, sv = 1.0;
  if (uHzOn > 0.5) {
    vec2 huv = (wp.xz - uHzMin) / uHzSize;
    if (huv.x > 0.0 && huv.y > 0.0 && huv.x < 1.0 && huv.y < 1.0) {
      vec4 ha = texture2D(uHz0, huv), hb = texture2D(uHz1, huv);
      float hz = mix(dot(ha, uMA0) + dot(hb, uMA1), dot(ha, uMB0) + dot(hb, uMB1), uHzW);
      ts = smoothstep(hz - 0.05, hz + 0.03, uSunTan);
      sv = texture2D(uHzAO, huv).r;
    }
  }
  gShadow = shadowAt(wp, N) * cloudShadow(wp.xz) * ts;
  vec3 amb = (mix(uGroundAmb, uSkyAmb, N.y * 0.5 + 0.5) * 1.18 + uGroundAmb * 0.35 * (1.0 - abs(N.y))) * mix(0.6, 1.05, sv);
  // warm pools of light around lanterns after dusk (soft wrap so the ground and walls both catch it)
  vec3 pl = vec3(0.0);
  if (uNight > 0.01) for (int i = 0; i < 12; i++) {
    if (uPL[i].w <= 0.0) continue;
    vec3 L = uPL[i].xyz - wp; float d = length(L), att = max(0.0, 1.0 - d / uPL[i].w);
    pl += uPLColor * att * att * (max(dot(N, L / max(d, 1e-3)), 0.0) * 0.75 + 0.25);
  }
  // toon (m.env toon, 0–1), the anime / BotW look: the light falls in one soft-edged band instead of a long
  // gradient, over a shade that is lifted (ambient up, sun down a little: same exposure, less contrast), keeps
  // and deepens the surface's own hue (a yellow wall shades to warm ochre, not olive) and leans cool. Fades
  // out at night, where the lanterns light the scene.
  float L = diff * gShadow, t = uToon * (1.0 - uNight);
  float lit = mix(L, smoothstep(0.2, 0.5, L) * 0.82 + L * 0.18, t);
  vec3 ambT = amb * (1.0 + 0.75 * t);
  float lum = dot(alb, vec3(0.299, 0.587, 0.114));
  vec3 shade = mix(alb, max(mix(vec3(lum), alb, 1.35), 0.0), t * 0.7) * ambT * mix(vec3(1.0), uShadeTint, t);
  return mix(shade, alb * (ambT + uSunColor * (1.0 - 0.3 * t)), lit) + alb * pl * uNight;
}
// height fog + aerial perspective (distant land collapses into a flat haze-coloured silhouette)
// + an optional valley-fog layer below uVFog.x (thickness uVFog.y, density uVFog.z) broken into drifting banks
vec3 applyFog(vec3 c, vec3 wp) {
  vec3 dv = wp - cameraPosition; float d = length(dv);
  float hAvg = max(0.5 * (wp.y + cameraPosition.y), 0.0);
  float f = 1.0 - exp(-d * uFogDensity * exp(-hAvg / 260.0));
  f = 1.0 - (1.0 - f) * (1.0 - uHazeFar * smoothstep(200.0, 1600.0, d));
  float s = pow(max(dot(dv / d, uSunDir), 0.0), 6.0);
  // distant land takes a deeper sky blue rather than washing out to the pale horizon colour
  vec3 fc = mix(uFogColor, mix(uFogColor, uZenith, 0.5) * 0.9, smoothstep(80.0, 950.0, d) * (1.0 - s * 0.8));
  fc = mix(fc, uSunColor * 0.92 + uFogColor * 0.2, s * 0.5);
  c = mix(c, fc, f);
  if (uVFog.z > 0.0) {
    float H = uVFog.y, dy = dv.y;
    float k = abs(dy) > 0.05 ? (1.0 - exp(-dy / H)) / (dy / H) : 1.0;
    float od = min(uVFog.z * d * exp(-(cameraPosition.y - uVFog.x) / H) * k, 8.0);
    vec2 q = wp.xz * 0.006 + uWindDir * uTime * 0.012;
    float bank = smoothstep(0.3, 0.7, vnoise(q) * 0.65 + vnoise(q * 2.7 + 5.2) * 0.35);
    float fv = 1.0 - exp(-od * (0.1 + 0.9 * bank));
    vec3 mist = mix(uFogColor, vec3(1.0), 0.3) * (0.85 + 0.25 * max(uSunDir.y, 0.0)) + uSunColor * s * 0.35;
    c = mix(c, mist, fv);
  }
  return c;
}
`;
