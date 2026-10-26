// 对照场景：法罗尼草原（refs/sources.json → faron）。
// 构图对着原作截图：缓坡草地前景，中景小丘上一堆长苔的圆石和几棵松树，一条土路翻过远处山脊通向塔；
// 右侧谷地低处有雾，远处是层层雾化的山和平顶台地。用 `node tools/compare.mjs faron` 并排对比。
defineScene((m) => {
  m.name('对照 · 法罗尼草原');
  const t = m.terrain;

  // 地形：左高右低的缓坡，正前方一座小丘，丘后右侧落进谷地；远处山脊、尖峰和平顶台地
  t.noise({ amp: 5, scale: 0.012, octaves: 4, seed: 11, warp: 20 });
  t.hill(-70, 10, { radius: 95, height: 13, shape: 'smooth', warp: 20, seed: 1 });
  t.hill(6, -46, { radius: 24, height: 5, shape: 'smooth', warp: 6, seed: 2 });
  t.hill(95, -170, { radius: 150, height: -34, shape: 'smooth', warp: 40, seed: 3 });
  t.noise({ amp: 45, scale: 0.005, octaves: 4, seed: 12, mask: { center: [0, -60], inner: 160, outer: 420 } });
  t.noise({ type: 'ridged', amp: 34, scale: 0.006, octaves: 4, seed: 14, mask: { center: [0, -40], inner: 170, outer: 380 } });
  [[-160, -330, 70, 26], [-60, -380, 80, 32], [90, -360, 90, 22], [210, -300, 70, 30]].forEach(([x, z, r, h], i) => t.hill(x, z, { radius: r, height: h, shape: 'smooth', warp: 25, seed: 20 + i }));
  t.hill(20, -560, { radius: 160, height: 75, shape: 'smooth', warp: 40, seed: 4 });
  t.mountains({ inner: 560, outer: 960, height: 95, base: 15, scale: 0.0032, warp: 100, seed: 5, ridges: 0.2 });
  t.peak(-300, -980, { radius: 300, height: 165, sharpness: 1.4, ridges: 0.6, seed: 6 });
  t.plateau(380, -900, { radius: 120, height: 95, cliff: 30, ledges: 2, warp: 30, seed: 7 });
  t.plateau(620, -760, { radius: 85, height: 70, cliff: 22, ledges: 1, warp: 25, seed: 8 });
  t.erode({ grid: 'far', droplets: 90000, seed: 9 });
  t.erode({ grid: 'detail', droplets: 15000, strength: 0.4, seed: 10 });

  m.path([[8, -38], [14, -90], [18, -160], [22, -300], [26, -470], [22, -540]], { width: 2.4 });

  // 小丘上的圆石堆和松树
  [[0, -44, 3.4], [6, -47, 2.9], [-6, -41, 2.4], [12, -43, 2.1], [3, -51, 2.6], [-10, -46, 1.9], [16, -49, 2.0], [9, -38, 1.6], [-3, -36, 1.3]]
    .forEach(([x, z, s], i) => m.place('rock.boulder', x, z, { scale: s, variant: i % 4 }));
  [[-2, -50], [5, -55], [12, -54], [-9, -52], [19, -56]].forEach(([x, z], i) => m.place('tree.pine', x, z, { scale: 1.15 + (i % 3) * 0.12, variant: i % 3 }));
  m.place('tree.pine', -1.2, -0.6, { scale: 1.25, variant: 1 });   // 右上角入画的近景松枝
  m.scatter('tree.pine', { count: 700, area: m.ring(0, -60, 170, 700), rules: { slope: [0, 0.6], height: [-10, 140], noise: { scale: 0.008, threshold: 0.56, seed: 3 } }, cluster: { size: 12, radius: 22 }, scale: [1.0, 1.6], minSpacing: 5, seed: 13 });
  m.place('tower', 22, -548, { rotation: 0.3, scale: 1.6 });

  // 前景野花
  m.scatter('flower.buttercup', { count: 900, area: m.circle(-16, -10, 18), rules: { noise: { scale: 0.08, threshold: 0.45, seed: 2 } }, seed: 21 });
  m.scatter('flower.poppy', { count: 120, area: m.circle(4, -8, 8), seed: 22 });

  m.grass({ center: [0, 0], radius: 175 });

  m.env({ time: 0.36, wind: 0.35, fogDensity: 0.0026, haze: '#9fbccb', hazeFar: 0.5, snowLine: 400, valleyFog: { height: -22, thickness: 14, density: 0.012 }, clouds: 0.3 });
  m.camera('ref', { label: '对照机位', at: [-6, 2], eye: 3.6, look: [8, -46], lookEye: 3, fov: 50 });
  m.camera('wide', { label: '全景', at: [-40, 70], eye: 12, look: [10, -120], lookEye: 10 });
});
