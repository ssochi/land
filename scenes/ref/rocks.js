// 对照场景：法罗尼草原的岩壁（refs/sources.json → rocks，原作 4K 宣传图）。
// 构图对着原作截图：傍晚的缓坡草地，左侧近处一面高大的岩壁，正前方中景是一座浑圆的岩峰，后面还有更矮的岩丘。
// 太阳在镜头左后方，岩面被暖光照亮。看岩石表面的起伏、裂隙、冷暖和岩壁脚下草地的过渡。
defineScene((m) => {
  m.name('对照 · 法罗尼岩壁');
  const t = m.terrain;

  t.noise({ amp: 3, scale: 0.02, octaves: 3, seed: 1 });
  t.hill(0, -40, { radius: 70, height: 5, shape: 'smooth', seed: 2 });                     // 镜头所在的缓坡
  t.plateau(-34, 8, { radius: 13, height: 30, cliff: 5, ledges: 1, warp: 7, seed: 3 });     // 左侧近处的岩壁
  t.peak(-34, 6, { radius: 18, height: 10, sharpness: 0.8, ridges: 0.4, seed: 3 });
  t.plateau(16, 62, { radius: 20, height: 34, cliff: 8, ledges: 1, warp: 10, seed: 4 });    // 中景岩峰
  t.peak(16, 62, { radius: 26, height: 16, sharpness: 0.7, ridges: 0.5, seed: 4 });
  t.plateau(-14, 90, { radius: 16, height: 26, cliff: 7, ledges: 1, warp: 9, seed: 5 });
  t.plateau(50, 100, { radius: 22, height: 30, cliff: 10, ledges: 1, warp: 12, seed: 6 });
  t.mountains({ inner: 400, outer: 800, height: 110, base: 15, scale: 0.003, warp: 100, seed: 8 });
  t.erode({ grid: 'detail', droplets: 20000, strength: 0.6, seed: 9 });

  m.scatter('rock.boulder', { count: 8, area: m.circle(-10, 40, 30), rules: { slope: [0, 0.5] }, scale: [0.8, 1.6], minSpacing: 6, seed: 10 });
  m.grass({ center: [0, 20], radius: 150, height: 1.4 });
  m.env({ time: 0.78, wind: 0.3, fogDensity: 0.0024, haze: '#b6b48c', hazeFar: 0.4, clouds: 0.45, snowLine: 400 });
  m.camera('ref', { label: '对照机位', at: [-6, -24], eye: 2.6, target: [12, 24, 60], fov: 50 });
});
