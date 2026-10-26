// 对照场景：初始台地的遗迹（refs/sources.json → ruins）。
// 构图对着原作截图：日落逆光，近景是开满白花的草地，左边一棵逆光的大树，右边残墙、石柱和台阶，
// 远处是雾中的台地。看逆光下的透光、暖色雾和遗迹的石材。
defineScene((m) => {
  m.name('对照 · 遗迹日落');
  const t = m.terrain;

  t.noise({ amp: 2.5, scale: 0.03, octaves: 3, seed: 1 });
  t.flatten(10, -20, { radius: 40, height: 1, falloff: 30 });
  t.hill(-260, -420, { radius: 90, height: -60, shape: 'smooth', seed: 2 });
  t.mountains({ inner: 420, outer: 900, height: 110, base: -30, scale: 0.0035, warp: 100, seed: 3, ridges: 0.2 });
  t.plateau(-420, -760, { radius: 140, height: 120, cliff: 25, ledges: 2, warp: 40, seed: 4 });
  t.plateau(-150, -880, { radius: 110, height: 150, cliff: 25, ledges: 2, warp: 40, seed: 5 });

  // 残墙、石柱、残拱
  m.place('ruin.wall', 24, -30, { rotation: 0.1, variant: 0, scale: 1.6 });
  m.place('ruin.wall', 40, -24, { rotation: -0.5, variant: 1, scale: 1.8 });
  m.place('ruin.wall', 10, -36, { rotation: 0.05, variant: 2, scale: 1.5 });
  [[16, -26], [30, -21], [3, -24], [44, -34]].forEach(([x, z], i) => m.place('ruin.pillar', x, z, { scale: 1.5 + (i % 2) * 0.4, variant: i % 3 }));
  m.place('ruin.arch', 35, -40, { rotation: 0.2, scale: 1.6 });
  m.place('ruin.pillar', -22, -18, { scale: 1.8, variant: 1 });

  m.place('tree.big', -12, -26, { scale: 1.1, variant: 1, rotation: 1.2 });                // 逆光大树
  m.scatter('flower.umbel', { count: 2600, area: m.circle(0, -10, 28), rules: { noise: { scale: 0.08, threshold: 0.38, seed: 2 } }, seed: 6 });
  m.scatter('flower.umbel', { count: 1400, area: m.circle(3, 2, 7), seed: 8 });                              // 镜头前密集的一片
  m.scatter('plant.broadleaf', { count: 40, area: m.circle(0, -4, 10), seed: 7 });

  m.grass({ center: [0, -20], radius: 170, height: 1.3 });
  m.env({ time: 0.9, wind: 0.3, fogDensity: 0.003, haze: '#e8c99c', hazeFar: 0.55, clouds: 0.25, snowLine: 400, glare: 1.2 });
  m.camera('ref', { label: '对照机位', at: [2, 6], eye: 1.1, look: [6, -30], lookEye: 2.5, fov: 52 });
});
