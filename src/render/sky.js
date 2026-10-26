// Sky dome: fog-to-zenith gradient, sun glow and disc, and drifting fbm clouds lit from the sun side.
// Writes alpha 0 so the post pass can tell sky from geometry (god rays).
import * as THREE from 'three';
import { mat } from './material.js';

const skyMat = mat(`varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`, `
varying vec3 vDir;
float fbm5(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){ v+=a*vnoise(p); p=p*2.07+vec2(11.3,3.9); a*=0.5; } return v; }
void main(){
  vec3 d = normalize(vDir); float e = d.y;
  vec3 col = mix(uFogColor, uZenith, pow(smoothstep(-0.02, 0.62, e), 0.75));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 4.0) * 0.16 * uGlare + pow(sd, 10.0) * 0.28 + pow(sd, 90.0) * 0.4);
  if (e > 0.0) {
    // scattered fair-weather cumulus: billowy base shape plus detail, lit on the side facing the sun
    vec2 uv = d.xz / (e + 0.09) * 1.5 + vec2(uTime * 0.02, uTime * 0.006);
    float detail = fbm5(uv * 2.1 + 4.0);
    float raw = fbm5(uv * 0.5) * 0.72 + detail * 0.28;
    float th = mix(0.66, 0.44, uCloudCover);
    float cov = smoothstep(th, th + 0.07, raw) * smoothstep(0.015, 0.14, e);
    float toward = fbm5((uv + uSunDir.xz * 0.35) * 0.5) * 0.72 + detail * 0.28;
    float lit = smoothstep(0.2, 0.8, clamp(0.6 + (raw - toward) * 6.0, 0.0, 1.0));
    vec3 shade = mix(mix(uZenith, uFogColor, 0.6) * 0.86 + 0.1, uFogColor, smoothstep(0.25, 0.0, e) * 0.5);
    vec3 cc = mix(shade, mix(vec3(1.0), uSunColor, 0.3) * 1.08, lit);
    cc += uSunColor * pow(sd, 8.0) * 0.5 * (1.0 - smoothstep(th, th + 0.25, raw));
    col = mix(col, cc, cov * 0.97);
  }
  col += uSunColor * smoothstep(0.9993, 0.9997, sd) * 0.9;
  gl_FragColor = vec4(col, 0.0);
}`, null, { side: THREE.BackSide, depthWrite: false });

export function createSky(scene) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), skyMat);
  sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);
  return sky;
}
