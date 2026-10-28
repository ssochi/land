// 哈特诺式山村 —— 对照旷野之息的哈特诺村（refs/sources.json → hateno-*）：村子顺着缓坡铺开，背后是长着草的白色石灰岩崖，
// 赭黄灰泥墙、陶土瓦顶、贴着山墙的高烟囱和圆塔；下午偏暖的阳光，炊烟袅袅。把时间拨到 1.0 以后，窗户和路灯会亮起来。
// 村子本身是一行 m.village；镜头位置取自它返回的道路和房屋坐标。
defineScene((m) => {
  m.name('哈特诺式山村');
  const t = m.terrain;

  // ── 地形：向北抬升的缓坡（房屋会削坡建在石台基上），北面和东面是台地崖壁，四周丘陵和远山 ──
  t.noise({ amp: 6, scale: 0.008, octaves: 5, seed: 5, warp: 30 });
  t.noise({ amp: 1.6, scale: 0.035, octaves: 3, seed: 6 });
  t.hill(-10, -95, { radius: 150, height: 26, shape: 'smooth', warp: 30, seed: 11 });
  t.plateau(70, -125, { radius: 55, height: 26, cliff: 7, ledges: 2, warp: 18, seed: 12 });
  t.plateau(-95, -150, { radius: 70, height: 34, cliff: 9, ledges: 3, warp: 22, seed: 13 });
  t.plateau(135, -30, { radius: 40, height: 18, cliff: 6, ledges: 1, warp: 14, seed: 14 });
  t.noise({ amp: 42, scale: 0.0042, octaves: 4, seed: 7, mask: { center: [0, 0], inner: 200, outer: 460 } });
  t.mountains({ inner: 480, outer: 880, height: 130, base: 15, scale: 0.0032, warp: 100, seed: 8, ridges: 0.2 });
  t.peak(-280, -760, { radius: 300, height: 170, sharpness: 1.3, ridges: 0.55, seed: 9 });
  t.peak(380, -640, { radius: 260, height: 120, sharpness: 1.25, ridges: 0.5, seed: 10 });
  t.erode({ grid: 'far', droplets: 90000, seed: 12 });
  t.erode({ grid: 'detail', droplets: 20000, strength: 0.45, seed: 13 });
  // 村子所在的坡切成一块块高低不等的岩台，高差大处是白色石灰岩陡崖（哈特诺村就建在一层层岩台上）
  t.ledges(0, -8, { radius: 85, size: 30, tilt: 0.1, jitter: 1.5, cliff: 0.9, warp: 8, falloff: 40, seed: 3 });

  // 小溪从崖下流过村西
  m.water.river([[-150, -120], [-112, -80], [-96, -30], [-102, 25], [-128, 75]], { width: 4.5, depth: 1.1, bank: 4 });

  // ── 村子 ──
  const v = m.village({ center: [0, -8], radius: 68, houses: 18, style: 'mixed', gaps: 0.18, fields: 3, lanterns: 15, trees: 1.4, seed: 4 });
  const pond = m.water.lake(-130, 85, { fill: 1.5, maxRadius: 34 });
  m.log(`${v.houses.length} 栋房屋 · 风车 ${v.windmill} · 池塘水位 ${pond ? pond.level : '-'}`);

  // ── 村外：崖上和坡上的树、灌木、野花、芦苇、草 ──
  m.scatter('tree.oak', { count: 40, area: m.ring(0, -8, 75, 190), rules: { slope: [0, 0.5], waterDist: [3, 999] }, cluster: { size: 4, radius: 16 }, scale: [1.0, 1.5], minSpacing: 8, seed: 15 });
  m.scatter('tree.big', { count: 10, area: m.ring(0, -8, 70, 170), rules: { slope: [0, 0.35], waterDist: [4, 999] }, scale: [0.7, 1.0], minSpacing: 25, seed: 22 });
  m.scatter('tree.pine', { count: 5000, area: m.ring(0, 0, 210, 820), rules: { slope: [0, 0.62], height: [0, 190], noise: { scale: 0.006, threshold: 0.5, seed: 4 } }, scale: [1.2, 1.9], minSpacing: 3.6, seed: 14 });
  m.scatter('tree.birch', { count: 14, area: m.circle(-100, 0, 40), rules: { waterDist: [3, 18] }, minSpacing: 4, seed: 16 });
  m.scatter('bush', { count: 90, area: m.ring(0, -8, 30, 150), rules: { slope: [0, 0.6], noise: { scale: 0.03, threshold: 0.45 } }, minSpacing: 2.5, seed: 17 });
  m.scatter('flower.umbel', { count: 1800, area: m.ring(0, -8, 30, 130), rules: { slope: [0, 0.45], noise: { scale: 0.05, threshold: 0.55, seed: 5 } }, seed: 18 });
  m.scatter('flower.buttercup', { count: 2600, area: m.ring(0, -8, 20, 140), rules: { slope: [0, 0.45], noise: { scale: 0.045, threshold: 0.55, seed: 6 } }, seed: 19 });
  m.scatter('reed', { count: 90, area: m.circle(-105, 20, 75), rules: { waterDist: [0.3, 3] }, minSpacing: 1.2, seed: 20 });
  m.scatter('rock.boulder', { count: 16, area: m.ring(0, -8, 60, 160), rules: { slope: [0.1, 0.7] }, scale: [0.6, 1.6], minSpacing: 10, seed: 21 });
  m.grass({ center: [0, -8], radius: 175 });

  // ── 环境：下午偏暖的阳光，空气里有点雾气 ──
  m.env({ time: 0.74, wind: 0.3, fogDensity: 0.0034, haze: '#c2cfc6', hazeFar: 0.5, clouds: 0.5, snowLine: 330, rock: '#d2cfc4' });

  // ── 镜头：从生成结果里取位置 ──
  const road = v.roads[0].points, hs = v.houses, h0 = hs[0], h1 = hs[Math.min(2, hs.length - 1)];
  m.camera('overview', { label: '村子全景', at: [40, 52], eye: 9, look: [-6, -22], lookEye: 3, fov: 58 });
  m.camera('street', { label: '主街', at: road[1], eye: 1.8, look: road[3], lookEye: 3, fov: 58 });
  m.camera('house', { label: '村屋', at: h0.street, eye: 1.7, look: [h0.x, h0.z], lookEye: 3.2, fov: 62 });
  const near = (h, t) => [h.door[0] + (h.street[0] - h.door[0]) * t, h.door[1] + (h.street[1] - h.door[1]) * t];
  m.camera('door', { label: '门前', at: near(h1, 0.6), eye: 1.7, look: [h1.x, h1.z], lookEye: 2.6, fov: 64 });
  const pd = [road[3][0] - v.plaza.x, road[3][1] - v.plaza.z], pl = Math.hypot(...pd);   // from the main street, 14m out of the plaza
  m.camera('plaza', { label: '广场', at: [v.plaza.x + pd[0] / pl * 14, v.plaza.z + pd[1] / pl * 14], eye: 3.4, look: [v.plaza.x, v.plaza.z], lookEye: 1.5, fov: 58 });
  m.camera('lane', { label: '小巷', at: v.roads[1] ? v.roads[1].points[2] : road[4], eye: 1.8, look: v.roads[1] ? v.roads[1].points[0] : road[2], lookEye: 2.5, fov: 58 });
  if (v.windmill) {   // from the village side, high enough to see over the roofs
    const wd = [v.plaza.x - v.windmill[0], v.plaza.z - v.windmill[1]], wl = Math.hypot(...wd);
    m.camera('windmill', { label: '风车', at: [v.windmill[0] + wd[0] / wl * 40, v.windmill[1] + wd[1] / wl * 40], eye: 7, look: v.windmill, lookEye: 6, fov: 50 });
  }
});
