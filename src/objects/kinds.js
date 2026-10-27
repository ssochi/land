// Model library: every placeable kind, its footprint/ecology parameters, and lazily built variant geometry.
//   mat      prop material family (src/render/props.js)
//   radius   default min spacing      trunk  obstacle radius for later placements and grass
//   canopy   shade radius             occ    canopy occlusion strength stamped on the ground
//   sink     metres sunk into the ground    tilt  align to the terrain normal
//   forest   darkens the ground as forest floor
//   colliders  the geometry's userData.colliders footprint replaces the single trunk circle (walls, towers)
//   lod      distances (m) where the renderer switches to the next, lighter geometry: make(seed, lod, params)
//            builds level lod = 0 (full detail, seen up close), 1, 2 …; levels = lod.length + 1. Every level must
//            be the same model (same layout, colours, materials, silhouette) minus detail too small to see from
//            its distance; the renderer cross-fades levels, and tools/lod-check.mjs measures what changes.
//            Distances are for desktop GPUs; small screens scale them (LOD.bias in src/render/props.js).
//   cull     beyond this distance instances are not drawn at all (small plants and props)
import { makeOak, makeBirch, makePine, makeBush } from './trees.js';
import { makeDaisy, makePoppy, makeLupine, makeButtercup, makeUmbel } from './flowers.js';
import { makeRock } from './rocks.js';
import { makeWall, makePillar, makeArch, makeTower } from './structures.js';
import { makeFern, makeBroadleaf, makeReed } from './undergrowth.js';
import { makeHouse } from './buildings.js';
import { makeFence, makeStoneWall, makeWell, makeLantern, makeBarrel, makeCrate, makeHaybale, makeWoodpile, makeCart, makeSignpost, makeStall, makeWindmill, makeCabbage, makeWheat } from './village-props.js';

const house = style => (s, l, p) => makeHouse(s, l, Object.assign({ style }, p));
const HOUSE = { mat: 'building', colliders: true, lod: [90, 260], radius: 9, canopy: 4.5, occ: 0.35, sink: 0 };
const PROP = { mat: 'building', colliders: true, sink: 0.02 };

