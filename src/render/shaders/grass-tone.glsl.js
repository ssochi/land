// Meadow colour shared by the grass blades and the ground under them, so a field reads as the same grass
// whether it is drawn as blades (near) or only as terrain colour (far, where the blades thin out).
// Needs uniforms uMid, uTipA, uTipB declared by the including shader.
export default /* glsl */`
// tufts: blades grow in clumps ~1m across; the ground uses the same field so distant mottling matches the blades
float grassClump(vec2 xz) { return vnoise(xz * 0.8 + 3.7) * 0.65 + vnoise(xz * 2.3 - 1.3) * 0.35; }
void grassTone(vec2 xz, out vec3 midc, out vec3 tip) {
  float pn = fbm(xz * 0.035), pn2 = vnoise(xz * 0.13 + 7.0), big = fbm(xz * 0.0075 + 13.0);
  tip = mix(uTipB, uTipA, smoothstep(0.35, 0.7, pn));
  tip = mix(tip, vec3(0.88, 0.8, 0.44), smoothstep(0.55, 0.72, big) * 0.5);       // sun-bleached drifts
  tip = mix(tip, vec3(0.55, 0.7, 0.4), smoothstep(0.45, 0.28, big) * 0.45);        // lusher hollows
  midc = mix(uMid * (0.86 + 0.28 * pn2), vec3(0.32, 0.5, 0.3), smoothstep(0.45, 0.28, big) * 0.55);
}
`;
