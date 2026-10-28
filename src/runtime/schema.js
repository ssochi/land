// OP SCHEMA — the contract an agent writes against.
// params: [type, default (undefined = required), description]. Drives validation, defaults and the API docs pane.

export const XZ = 'xz', NUM = 'num', STR = 'str', PATH = 'path', OBJ = 'obj', RANGE = 'range', BOOL = 'bool', ARR = 'arr';

export const SCHEMA = {
  noise:     { phase: 'terrain', desc: '叠加全局噪声起伏。fbm 以 0.5 为中心（有升有降），ridged/billow 只升不降。', params: {
    type: [STR, 'fbm', 'fbm | ridged | billow'], amp: [NUM, undefined, '振幅，米'], scale: [NUM, 0.01, '频率，1/米'],
    octaves: [NUM, 4, '倍频数 1–7'], seed: [NUM, 0, '种子'], warp: [NUM, 0, '域扭曲强度，米'],
    mask: [OBJ, null, '可选径向遮罩 {center:[x,z], inner, outer, invert}'] } },
  mountains: { phase: 'terrain', desc: '以原点为中心的环形山脉：inner 以内为 0，outer 以外满强度。style:"eroded" 用梯度衰减的侵蚀 fBm（主脊 + 分支沟谷，山体厚重）；"ridged" 为尖锐山脊。', params: {
    style: [STR, 'eroded', 'eroded | ridged'], ridges: [NUM, 0.25, '叠加尖脊的比例 0–1'],
    inner: [NUM, 200, '起山半径'], outer: [NUM, 420, '满高半径'], height: [NUM, 200, '山脊高度'], base: [NUM, 15, '底座抬升'],
    scale: [NUM, 0.004, '山脊频率'], warp: [NUM, 50, '域扭曲'], seed: [NUM, 0, '种子'] } },
  peak:      { phase: 'terrain', desc: '单座带棱线的山峰。', params: {
    x: [NUM, undefined, ''], z: [NUM, undefined, ''], radius: [NUM, undefined, '山脚半径'], height: [NUM, undefined, '峰高'],
    sharpness: [NUM, 1.5, '>1 更尖'], ridges: [NUM, 0.45, '棱线起伏 0–1'], seed: [NUM, 0, ''] } },
  hill:      { phase: 'terrain', desc: '加一个包或挖一个坑（height 为负）。', params: {
    x: [NUM, undefined, ''], z: [NUM, undefined, ''], radius: [NUM, undefined, ''], height: [NUM, undefined, '可为负'],
    shape: [STR, 'gauss', 'gauss | smooth | plateau'], warp: [NUM, 0, '轮廓扭曲，米：让边缘不再是正圆'], seed: [NUM, 0, ''] } },
  flatten:   { phase: 'terrain', desc: '把区域向目标高度压平。', params: {
    x: [NUM, undefined, ''], z: [NUM, undefined, ''], radius: [NUM, undefined, '核心半径'], height: [NUM, undefined, '目标高度'],
    falloff: [NUM, 20, '过渡宽度'], strength: [NUM, 1, '0–1'], warp: [NUM, 0, '轮廓扭曲，米'], mode: [STR, 'both', 'both | cut（只削低高处，坡上开出平台）| fill（只填高低处）'], seed: [NUM, 0, ''] } },
  plateau:   { phase: 'terrain', desc: '台地：把区域整体抬高，四周是近乎垂直的崖壁（初始台地那种）。顶面保留原有起伏，ledges 让崖壁分出几级岩层台阶。', params: {
    x: [NUM, undefined, ''], z: [NUM, undefined, ''], radius: [NUM, undefined, '顶面半径'], height: [NUM, undefined, '抬升高度'],
    cliff: [NUM, 8, '崖壁水平宽度，米：越小越陡'], ledges: [NUM, 2, '崖壁台阶数'], warp: [NUM, 20, '轮廓扭曲，米'], seed: [NUM, 0, ''] } },
  terrace:   { phase: 'terrain', desc: '梯田 / 台阶化：把半径内的高度量化成一级级平台和陡坎，适合做层叠的岩台、峡谷阶地。', params: {
    x: [NUM, undefined, ''], z: [NUM, undefined, ''], radius: [NUM, undefined, ''], step: [NUM, 6, '每级高度，米'],
    sharpness: [NUM, 0.35, '陡坎占一级的比例 0–1'], falloff: [NUM, 30, '边缘过渡宽度'], warp: [NUM, 0, '陡坎位置的起伏（米）：0 时沿等高线，1–3 让台地边缘弯曲错落'], seed: [NUM, 0, ''] } },
  ledges:    { phase: 'terrain', desc: '岩台：把半径内的坡面切成一块块不规则的平台（像哈特诺村那样），平台顺着原来的坡一级级升高、高差不等；高差大的地方是陡崖，高差小的地方是缓坡。比 terrace 更自然，适合在坡上建村。', params: {
    x: [NUM, undefined, ''], z: [NUM, undefined, ''], radius: [NUM, undefined, ''], size: [NUM, 26, '平台平均宽度，米'],
    tilt: [NUM, 0.12, '平台保留原坡度的比例 0–1（0 完全水平）'], jitter: [NUM, 1.2, '每块平台高度的随机增减，米'],
    cliff: [NUM, 1.0, '大高差处崖壁的半宽，米：越小越陡'], warp: [NUM, 7, '平台轮廓的扭曲，米'], falloff: [NUM, 30, '边缘过渡宽度'], seed: [NUM, 0, ''] } },
  river:     { phase: 'terrain', desc: '沿路径挖单调下降的河床，并生成流动水面。路径从上游写到下游。', params: {
    path: [PATH, undefined, '[[x,z],…] 至少 2 点'], width: [NUM, 6, '河道宽'], depth: [NUM, 1.4, '河床深'],
    bank: [NUM, 6, '河岸坡宽'], drop: [NUM, 0.01, '每米最小落差'] } },
  path:      { phase: 'terrain', desc: '土路：沿路径踩出裸露的土路，横向找平地面；草、树、花都会避开路面。用来引导视线、连接地标。', params: {
    path: [PATH, undefined, '[[x,z],…] 至少 2 点'], width: [NUM, 2.4, '路宽，米'], flatten: [NUM, 0.6, '横向找平强度 0–1'], wear: [NUM, 1, '路面裸露程度 0–1'] } },
  smooth:    { phase: 'terrain', desc: '局部平滑细节网格。', params: {
    x: [NUM, 0, ''], z: [NUM, 0, ''], radius: [NUM, 80, ''], iterations: [NUM, 2, ''], strength: [NUM, 0.5, '0–1'] } },
  erode:     { phase: 'terrain', desc: '水滴式水力侵蚀，生成冲沟与沉积扇，同时写入磨损图供着色使用。', params: {
    grid: [STR, 'far', 'far | detail'], droplets: [NUM, 60000, '水滴数'], strength: [NUM, 1, '侵蚀倍率'],
    inertia: [NUM, 0.05, ''], capacity: [NUM, 4, ''], seed: [NUM, 0, ''] } },
  lake:      { phase: 'water', desc: '从种子点泛洪填湖。level 绝对水位；或 fill:"spill" 自动取溢出高度减 margin；或 fill:数值 = 种子地面 + 该值。', params: {
    x: [NUM, undefined, ''], z: [NUM, undefined, ''], level: [NUM, null, '绝对水位'], fill: [ARR, 'spill', '"spill" 或米数'],
    margin: [NUM, 0.4, 'spill 时低于溢出点的余量'], maxRadius: [NUM, 80, '泛洪最大半径'] } },
  scatter:   { phase: 'objects', desc: '按区域 + 规则散布模型。被规则拒绝的数量会写进报告。', params: {
    kind: [STR, undefined, '见模型库'], count: [NUM, 100, '目标数量'], area: [OBJ, { type: 'all' }, '{type:circle,center,radius} | {type:ring,center,inner,outer} | {type:rect,min,max} | {type:polygon,points} | {type:all}'],
    rules: [OBJ, {}, '{height, slope, waterDist, moisture, sun, canopy: [a,b]；noise:{scale,threshold,seed,invert}}。moisture 为汇流 + 近水湿度 0–1，sun 为坡向日照 0–1（0.5 是平地），canopy 为已放树木投下的树荫 0–1。路面上不会放置'],
    cluster: [OBJ, null, '{size, radius}：成簇分布（Thomas 过程），size 为每簇平均数量'],
    scale: [RANGE, [0.85, 1.2], '缩放区间'], minSpacing: [NUM, null, '最小间距，默认取模型半径'], seed: [NUM, 0, ''] } },
  place:     { phase: 'objects', desc: '在指定点放一个模型（贴地）。', params: {
    kind: [STR, undefined, ''], x: [NUM, undefined, ''], z: [NUM, undefined, ''], scale: [NUM, 1, ''], rotation: [NUM, null, '弧度，缺省随机'], variant: [NUM, null, ''] } },
  grass:     { phase: 'grass', desc: '在圆形区域种草叶，中心密、边缘稀，自动避开水、陡坡和物件。', params: {
    center: [XZ, [0, 0], ''], radius: [NUM, 80, ''], density: [NUM, 1, '密度倍率'], height: [NUM, 1, '草高倍率：1 是 0.2–0.7m 的草甸，2 左右是没膝的高草'],
    rules: [OBJ, {}, '同 scatter.rules'] } },
  env:       { phase: 'env', desc: '环境：时刻、风、雾、雪线、配色。', params: {
    time: [NUM, 0.3, '0 清晨 · 0.5 正午 · 1 黄昏 · 1.25 入夜（窗户和灯笼亮起）'], wind: [NUM, 0.5, '0–1'], windDir: [XZ, [0.86, -0.48], ''],
    fogDensity: [NUM, null, '覆盖时刻预设的雾'], haze: [STR, null, '雾色（十六进制），与时刻预设混合：绿地偏青绿、荒地偏暖'],
    hazeFar: [NUM, 0.45, '远景雾化 0–1：越大，远山越像只剩轮廓的平面剪影'],
    valleyFog: [OBJ, null, '山谷雾层 {height: 雾顶高度米, thickness: 衰减厚度米, density}，低处出现成片飘动的雾'],
    clouds: [NUM, 0.5, '云量 0–1'], glare: [NUM, 1, '太阳眩光强度'],
    toon: [NUM, 0.8, '卡通渲染强度 0–1：明暗分成柔和的两阶、暗部提亮并偏冷保留固有色（旷野之息 / 原神式的“3渲2”质感）；0 是连续的写实明暗'],
    outline: [NUM, 0.6, '描边强度 0–1：物体轮廓画一圈深色线（按深度跳变检测，远处淡出，草不描边）；0 关闭'],
    snowLine: [NUM, 170, '雪线，米'], streaks: [BOOL, true, '风痕'], pollen: [BOOL, true, '飞絮'],
    rock: [STR, null, '岩石主色（十六进制）：#d6d2c6 灰白石灰岩 · #b4876a 红砂岩 · 缺省 #977d69 暖灰褐'],
    grass: [OBJ, null, '{root,mid,tipA,tipB} 十六进制'], water: [OBJ, null, '{shallow,deep}'] } },
  village:   { phase: 'objects', desc: '一键生成村庄：主街和支路穿过中心广场（水井、集市摊、灯笼），房屋沿路排开、门朝街，宅基地自动压平；后院围篱笆种菜，门口堆木桶木箱柴堆，沿路立灯笼，空地种树，村外开田、立风车和路牌。避开水面、陡坡和彼此。坡地上的房屋削坡建在乱石台基上、门前有石阶。返回每栋房屋（含门口和门前街道上的点 street）、道路、田地的位置，便于继续加工和取镜头。放在河流之后、其他散布之前；湖最好在它之后建（它会改地形），湖边村子则先建湖，房屋会离水 3 米以上。', params: {
    center: [XZ, undefined, '村中心（广场）'], radius: [NUM, 55, '村子半径，米'], houses: [NUM, 12, '房屋数量（目标）'],
    style: [STR, 'mixed', 'hateno | stone | timber | hut | mixed（哈特诺式为主的混合）'], gaps: [NUM, 0.15, '沿街留空地的比例 0–1（种树、菜园）'], roads: [ARR, null, '自定义道路：一条 [[x,z],…] 或多条 [[[x,z],…], …]；缺省自动生成主街和支路'],
    plaza: [NUM, 9, '广场半径，0 不要广场'], fields: [NUM, 2, '村外田地块数'], fences: [NUM, 0.55, '围篱笆后院的比例 0–1'],
    lanterns: [NUM, 16, '路灯间距，米；0 不要'], props: [NUM, 1, '杂物多少 0–2'], trees: [NUM, 1, '树木多少 0–2'], windmill: [BOOL, true, '在村外高处立风车'],
    lawn: [NUM, 1, '村里的草被踩短、啃短的程度 0–1（0 保持 m.grass 的高度）'],
    landmarks: [NUM, 2, '地标建筑数量 0–2：离广场最近的宅基地盖村长家（方塔）和大旅馆（老虎窗、翼楼），门前围抹灰院墙、开石拱门'], seed: [NUM, 0, ''] } },
  building:  { phase: 'objects', desc: '按参数盖一栋房屋（门朝 rotation 方向的 +z），默认先把宅基地压平。缺省的参数按 seed 随机。返回房屋尺寸和门口坐标。', params: {
    x: [NUM, undefined, ''], z: [NUM, undefined, ''], style: [STR, 'hateno', 'hateno（赭黄灰泥墙、陶瓦顶、高烟囱）| stone | timber | hut'], rotation: [NUM, 0, '弧度，0 = 门朝 +z'],
    front: [STR, null, 'eave（长边朝街）| gable（山墙朝街）'], width: [NUM, null, '正面宽，米'], depth: [NUM, null, '进深，米'], floors: [NUM, null, '1 或 2'],
    roof: [STR, null, 'tile | shingle | thatch'], pitch: [NUM, null, '屋面坡度，度'], chimney: [BOOL, null, '烟囱（哈特诺式多为贴着山墙的高烟囱）'],
    tower: [BOOL, null, '塔楼：方塔立在临街一角（王国之泪式，角石 + 四坡尖顶），圆塔在屋后角'], towerShape: [STR, null, 'square | round'],
    roofShape: [STR, null, 'gable 双坡 | hip 四坡'], wings: [ARR, null, '翼楼 [{ side: "f"|"b", a, w, e, floors }]：主屋前后墙上接出的双坡翼楼（L / T / 十字形平面），a 沿屋脊的偏移、w 宽、e 伸出长度；[] 不要'],
    dormers: [NUM, null, '前坡上的老虎窗数量'],
    pergola: [BOOL, null, '门前的木廊架：挂大灯笼和招牌，顶上爬着藤（旅馆门口那样）'], deck: [BOOL, null, '山墙一侧的木平台：立柱撑在地上，带栏杆和台阶'],
    lean: [BOOL, null, '山墙一侧的披檐柴棚：单坡瓦顶、两根柱子、里面码着木柴'], sign: [BOOL, null, '门边木托架上挂的招牌'], ivy: [BOOL, null, '一面墙上从地面爬上去的藤'], laundry: [BOOL, null, '从山墙（或后墙）拉出去的晾衣绳，挂着衣物'], warp: [BOOL, true, '手工感：墙微倾微鼓、屋脊下垂、檐口和瓦面起伏几厘米；false 得到规整的模型'],
    banner: [BOOL, null, '临街墙上挂布幡'], porch: [BOOL, null, '门廊'], tint: [NUM, null, '百叶窗和布幡的配色编号'],
    flatten: [BOOL, true, '先压平宅基地'], seed: [NUM, 0, ''] } },
  fence:     { phase: 'objects', desc: '沿折线立篱笆（每段 2.4m）：木栅栏、干砌石矮墙或抹灰院墙。gates 是留空当门的段号。', params: {
    path: [PATH, undefined, '[[x,z],…]'], style: [STR, 'wood', 'wood | stone | yard（抹灰院墙）'], gates: [ARR, [], '留空的段号，如 [0, 5]'] } },
  field:     { phase: 'objects', desc: '开一块田：地面翻成带垄沟的耕地，按行种上作物，可选围篱笆。', params: {
    center: [XZ, undefined, ''], size: [XZ, [18, 12], '[长, 宽]，米；垄沿长边'], rotation: [NUM, 0, '弧度'], crop: [STR, 'wheat', 'wheat | cabbage'],
    fence: [STR, null, 'wood | stone，缺省不围'], seed: [NUM, 0, ''] } },
  camera:    { phase: 'env', desc: '镜头预设。用 at/look 贴地写（eye 为离地高度），或用 pos/target 绝对坐标。第一个为默认镜头。', params: {
    name: [STR, undefined, '只用字母数字，可作 #锚点'], label: [STR, null, '显示名'], at: [XZ, null, ''], eye: [NUM, 2.5, ''],
    look: [XZ, null, ''], lookEye: [NUM, 2, ''], pos: [ARR, null, '[x,y,z]'], target: [ARR, null, '[x,y,z]'],
    fov: [NUM, 45, '竖直视场角，度；对照参考截图构图时用'] } },
  thermal:   { phase: 'terrain', desc: '热力侵蚀：坡度超过安息角的物质向下滑落，形成碎石坡和更敦实的山脚。建议放在水力侵蚀之后。', params: {
    grid: [STR, 'far', 'far | detail'], iterations: [NUM, 30, ''], talus: [NUM, 36, '安息角，度'], rate: [NUM, 0.5, '0–1'] } },
  apply:     { phase: 'terrain', desc: '自定义逐格函数：对每个网格点调用 fn(x, z, h)，返回新高度。用来写台地、梯田、峡谷或任何笔刷。', params: {
    grid: [STR, 'both', 'both | detail | far'] } }
};

