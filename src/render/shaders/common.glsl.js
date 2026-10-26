// GLSL prelude prepended to every scene material: shared uniforms, noise, wind gusts, cloud shadows,
// the toon-ish lighting model (sun + shadow map + horizon map + sky ambient) and height fog.
export default /* glsl */`
uniform float uTime; uniform float uWind; uniform vec2 uWindDir;
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uSkyAmb; uniform vec3 uGroundAmb;
uniform vec3 uFogColor; uniform vec3 uZenith; uniform float uFogDensity; uniform float uDebug;
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
  float s = 0.0;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
    s += step(p.z - 0.0004, texture2D(uShadowMap, p.xy + vec2(float(i), float(j)) * uShadowTexel * 1.25).r);
  }
  return mix(1.0, s / 9.0, edge);
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
  float diff = smoothstep(-0.12 + sharp * 0.12, 0.5 - sharp * 0.32, ndl);
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
  vec3 amb = mix(uGroundAmb, uSkyAmb, N.y * 0.5 + 0.5) * mix(0.5, 1.05, sv);
  return alb * (amb + uSunColor * diff * gShadow);
}
vec3 applyFog(vec3 c, vec3 wp) {
  vec3 dv = wp - cameraPosition; float d = length(dv);
  float hAvg = max(0.5 * (wp.y + cameraPosition.y), 0.0);
  float f = 1.0 - exp(-d * uFogDensity * exp(-hAvg / 170.0));
  float s = pow(max(dot(dv / d, uSunDir), 0.0), 6.0);
  vec3 fc = mix(uFogColor, mix(uFogColor, uZenith, 0.4), smoothstep(80.0, 950.0, d) * (1.0 - s * 0.8));
  fc = mix(fc, uSunColor * 0.92 + uFogColor * 0.2, s * 0.5);
  return mix(c, fc, f);
}
`;
