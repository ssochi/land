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
    falloff: [NUM, 20, '过渡宽度'], strength: [NUM, 1, '0–1'], warp: [NUM, 0, '轮廓扭曲，米'], seed: [NUM, 0, ''] } },
  plateau:   { phase: 'terrain', desc: '台地：把区域整体抬高，四周是近乎垂直的崖壁（初始台地那种）。顶面保留原有起伏，ledges 让崖壁分出几级岩层台阶。', params: {
    x: [NUM, undefined, ''], z: [NUM, undefined, ''], radius: [NUM, undefined, '顶面半径'], height: [NUM, undefined, '抬升高度'],
    cliff: [NUM, 8, '崖壁水平宽度，米：越小越陡'], ledges: [NUM, 2, '崖壁台阶数'], warp: [NUM, 20, '轮廓扭曲，米'], seed: [NUM, 0, ''] } },
  terrace:   { phase: 'terrain', desc: '梯田 / 台阶化：把半径内的高度量化成一级级平台和陡坎，适合做层叠的岩台、峡谷阶地。', params: {
    x: [NUM, undefined, ''], z: [NUM, undefined, ''], radius: [NUM, undefined, ''], step: [NUM, 6, '每级高度，米'],
    sharpness: [NUM, 0.35, '陡坎占一级的比例 0–1'], falloff: [NUM, 30, '边缘过渡宽度'] } },
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
    time: [NUM, 0.3, '0 清晨 · 0.5 正午 · 1 黄昏'], wind: [NUM, 0.5, '0–1'], windDir: [XZ, [0.86, -0.48], ''],
    fogDensity: [NUM, null, '覆盖时刻预设的雾'], haze: [STR, null, '雾色（十六进制），与时刻预设混合：绿地偏青绿、荒地偏暖'],
    hazeFar: [NUM, 0.45, '远景雾化 0–1：越大，远山越像只剩轮廓的平面剪影'],
    valleyFog: [OBJ, null, '山谷雾层 {height: 雾顶高度米, thickness: 衰减厚度米, density}，低处出现成片飘动的雾'],
    clouds: [NUM, 0.5, '云量 0–1'], glare: [NUM, 1, '太阳眩光强度'],
    snowLine: [NUM, 170, '雪线，米'], streaks: [BOOL, true, '风痕'], pollen: [BOOL, true, '飞絮'],
    grass: [OBJ, null, '{root,mid,tipA,tipB} 十六进制'], water: [OBJ, null, '{shallow,deep}'] } },
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
  flatten: 't.flatten(x, z, { radius, height, falloff, strength, warp })',
  plateau: 't.plateau(x, z, { radius, height, cliff, ledges, warp, seed })',
  terrace: 't.terrace(x, z, { radius, step, sharpness, falloff })',
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
  env: 'm.env({ time, wind, windDir, fogDensity, haze, hazeFar, valleyFog, clouds, glare, snowLine, streaks, pollen, grass, water })',
  camera: 'm.camera(name, { label, at, eye, look, lookEye, fov } | { label, pos, target, fov })'
};

// op name -> how the call is spelled in scene.js (report rows)
export const CALL = { noise: 't.noise', mountains: 't.mountains', peak: 't.peak', hill: 't.hill', flatten: 't.flatten', plateau: 't.plateau', terrace: 't.terrace', smooth: 't.smooth', erode: 't.erode', apply: 't.apply', thermal: 't.thermal',
  river: 'm.water.river', lake: 'm.water.lake', path: 'm.path', scatter: 'm.scatter', place: 'm.place', grass: 'm.grass', env: 'm.env', camera: 'm.camera' };

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