// call signatures as scene.js writes them (API docs pane, mapEditor.signatures)
export const SIGS = {
  noise: 't.noise({ amp, scale, type, octaves, seed, warp, mask })',
  mountains: 't.mountains({ inner, outer, height, base, scale, warp, seed, style, ridges })',
  peak: 't.peak(x, z, { radius, height, sharpness, ridges, seed })',
  hill: 't.hill(x, z, { radius, height, shape, warp })   简写：t.raise(x, z, r, h) · t.lower(x, z, r, depth)',
  flatten: 't.flatten(x, z, { radius, height, falloff, strength, warp, mode })',
  plateau: 't.plateau(x, z, { radius, height, cliff, ledges, warp, seed })',
  terrace: 't.terrace(x, z, { radius, step, sharpness, falloff, warp, seed })',
  ledges: 't.ledges(x, z, { radius, size, tilt, jitter, cliff, warp, falloff, seed })',
  smooth: 't.smooth(x, z, { radius, iterations, strength })',
  erode: 't.erode({ grid, droplets, strength, inertia, capacity, seed })',
  apply: 't.apply((x, z, h) => 新高度, { grid })',
  thermal: 't.thermal({ grid, iterations, talus, rate })',
  river: 'm.water.river(path, { width, depth, bank, drop })  → { length, drop, width, points(spacing) }',
  lake: 'm.water.lake(x, z, { level | fill, margin, maxRadius })  → { level, area, leaked } | null',
  path: 'm.path(points, { width, flatten, wear })  → { length }',
  scatter: 'm.scatter(kind, { count, area, rules, scale, minSpacing, cluster, seed })  → { placed, requested, rejected, positions }',
  place: 'm.place(kind, x, z, { scale, rotation, variant })  → { x, y, z }',
  grass: 'm.grass({ center, radius, density, height, rules })',
  env: 'm.env({ time, wind, windDir, fogDensity, haze, hazeFar, valleyFog, clouds, glare, toon, outline, snowLine, streaks, pollen, rock, grass, water })',
  village: 'm.village({ center, radius, houses, style, gaps, roads, plaza, fields, fences, lanterns, props, trees, windmill, lawn, landmarks, seed })',
  building: 'm.building(x, z, { style, rotation, front, width, depth, floors, roof, roofShape, pitch, chimney, tower, towerShape, wings, dormers, pergola, deck, lean, sign, ivy, laundry, warp, banner, porch, tint, flatten, seed })',
  fence: 'm.fence(path, { style, gates })', field: 'm.field({ center, size, rotation, crop, fence, seed })',
  camera: 'm.camera(name, { label, at, eye, look, lookEye, fov } | { label, pos, target, fov })'
};

