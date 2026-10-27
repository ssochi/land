// The modelling toolkit: import Poly from here. Each module registers its tools on Poly when loaded; a new tool
// is a new module (or a function in one) that calls Poly.op / Poly.make, imported below. See docs/modeling.md.
export { Poly, V3 } from './mesh.js';
export { area2, rect2, circle2, fillet2 } from './primitives.js';
import './bevel.js';
import './subdivide.js';
import './faces.js';
import './deform.js';
export { bake, emit } from './output.js';
