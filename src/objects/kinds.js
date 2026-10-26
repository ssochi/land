// Model library: every placeable kind, its footprint/ecology parameters, and lazily built variant geometry.
//   mat      prop material family (src/render/props.js)
//   radius   default min spacing      trunk  obstacle radius for later placements and grass
//   canopy   shade radius             occ    canopy occlusion strength stamped on the ground
//   sink     metres sunk into the ground    tilt  align to the terrain normal
//   forest   darkens the ground as forest floor    lo/lodDist  low-detail variant beyond lodDist outside DETAIL
import { makeOak, makeBirch, makePine, makeBush } from './trees.js';
import { makeDaisy, makePoppy, makeLupine, makeButtercup } from './flowers.js';
import { makeRock } from './rocks.js';

export const KINDS = {
  'tree.oak':        { make: s => makeOak(s, false), variants: 3, mat: 'tree', radius: 7, canopy: 4.6, occ: 0.5, trunk: 0.6, sink: 0.15 },
  'tree.big':        { make: s => makeOak(s, true), variants: 2, mat: 'tree', radius: 12, canopy: 7, occ: 0.6, trunk: 1.0, sink: 0.2 },
  'tree.birch':      { make: s => makeBirch(s), variants: 3, mat: 'tree', radius: 2.5, canopy: 2.0, occ: 0.3, trunk: 0.3, sink: 0.1 },
  'tree.pine':       { make: s => makePine(s, false), lo: s => makePine(s, true), lodDist: 170, variants: 3, mat: 'tree', radius: 3, canopy: 2.8, occ: 0.45, trunk: 0.4, sink: 0.2, forest: true },
  'bush':            { make: s => makeBush(s), variants: 3, mat: 'tree', radius: 1.4, canopy: 1.2, occ: 0.3, trunk: 0.9, sink: 0.15 },
  'flower.daisy':    { make: s => makeDaisy(s), variants: 3, mat: 'flower', radius: 0.12, sink: 0.02, small: true },
  'flower.poppy':    { make: s => makePoppy(s), variants: 3, mat: 'flower', radius: 0.14, sink: 0.02, small: true },
  'flower.lupine':   { make: s => makeLupine(s), variants: 3, mat: 'flower', radius: 0.2, sink: 0.02, small: true },
  'flower.buttercup':{ make: s => makeButtercup(s), variants: 2, mat: 'flower', radius: 0.1, sink: 0.02, small: true },
  'rock.cliff':      { make: s => makeRock(s, 'cliff'), variants: 4, mat: 'rock', radius: 6, trunk: 4, sink: 1.4, tilt: true, occ: 0.3, canopy: 5 },
  'rock.boulder':    { make: s => makeRock(s, 'boulder'), variants: 4, mat: 'rock', radius: 1.6, trunk: 1.2, sink: 0.25, tilt: true, occ: 0.25, canopy: 1.6 },
  'rock.pebble':     { make: s => makeRock(s, 'pebble'), variants: 3, mat: 'rock', radius: 0.35, trunk: 0.3, sink: 0.08, tilt: true }
};

// shown in the in-page API reference and exposed as mapEditor.kinds
export const KIND_DOCS = {
  'tree.oak': '阔叶树，空间殖民算法生长枝干 + 叶片卡片，约 10m', 'tree.big': '大型孤树（同算法放大），约 16m，适合做地标', 'tree.pine': '针叶松，层叠针叶 + 叶簇卡片，8–14m，远处自动降级', 'tree.birch': '白桦，空间殖民生长，细高白干',
  'bush': '灌木团', 'flower.daisy': '雏菊（白瓣黄心）', 'flower.poppy': '虞美人（红色杯状）', 'flower.lupine': '羽扇豆（紫色花穗）',
  'flower.buttercup': '毛茛（小黄杯）', 'rock.boulder': '巨石：平面切割 + 岩层，顶面长苔', 'rock.cliff': '崖石露头，6–15m，适合放在陡坡上', 'rock.pebble': '卵石，适合河岸'
};

// geometry is built on first use and kept across rebuilds
const geoCache = {};
export function kindGeo(kind, v, lo) {
  const key = kind + v + (lo ? 'lo' : '');
  if (!geoCache[key]) { const K = KINDS[kind]; geoCache[key] = (lo ? K.lo : K.make)(1000 + v * 97 + kind.length * 13); }
  return geoCache[key];
}
export const cachedGeometries = () => new Set(Object.values(geoCache));