// op name -> how the call is spelled in scene.js (report rows)
export const CALL = { noise: 't.noise', mountains: 't.mountains', peak: 't.peak', hill: 't.hill', flatten: 't.flatten', plateau: 't.plateau', terrace: 't.terrace', ledges: 't.ledges', smooth: 't.smooth', erode: 't.erode', apply: 't.apply', thermal: 't.thermal',
  river: 'm.water.river', lake: 'm.water.lake', path: 'm.path', scatter: 'm.scatter', place: 'm.place', grass: 'm.grass', env: 'm.env', camera: 'm.camera', village: 'm.village', building: 'm.building', fence: 'm.fence', field: 'm.field' };

// fill defaults and type-check one call. Returns { error } or { p, warn, def }.
export function validate(op) {
  const def = SCHEMA[op.op];
  if (!def) return { error: `未知操作 "${op.op}"` };
  const p = {}, unknown = [];
  for (const k in op) if (k !== 'op' && !(k in def.params)) unknown.push(k);
  for (const k in def.params) {
    const [type, dflt] = def.params[k];
    let v = op[k];
    if (v === undefined) { if (dflt === undefined) return { error: `缺少必填参数 "${k}"` }; v = dflt === null ? null : JSON.parse(JSON.stringify(dflt)); }
    if (v !== null && type === NUM && (typeof v !== 'number' || !isFinite(v))) return { error: `参数 "${k}" 应为有限数字，收到 ${JSON.stringify(v)}` };
    if (v !== null && (type === XZ || type === RANGE) && !(Array.isArray(v) && v.length === 2)) return { error: `参数 "${k}" 应为二元数组 [a, b]` };
    if (v !== null && type === PATH && !(Array.isArray(v) && v.length >= 2)) return { error: `参数 "${k}" 应为至少两个点的路径 [[x,z], …]` };
    p[k] = v;
  }
  return { p, warn: unknown.length ? `忽略未知参数：${unknown.join(', ')}` : null, def };
}
