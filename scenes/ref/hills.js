// 对照场景：海拉鲁平原的起伏草丘（refs/sources.json → hills）。
// 构图对着原作截图：近处平坦的草地和一条落叶小路，路边一排石墩；左侧大草丘、远处一层层缓丘，
// 右侧大阔叶树占住画面右上角。看柔和的丘陵明暗、云影和中远景草地的质感。
defineScene((m) => {
  m.name('对照 · 起伏草丘');
  const t = m.terrain;

  t.noise({ amp: 3, scale: 0.02, octaves: 3, seed: 1 });
  t.hill(-95, -105, { radius: 125, height: 34, shape: 'smooth', warp: 30, seed: 2 });       // 左侧大丘
  t.hill(10, -250, { radius: 150, height: 26, shape: 'smooth', warp: 40, seed: 3 });        // 正后方的丘
  t.hill(150, -190, { radius: 120, height: 30, shape: 'smooth', warp: 30, seed: 4 });
  t.hill(125, -60, { radius: 95, height: 15, shape: 'smooth', warp: 25, seed: 5 });         // 右侧缓坡
  t.hill(-260, -380, { radius: 200, height: 55, shape: 'smooth', warp: 50, seed: 6 });
  t.mountains({ inner: 600, outer: 1000, height: 90, base: 10, scale: 0.003, warp: 120, seed: 7, ridges: 0.1 });
  t.erode({ grid: 'far', droplets: 60000, strength: 0.6, seed: 8 });
  t.smooth(0, -100, { radius: 160, iterations: 3, strength: 0.6 });

  m.path([[-60, 6], [-20, -4], [20, -6], [60, 2]], { width: 4.5, flatten: 0.8 });
  [[-24, -16], [-11, -19], [1, -20], [13, -19], [25, -17]].forEach(([x, z], i) => m.place('ruin.pillar', x, z, { scale: 0.55, variant: i % 3, rotation: 0.2 * i }));

  m.place('tree.big', 21, -9, { scale: 1.15, variant: 0, rotation: 2.4 });                  // 右上角的大树
  m.place('tree.oak', -15, -26, { scale: 0.55, variant: 1 });                               // 石墩旁的小树
  m.scatter('bush', { count: 14, area: m.rect(-30, -30, 30, -18), seed: 3 });
  m.scatter('tree.oak', { count: 12, area: m.ring(0, -120, 120, 260), rules: { slope: [0, 0.3] }, minSpacing: 25, seed: 4 });
  m.scatter('flower.lupine', { count: 160, area: m.rect(-12, -26, 20, -18), seed: 5 });

  m.grass({ center: [0, -60], radius: 175 });
  m.env({ time: 0.42, wind: 0.4, fogDensity: 0.0022, haze: '#a8c6c8', hazeFar: 0.4, clouds: 0.55, snowLine: 400 });
  m.camera('ref', { label: '对照机位', at: [0, 10], eye: 1.9, look: [-4, -60], lookEye: 4, fov: 46 });
});