export const KINDS = {
  'tree.oak':        { make: (s, l) => makeOak(s, false, l), lod: [80, 220], variants: 3, mat: 'tree', radius: 7, canopy: 4.6, occ: 0.5, trunk: 0.6, sink: 0.15 },
  'tree.big':        { make: (s, l) => makeOak(s, true, l), lod: [100, 280], variants: 2, mat: 'tree', radius: 12, canopy: 7, occ: 0.6, trunk: 1.0, sink: 0.2 },
  'tree.birch':      { make: (s, l) => makeBirch(s, l), lod: [70, 200], variants: 3, mat: 'tree', radius: 2.5, canopy: 2.0, occ: 0.3, trunk: 0.3, sink: 0.1 },
  'tree.pine':       { make: (s, l) => makePine(s, l), lod: [110, 260, 520], variants: 3, mat: 'tree', radius: 3, canopy: 2.8, occ: 0.45, trunk: 0.4, sink: 0.2, forest: true },
  'bush':            { make: (s, l) => makeBush(s, l), lod: [60], cull: 260, variants: 3, mat: 'tree', radius: 1.4, canopy: 1.2, occ: 0.3, trunk: 0.9, sink: 0.15 },
  'flower.daisy':    { make: s => makeDaisy(s), cull: 75, variants: 3, mat: 'flower', radius: 0.12, sink: 0.02, small: true },
  'flower.poppy':    { make: s => makePoppy(s), cull: 75, variants: 3, mat: 'flower', radius: 0.14, sink: 0.02, small: true },
  'flower.lupine':   { make: s => makeLupine(s), cull: 90, variants: 3, mat: 'flower', radius: 0.2, sink: 0.02, small: true },
  'flower.buttercup':{ make: s => makeButtercup(s), cull: 65, variants: 2, mat: 'flower', radius: 0.1, sink: 0.02, small: true },
  'flower.umbel':    { make: s => makeUmbel(s), cull: 80, variants: 3, mat: 'flower', radius: 0.22, sink: 0.02, small: true },
  'fern':            { make: s => makeFern(s), cull: 110, variants: 3, mat: 'flower', radius: 0.7, sink: 0.04, small: true },
  'plant.broadleaf': { make: s => makeBroadleaf(s), cull: 100, variants: 3, mat: 'flower', radius: 0.6, sink: 0.03, small: true },
  'reed':            { make: s => makeReed(s), cull: 120, variants: 3, mat: 'flower', radius: 0.5, sink: 0.05, small: true },
  'rock.cliff':      { make: (s, l) => makeRock(s, 'cliff', l), lod: [60, 200], variants: 4, mat: 'rock', radius: 6, trunk: 4, sink: 1.4, tilt: true, occ: 0.3, canopy: 5 },
  'rock.boulder':    { make: (s, l) => makeRock(s, 'boulder', l), lod: [30, 100], variants: 4, mat: 'rock', radius: 1.6, trunk: 1.2, sink: 0.25, tilt: true, occ: 0.25, canopy: 1.6 },
  'rock.pebble':     { make: (s, l) => makeRock(s, 'pebble', l), cull: 90, variants: 3, mat: 'rock', radius: 0.35, trunk: 0.3, sink: 0.08, tilt: true },
  'ruin.wall':       { make: s => makeWall(s), variants: 3, mat: 'rock', colliders: true, radius: 6, trunk: 2.2, canopy: 3, occ: 0.25, sink: 0.25 },
  'ruin.pillar':     { make: s => makePillar(s), variants: 3, mat: 'rock', colliders: true, radius: 3, trunk: 0.9, canopy: 1.2, occ: 0.2, sink: 0.15 },
  'ruin.arch':       { make: s => makeArch(s), variants: 2, mat: 'rock', colliders: true, radius: 6, trunk: 1.4, canopy: 2.5, occ: 0.2, sink: 0.2 },
  'tower':           { make: s => makeTower(s), variants: 2, mat: 'rock', colliders: true, radius: 14, trunk: 3.8, canopy: 5, occ: 0.35, sink: 0.5 },
  // village (src/objects/buildings.js, village-props.js); 'house' takes custom parameters via m.building
  'house':           { make: (s, l, p) => makeHouse(s, l, p), variants: 8, ...HOUSE },
  'house.hateno':    { make: house('hateno'), variants: 4, ...HOUSE },
  'house.stone':     { make: house('stone'), variants: 4, ...HOUSE },
  'house.timber':    { make: house('timber'), variants: 4, ...HOUSE },
  'house.hut':       { make: house('hut'), variants: 4, ...HOUSE, radius: 6 },
  'fence.wood':      { make: (s, l) => makeFence(s, l), variants: 4, ...PROP, lod: [50], cull: 220, radius: 1.2 },
  'fence.stone':     { make: (s, l) => makeStoneWall(s, l), variants: 3, ...PROP, cull: 260, radius: 1.2 },
  'well':            { make: (s, l) => makeWell(s, l), variants: 2, ...PROP, lod: [60], radius: 4 },
  'lantern':         { make: (s, l) => makeLantern(s, l), variants: 1, ...PROP, lod: [50], cull: 400, radius: 3 },
  'barrel':          { make: (s, l) => makeBarrel(s, l), variants: 3, ...PROP, lod: [40], cull: 160, radius: 0.8 },
  'crate':           { make: (s, l) => makeCrate(s, l), variants: 3, ...PROP, lod: [40], cull: 160, radius: 0.9 },
  'haybale':         { make: (s, l) => makeHaybale(s, l), variants: 2, ...PROP, lod: [50], cull: 260, radius: 1.4 },
  'woodpile':        { make: (s, l) => makeWoodpile(s, l), variants: 2, ...PROP, lod: [45], cull: 200, radius: 1.5 },
  'cart':            { make: (s, l) => makeCart(s, l), variants: 2, ...PROP, lod: [55], cull: 260, radius: 2.5 },
  'signpost':        { make: (s, l) => makeSignpost(s, l), variants: 3, ...PROP, cull: 200, radius: 1 },
  'stall':           { make: (s, l) => makeStall(s, l), variants: 4, ...PROP, lod: [60], cull: 300, radius: 3 },
  'windmill':        { make: (s, l) => makeWindmill(s, l), variants: 1, ...PROP, lod: [80], radius: 12, canopy: 3, occ: 0.25 },
  'crop.wheat':      { make: (s, l) => makeWheat(s, l), variants: 3, mat: 'flower', lod: [35], cull: 130, radius: 0.35, sink: 0.02, small: true },
  'crop.cabbage':    { make: s => makeCabbage(s), variants: 2, mat: 'flower', cull: 90, radius: 0.45, sink: 0.02, small: true }
};

