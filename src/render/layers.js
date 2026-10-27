// three.js layer assignments. Every object is on layer 0 (the main camera); these opt objects into extra passes.
export const SHADOW = 1;   // casts sun shadows (src/render/shadows.js)
export const REFLECT = 2;  // appears in lake reflections (src/render/reflection.js)
