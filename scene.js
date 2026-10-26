// 镜湖原野 —— 湖畔山谷：东北小山流下一条溪，注入谷底的湖，四周是侵蚀过的雪山和成片针叶林。
defineScene((m) => {
  m.name('镜湖原野');
  const t = m.terrain;

  // ── 地形 ─────────────────────────────────────────────
  t.noise({ amp: 16, scale: 0.008, octaves: 5, seed: 1, warp: 30 });
  t.noise({ amp: 3, scale: 0.035, octaves: 3, seed: 2 });
  // 三层远景：近丘（150–330m）、中岭（330–650m）、远山（700m 以外）
  t.noise({ amp: 55, scale: 0.004, octaves: 4, seed: 21, mask: { center: [0, 0], inner: 150, outer: 380 } });
  t.mountains({ inner: 420, outer: 760, height: 100, base: 10, scale: 0.0034, warp: 90, seed: 3, ridges: 0.12 });
  t.mountains({ inner: 820, outer: 1060, height: 190, base: 25, scale: 0.0026, warp: 120, seed: 8, ridges: 0.15 });
  t.peak(-360, -900, { radius: 440, height: 170, sharpness: 1.25, ridges: 0.6, seed: 4 });   // 主峰
  t.peak(620, -720, { radius: 320, height: 80, sharpness: 1.2, ridges: 0.6, seed: 5 });
  t.peak(150, -150, { radius: 85, height: 42, sharpness: 1.3, seed: 6 });      // 东北小山，溪流源头
  t.raise(-80, -40, 55, 9);                                                    // 湖西高地
  t.flatten(0, 15, { radius: 55, height: 4, falloff: 40, strength: 0.65 });    // 谷底草甸
  t.hill(15, -80, { radius: 62, height: -15, shape: 'smooth', warp: 16, seed: 3 });  // 湖盆，轮廓扭曲成不规则形状
  t.erode({ grid: 'far', droplets: 110000, seed: 9 });
  t.thermal({ grid: 'far', iterations: 6, talus: 50 });                       // 只削去最陡的尖，留下碎石坡
  t.erode({ grid: 'detail', droplets: 25000, strength: 0.5, seed: 10 });
  t.smooth(0, 0, { radius: 95, iterations: 2, strength: 0.5 });

  // ── 水 ───────────────────────────────────────────────
  const creek = m.water.river([[122, -128], [104, -114], [84, -104], [62, -94], [40, -86]], { width: 6, depth: 1.3, bank: 6 });
  const lake = m.water.lake(15, -80, { fill: 'spill', margin: 0.6, maxRadius: 95 });
  m.log(`湖面 ${lake.level}m · 面积 ${lake.area}㎡ · 溪流 ${creek.length}m，落差 ${creek.drop}m`);

  // ── 树 ───────────────────────────────────────────────
  const rnd = m.random(42);
  // 橡树成簇长在湿润的低地上（Thomas 过程：先撒簇中心，再在周围撒个体）
  const oaks = m.scatter('tree.oak', { count: 22, area: m.circle(0, -10, 135), rules: { slope: [0, 0.28], waterDist: [6, 999], moisture: [0.18, 1] }, cluster: { size: 4, radius: 18 }, scale: [0.85, 1.3], minSpacing: 9, seed: 1 });
  m.log(`橡树 ${oaks.placed} 棵`);
  m.place('tree.big', -6, -2, { scale: 1 });                                     // 草甸中央的地标大树
  m.place('tree.oak', 22, -22, { scale: 1.45 });

  // 溪流两岸交替种白桦，离水 8–12 米
  creek.points(11).forEach(([x, z, , tx, tz], i) => {
    if (i === 0) return;
    const side = i % 2 ? 1 : -1, off = rnd.range(8, 12);
    const px = x - tz * side * off, pz = z + tx * side * off;
    if (m.waterAt(px, pz).dist > 3 && m.slopeAt(px, pz) < 0.45) m.place('tree.birch', px, pz, { scale: rnd.range(0.85, 1.2) });
  });
  m.scatter('tree.birch', { count: 12, area: m.circle(58, -58, 26), rules: { waterDist: [3, 25], slope: [0, 0.4] }, minSpacing: 4, seed: 2 });

  // 东北小山的松林；远山上成片的松林，用噪声分出林块
  m.scatter('tree.pine', { count: 150, area: m.circle(140, -140, 70), rules: { slope: [0, 0.7], height: [10, 200], waterDist: [3, 999] }, scale: [0.85, 1.25], minSpacing: 4.5, seed: 3 });
  // 远山针叶林：沟谷湿润处、背阴坡更密；山脊和向阳坡留出草坡与岩石
  m.scatter('tree.pine', { count: 9000, area: m.ring(0, 0, 170, 820), rules: { slope: [0, 0.62], height: [8, 170], moisture: [0.12, 1], sun: [0, 0.7], noise: { scale: 0.005, threshold: 0.48, seed: 4 } }, scale: [1.3, 2.0], minSpacing: 3.6, seed: 4 });

  m.scatter('bush', { count: 70, area: m.circle(0, -20, 140), rules: { slope: [0, 0.45], waterDist: [1.5, 40], noise: { scale: 0.03, threshold: 0.45 } }, minSpacing: 3, seed: 5 });

  // ── 石头 ─────────────────────────────────────────────
  m.scatter('rock.boulder', { count: 14, area: m.circle(0, -20, 130), rules: { slope: [0, 0.5], waterDist: [2, 999] }, scale: [0.8, 2.2], minSpacing: 14, seed: 6 });
  m.scatter('rock.boulder', { count: 7, area: m.circle(15, -80, 70), rules: { waterDist: [0, 2.5] }, scale: [0.6, 1.4], minSpacing: 8, seed: 7 });
  m.scatter('rock.pebble', { count: 170, area: m.circle(82, -106, 55), rules: { waterDist: [0.2, 7], noise: { scale: 0.09, threshold: 0.5, seed: 21 } }, scale: [0.35, 1.5], seed: 8 });

  m.scatter('rock.cliff', { count: 45, area: m.ring(0, 0, 160, 700), rules: { slope: [0.2, 0.95], waterDist: [4, 999] }, scale: [0.8, 1.7], minSpacing: 22, seed: 31 });

  // 湖西高地顶上一组残石，给主镜头一个前景
  [[-74, -44, 1.6], [-71.5, -41, 0.9], [-76.5, -39.5, 1.1]].forEach(([x, z, s]) => m.place('rock.boulder', x, z, { scale: s }));

  // ── 花 ───────────────────────────────────────────────
  m.scatter('flower.daisy', { count: 6500, area: m.circle(-10, 10, 70), rules: { slope: [0, 0.4], waterDist: [1, 999], noise: { scale: 0.05, threshold: 0.56, seed: 11 } }, seed: 11 });
  m.scatter('flower.buttercup', { count: 4200, area: m.circle(0, 5, 75), rules: { slope: [0, 0.4], waterDist: [1, 999], noise: { scale: 0.045, threshold: 0.58, seed: 12 } }, seed: 12 });
  m.scatter('flower.poppy', { count: 800, area: m.circle(-45, 12, 32), rules: { slope: [0, 0.4], sun: [0.45, 1], noise: { scale: 0.06, threshold: 0.48, seed: 13 } }, seed: 13 });
  m.scatter('flower.lupine', { count: 1600, area: m.circle(15, -80, 80), rules: { waterDist: [1.2, 9], slope: [0, 0.45] }, seed: 14 });

  // ── 草 ───────────────────────────────────────────────
  m.grass({ center: [0, -15], radius: 118 });

  // ── 环境与镜头 ───────────────────────────────────────
  m.env({ time: 0.28, wind: 0.5, snowLine: 195, fogDensity: 0.0023, haze: '#86b3a3', hazeFar: 0.5, valleyFog: { height: -4, thickness: 12, density: 0.0035 }, clouds: 0.45 });
  m.camera('hero',     { label: '湖畔高地', at: [-84, -28], eye: 3.4, look: [25, -140], lookEye: 10 });
  m.camera('field',    { label: '原野', at: [-34, 44], eye: 2.6, look: [12, -70], lookEye: 6 });
  m.camera('lake',     { label: '湖岸', at: [40, -28], eye: 2.8, look: [-30, -140], lookEye: 14 });
  m.camera('river',    { label: '溪流', at: [66, -80], eye: 2.6, look: [110, -124], lookEye: 7 });
  m.camera('flowers',  { label: '野花', at: [-29, 42], eye: 1.2, look: [-38, 28], lookEye: 0.4 });
  m.camera('overview', { label: '鸟瞰', pos: [150, 175, 200], target: [0, 5, -70] });
  m.camera('topdown',  { label: '俯视', pos: [0, 460, 1], target: [0, 0, 0] });
});