// shown in the in-page API reference and exposed as mapEditor.kinds
export const KIND_DOCS = {
  'tree.oak': '阔叶树：叶团树冠、低处分叉的主枝（空间殖民生长细枝）+ 叶片卡片，约 10m', 'tree.big': '大型孤树：更宽更扁的伞形树冠、粗短树干，约 13m，适合做地标', 'tree.pine': '针叶松，层叠针叶 + 叶簇卡片，8–14m，远处自动降级', 'tree.birch': '白桦：细高白干穿过窄长的叶团树冠',
  'bush': '灌木团', 'flower.daisy': '雏菊（白瓣黄心）', 'flower.poppy': '虞美人（红色杯状）', 'flower.lupine': '羽扇豆（紫色花穗）',
  'flower.buttercup': '毛茛（小黄杯）', 'flower.umbel': '伞形白花（蓍草 / 野胡萝卜一类）：一簇簇白色小花聚成平顶，旷野之息草地上最常见的白花', 'rock.boulder': '巨石：平面切割 + 岩层，顶面长苔', 'rock.cliff': '崖石露头，6–15m，适合放在陡坡上', 'rock.pebble': '卵石，适合河岸',
  'fern': '蕨：拱形羽状叶丛，约 1m，适合林下（配合 rules.canopy）', 'plant.broadleaf': '阔叶草本：大片椭圆叶，阴湿处', 'reed': '芦苇丛：细长叶片和香蒲穗，水边',
  'ruin.wall': '残墙：错缝石块砌成，顶部参差、向一端塌落，周围散落碎石，长 6–10m', 'ruin.pillar': '断柱：基座 + 多节石鼓，顶上一截歪斜残段',
  'ruin.arch': '残拱：两座石墩托起拱券，缺一两块拱石', 'tower': '瞭望塔地标：26–32m，收分塔身、窗缝、雉堞平台和石板尖顶，远处也能辨认',
  'house': '村屋（风格随机）。要指定风格、尺寸、层数、屋顶就用 m.building', 'house.hateno': '哈特诺式村屋：赭黄或米色灰泥墙、乱石勒脚、陶土瓦屋顶配深色木椽和封檐板，山墙外贴着高高的收分烟囱（撑着木杆），有的带圆塔和布幡',
  'house.stone': '石屋：砌石墙、角石、陶土瓦屋顶、石砌烟囱', 'house.timber': '木构架屋：白灰泥墙嵌深色木构架，木瓦屋顶', 'house.hut': '小茅屋：风化木板墙，茅草顶',
  'fence.wood': '木栅栏一段（2.4m），用 m.fence 沿折线布置', 'fence.stone': '干砌石矮墙一段（2.4m），用 m.fence 沿折线布置', 'well': '水井：石砌井圈、木架和小顶棚',
  'lantern': '灯柱：入夜后点亮，照亮周围地面', 'barrel': '木桶', 'crate': '木箱', 'haybale': '草捆', 'woodpile': '柴堆', 'cart': '木推车', 'signpost': '路牌',
  'stall': '集市摊：条纹布篷、柜台和几筐蔬果', 'windmill': '风车：收分石塔、木瓦塔帽，风叶随风转动', 'crop.wheat': '麦丛（成片种出麦田，用 m.field）', 'crop.cabbage': '卷心菜（菜园，用 m.field）'
};

// custom variants: kinds whose geometry depends on script parameters (a house of a given size and style) get a
// variant id ≥ 1000 per distinct parameter set; kindGeo passes the parameters to make()
const CUSTOM = [], CUSTOM_KEYS = new Map();
export function customVariant(kind, params) {
  const key = kind + JSON.stringify(params);
  if (!CUSTOM_KEYS.has(key)) { CUSTOM_KEYS.set(key, CUSTOM.length); CUSTOM.push(params); }
  return 1000 + CUSTOM_KEYS.get(key);
}
export const lodLevels = kind => (KINDS[kind].lod || []).length + 1;

// geometry is built on first use and kept across rebuilds
const geoCache = {};
export function kindGeo(kind, v, lod = 0) {
  const key = kind + '|' + v + '|' + lod;
  if (!geoCache[key]) {
    const K = KINDS[kind], params = v >= 1000 ? CUSTOM[v - 1000] : undefined;
    geoCache[key] = K.make(1000 + (v >= 1000 ? v * 7 : v * 97) + kind.length * 13, Math.min(lod, lodLevels(kind) - 1), params);
  }
  return geoCache[key];
}
export const cachedGeometries = () => new Set(Object.values(geoCache));
