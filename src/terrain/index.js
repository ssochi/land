// Terrain op table, keyed by schema op name.
import { noise, mountains, peak, hill, flatten, plateau, terrace, smoothOp } from './shape.js';
import { erode, thermal } from './erosion.js';

export { apply } from './shape.js';
export const TERRAIN = { noise, mountains, peak, hill, flatten, plateau, terrace, smooth: smoothOp, erode, thermal };
