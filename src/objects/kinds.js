// Model library: every placeable kind, its footprint/ecology parameters, and lazily built variant geometry.
//   mat      prop material family (src/render/props.js)
//   radius   default min spacing      trunk  obstacle radius for later placements and grass
//   canopy   shade radius             occ    canopy occlusion strength stamped on the ground
//   sink     metres sunk into the ground    tilt  align to the terrain normal
//   forest   darkens the ground as forest floor    lo/lodDist  low-detail variant beyond lodDist outside DETAIL
import { makeOak, makeBirch, makePine, makeBush } from './trees.js';
import { makeDaisy, makePoppy, makeLupine, makeButtercup } from './flowers.js';
import { makeRock } from './rocks.js';
import { makeWall, makePillar, makeArch, makeTower } from './structures.js';
import { makeFern, makeBroadleaf, makeReed } from './undergrowth.js';

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
  'fern':            { make: s => makeFern(s), variants: 3, mat: 'flower', radius: 0.7, sink: 0.04, small: true },
  'plant.broadleaf': { make: s => makeBroadleaf(s), variants: 3, mat: 'flower', radius: 0.6, sink: 0.03, small: true },
  'reed':            { make: s => makeReed(s), variants: 3, mat: 'flower', radius: 0.5, sink: 0.05, small: true },
  'rock.cliff':      { make: s => makeRock(s, 'cliff'), variants: 4, mat: 'rock', radius: 6, trunk: 4, sink: 1.4, tilt: true, occ: 0.3, canopy: 5 },
  'rock.boulder':    { make: s => makeRock(s, 'boulder'), variants: 4, mat: 'rock', radius: 1.6, trunk: 1.2, sink: 0.25, tilt: true, occ: 0.25, canopy: 1.6 },
  'rock.pebble':     { make: s => makeRock(s, 'pebble'), variants: 3, mat: 'rock', radius: 0.35, trunk: 0.3, sink: 0.08, tilt: true },
  'ruin.wall':       { make: s => makeWall(s), variants: 3, mat: 'rock', radius: 6, trunk: 2.2, canopy: 3, occ: 0.25, sink: 0.25 },
  'ruin.pillar':     { make: s => makePillar(s), variants: 3, mat: 'rock', radius: 3, trunk: 0.9, canopy: 1.2, occ: 0.2, sink: 0.15 },
  'ruin.arch':       { make: s => makeArch(s), variants: 2, mat: 'rock', radius: 6, trunk: 1.4, canopy: 2.5, occ: 0.2, sink: 0.2 },
  'tower':           { make: s => makeTower(s), variants: 2, mat: 'rock', radius: 14, trunk: 3.8, canopy: 5, occ: 0.35, sink: 0.5 }
};

// shown in the in-page API reference and exposed as mapEditor.kinds
export const KIND_DOCS = {
  'tree.oak': '阔叶树，空间殖民算法生长枝干 + 叶片卡片，约 10m', 'tree.big': '大型孤树（同算法放大），约 16m，适合做地标', 'tree.pine': '针叶松，层叠针叶 + 叶簇卡片，8–14m，远处自动降级', 'tree.birch': '白桦，空间殖民生长，细高白干',
  'bush': '灌木团', 'flower.daisy': '雏菊（白瓣黄心）', 'flower.poppy': '虞美人（红色杯状）', 'flower.lupine': '羽扇豆（紫色花穗）',
  'flower.buttercup': '毛茛（小黄杯）', 'rock.boulder': '巨石：平面切割 + 岩层，顶面长苔', 'rock.cliff': '崖石露头，6–15m，适合放在陡坡上', 'rock.pebble': '卵石，适合河岸',
  'fern': '蕨：拱形羽状叶丛，约 1m，适合林下（配合 rules.canopy）', 'plant.broadleaf': '阔叶草本：大片椭圆叶，阴湿处', 'reed': '芦苇丛：细长叶片和香蒲穗，水边',
  'ruin.wall': '残墙：错缝石块砌成，顶部参差、向一端塌落，周围散落碎石，长 6–10m', 'ruin.pillar': '断柱：基座 + 多节石鼓，顶上一截歪斜残段',
  'ruin.arch': '残拱：两座石墩托起拱券，缺一两块拱石', 'tower': '瞭望塔地标：26–32m，收分塔身、窗缝、雉堞平台和石板尖顶，远处也能辨认'
};

// geometry is built on first use and kept across rebuilds
const geoCache = {};
export function kindGeo(kind, v, lo) {
  const key = kind + v + (lo ? 'lo' : '');
  if (!geoCache[key]) { const K = KINDS[kind]; geoCache[key] = (lo ? K.lo : K.make)(1000 + v * 97 + kind.length * 13); }
  return geoCache[key];
}
export const cachedGeometries = () => new Set(Object.values(geoCache));
