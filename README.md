# land · 面向 agent 的地图编辑器

**目标：让 agent 只靠写代码，就能做出《塞尔达传说：旷野之息》水准和质感的开放世界美术场景。**

传统地图编辑器是给人用的：拖笔刷、摆物件、在视口里反复调整。agent 没有手和眼睛，它擅长的是写代码、读结构化反馈、按截图迭代。所以 land 把整张地图做成了一段 `scene.js`：地形、侵蚀、湖和河、树花石、草地、环境与镜头，全部是函数调用。每次调用立即执行并返回结果，构建完成后输出带行号的结构化报告，配合无头出图，agent 可以形成「写脚本 → 看报告和截图 → 改脚本」的闭环。

附带的示例场景「镜湖原野」是一片湖畔山谷：西侧台地上的瀑布泻入湖中、倒映在湖面上，东北小山流下一条溪；一条土路从南边草甸经过遗迹，通向湖岸和东南山丘上的瞭望塔；四周是分层的远山和针叶林。

![瀑布倒影](docs/hero.jpg)

| 湖岸 | 遗迹 |
| --- | --- |
| ![湖岸](docs/lake.jpg) | ![遗迹](docs/ruins.jpg) |
| **瞭望塔** | **溪流** |
| ![瞭望塔](docs/tower.jpg) | ![溪流](docs/river.jpg) |

同一机位的前后对比（左：初版，右：当前）：

![前后对比](docs/before-after.jpg)

## 设计原则

**面向 agent**

- **场景即代码**：没有隐藏状态，`scene.js` 就是地图的全部定义，可以 diff、review、版本管理。
- **立即执行、有返回值**：`m.water.lake()` 直接返回水位和面积，`m.heightAt()` 随地形修改实时更新，后面的代码可以基于前面的结果做决策。
- **可解释的反馈**：每次调用都记录耗时、状态和 `scene.js` 行号；散布被规则拒绝时按原因计数（例如 `放置 7/45 · 拒绝：slope 940, height 837`），agent 知道该放宽哪条规则。
- **确定性**：所有生成器都由种子驱动，同一份脚本永远得到同一张地图。测试会锁定示例场景的生成结果。
- **无头可用**：世界生成不依赖浏览器，可以直接在 Node 里跑；渲染通过 Playwright 出图。

**旷野之息的美术标准**

- **生态驱动的布局**：植被由坡度、湿度（汇流累积）、坡向日照、离水距离决定，而不是随机撒点。
- **大气纵深**：雾色随环境和时刻变化（绿地偏青绿、黄昏偏暖），远山压成剪影；低处有成片的山谷雾，太阳有大片眩光。
- **风是主角**：草浪亮带、成簇摆动的树、风痕和飞絮由同一个风场驱动。
- **绘画感的光**：柔和的明暗交界、逆光透射、边缘光、冷暖分区调色，而不是写实 PBR。
- **可读的剪影**：树冠、岩石、山脊、崖壁、塔楼都有清晰的轮廓和层次。
- **关卡设计**：地标让人定位，遗迹是沿路的兴趣点，土路引导视线；台地和瀑布构成画面焦点。

## 快速开始

```bash
npm install
npm run dev      # 打开 http://localhost:8000 ，修改 scene.js 后刷新即可
npm run build    # 生成 dist/index.html：单文件、离线可用，可以直接双击打开
```

- 拖动旋转视角，滚轮缩放，鼠标划过草地会拨开草叶。
- 底部栏切换镜头，调节时刻和风力。
- 右上角「构建报告」里有每次调用的执行记录、调试视图（坡度、等高、侵蚀、离水距离、汇流），以及完整的脚本 API 参考。

## 场景脚本

```js
defineScene((m) => {
  const t = m.terrain;
  t.mountains({ inner: 420, outer: 760, height: 100 });
  t.erode({ grid: 'far', droplets: 110000 });
  t.hill(15, -80, { radius: 62, height: -15, shape: 'smooth', warp: 16 });  // 挖湖盆，轮廓不再是正圆
  t.plateau(-78, -122, { radius: 30, height: 26, cliff: 5 }); // 四周是垂直崖壁的台地

  m.path([[-62, 140], [-40, 38], [-26, -10], [-44, -58]], { width: 2.6 });   // 土路：草和树会避开
  const creek = m.water.river([[122, -128], [84, -104], [40, -86]], { width: 6 });
  m.water.river([[-86, -116], [-61, -104], [-40, -94], [-22, -86]], { width: 4 }); // 从台地边缘落下，就是瀑布
  const lake = m.water.lake(15, -80, { fill: 'spill' });     // 自动取溢出水位，返回 { level, area }
  m.log(`湖面 ${lake.level}m`);

  // 沿溪流两岸种白桦：调用立即生效，可以马上查询离水距离
  creek.points(11).forEach(([x, z, , tx, tz], i) => {
    const s = i % 2 ? 1 : -1, px = x - tz * s * 10, pz = z + tx * s * 10;
    if (m.waterAt(px, pz).dist > 3) m.place('tree.birch', px, pz);
  });

  m.scatter('tree.oak', {
    count: 22, area: m.circle(0, -10, 135),
    rules: { slope: [0, 0.28], moisture: [0.18, 1] },         // 湿润平缓的低地
    cluster: { size: 4, radius: 18 },                          // 成簇分布
  });
  m.place('tower', 95, 62);                                    // 地标
  m.scatter('fern', { count: 320, area: m.circle(0, -10, 150), rules: { canopy: [0.2, 1] } });  // 林下
  m.grass({ center: [0, -15], radius: 118 });
  m.env({ time: 0.28, haze: '#86b3a3', valleyFog: { height: -4, thickness: 12, density: 0.0035 } });
  m.camera('falls', { at: [44, -84], eye: 1.6, look: [-46, -102], lookEye: 9 });
});
```

| 分类 | 调用 |
| --- | --- |
| 地形 | `t.noise` `t.mountains` `t.peak` `t.hill` / `t.raise` / `t.lower` `t.flatten` `t.plateau` `t.terrace` `t.smooth` `t.erode` `t.thermal` `t.apply((x, z, h) => …)` |
| 水 | `m.water.river(path, …)` → `{ length, drop, points() }`（陡段自动画成瀑布），`m.water.lake(x, z, …)` → `{ level, area }` |
| 路 | `m.path(points, { width, flatten, wear })` → `{ length }` |
| 物件 | `m.scatter(kind, { count, area, rules, cluster })`，`m.place(kind, x, z, { rotation, scale })` |
| 草与环境 | `m.grass(…)` `m.env({ time, wind, haze, hazeFar, valleyFog, clouds, glare, snowLine, … })` `m.camera(name, …)` |
| 查询 | `m.heightAt` `m.slopeAt` `m.normalAt` `m.waterAt` `m.flowAt` `m.moistureAt` `m.sunAt` `m.noise` `m.random(seed)` |

散布规则 `rules` 支持 `height`、`slope`、`waterDist`、`moisture`、`sun`、`canopy`（树荫，均为 `[min, max]`）和 `noise` 遮罩；水下和路面上不会放置。

模型库：

- 树木：`tree.oak` `tree.big` `tree.birch` `tree.pine` `bush`
- 林下与水边：`fern` `plant.broadleaf` `reed`
- 花：`flower.daisy` `flower.poppy` `flower.lupine` `flower.buttercup`
- 岩石：`rock.boulder` `rock.cliff` `rock.pebble`
- 遗迹与地标：`ruin.wall` `ruin.pillar` `ruin.arch` `tower`

参数的权威定义在 [`src/runtime/schema.js`](src/runtime/schema.js)，页面里的「脚本 API」面板由它生成。

## 给 agent 的出图循环

```bash
# 构建场景，按镜头出图并打印报告（不需要先 build，直接用源码）
node tools/render.mjs hero lake river

# 自定义镜头、查询、调试视图
node tools/render.mjs '{"name":"close","at":[-12,-22],"eye":2,"look":[-5,-30],"lookEye":4}' \
  --eval "mapEditor.heightAt(15, -80)" --view 5

# 换一份场景脚本，或者渲染打包后的单文件
node tools/render.mjs --scene my-scene.js --out out/my-scene
node tools/render.mjs --page dist/index.html
```

输出目录（默认 `out/`）里有每个镜头的 PNG 和 `report.json`。构建出错时进程以非零状态退出。

页面加载后，`window.mapEditor` 提供 `run(fn)` 重建、`report()`、各种查询、`camera()`、`view()`、`pause()` / `step()` / `snapshot()` 等接口，供控制台或无头浏览器使用；`mapEditor.debug` 暴露 three.js 的 renderer、scene、camera 和共享 uniform，方便排查渲染问题。

## 开发

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 本地静态服务，直接加载 `src/` 下的 ES 模块 |
| `npm run build` | 用 esbuild 打包成 `dist/index.html`（three.js、样式、场景脚本全部内联） |
| `npm test` | Node 内置测试：核心算法、参数校验，以及示例场景的端到端生成 |
| `npm run lint` | ESLint |
| `npm run check` | lint + test + build，CI 跑的就是这一套 |
| `npm run render` | 无头出图，见上一节 |

three.js 版本由 `package.json` 锁定，开发和打包都从 `node_modules` 取，不依赖 CDN。

## 架构

```
scene.js            示例场景「镜湖原野」
index.html          页面骨架（开发入口）
src/
  core/             纯算法：随机数、噪声、堆
  world/            高度网格、派生标量场（水、汇流、湿度、遮蔽）、构建版本号
  terrain/          地形操作：塑形、水力 / 热力侵蚀
  water/            河道开挖、湖泊泛洪、水体场
  objects/          模型库（树、花、石）、散布与放置、草叶分布
  runtime/          脚本 API、参数 schema、世界生成流程
  render/           three.js 材质与着色器、阴影、地平线图、后期、风痕、时刻
  app/              编辑器编排、镜头、界面、window.mapEditor
  styles/           页面样式
tools/
  build.mjs         打包单文件
  render.mjs        无头构建 / 出图 / 查询
test/               node --test
docs/               截图与架构说明
```

依赖只能自上而下：`core → world → terrain / water / objects → runtime → render → app`。`runtime` 及以下不碰 DOM 和 WebGL，所以整套世界生成可以在 Node 里运行和测试。模块划分、构建流程和扩展方式（新增脚本操作、新增模型）见 [docs/architecture.md](docs/architecture.md)。

## 用到的算法

**地形**
- **侵蚀 fBm**：叠加噪声时累加梯度，坡越陡，后续细节越被压平，直接得到主脊加分支沟谷的山体（Quilez）。
- **水滴式水力侵蚀**：同时输出磨损图，供着色使用。
- **热力侵蚀**：超过安息角的物质向下滑落。
- **河道生成**：沿 Catmull-Rom 路径挖出单调下降的河床。
- **湖泊填充**：优先队列泛洪求溢出水位。

**水文与生态**
- **多流向汇流累积**（MFD，Freeman 1991）：得到湿度场，驱动沟谷着色、积雪和植被分布。
- **坡向日照**：用于区分向阳坡和背阴坡。
- **成簇散布**：Thomas 点过程。

**模型**
- **空间殖民算法**生长树枝（Runions et al. 2007），枝干粗细由管道模型推出。
- 树冠用叶片卡片，法线从外包球传递。
- 松树是层叠针叶加叶簇卡片。
- 岩石用随机半空间切割球体，再叠加岩层，得到平面块状。
- 遗迹和塔由错缝、内缩的石块砌成，顶面长苔，周围散落碎石。
- 蕨是拱形叶轴加成对小叶，芦苇是外倾叶片加香蒲穗。

**渲染**
- **阴影**：太阳正交阴影贴图（叶片按 alpha 测试投影）。
- **地平线图**：8 个方位，用于天空可见度和随时刻变化的山体大尺度投影。
- **崖壁**：三向投影（triplanar）的岩石着色，柱状胞元噪声给每块岩体一个法线朝向，叠加不规则岩层、风化竖纹和地衣；陡坡顶点沿下坡方向做三维噪声位移，崖面不再是平滑拉伸的一片。
- **大气**：高度雾 + 只看距离的空气透视；山谷雾层沿视线积分指数高度雾，并用噪声切成飘动的雾团；雾色可按环境着色。
- **水**：湖面平面反射（镜像相机 + 斜近裁剪面，半分辨率，看不到湖时跳过）；河道陡段画成白色下落水帘，脚下有水雾。
- **后期**：泛光、太阳眩光（按太阳处天空可见度缩放）、高光压缩加冷暖分区调色、屏幕空间体积光。
- **草**：实例化草叶，带风浪亮带，鼠标划过时草叶被拨开。

## 对照旷野之息

画面是对着 6 张旷野之息实际截图调的（4 张官方 4K 宣传图）。可以量化的一项是近景草地的局部明暗对比（草叶之间的明暗差）：初版 0.041–0.061，旷野之息 0.013–0.023，当前 0.022–0.029；草地亮度从 0.35–0.43 提到 0.47–0.56。

## 距离目标还差什么

- **画面**：没有屏幕空间 AO；原作那种笔触感的后期滤镜、卡通描边还没做；没有夜晚、点光源和天气。
- **地貌**：地形是高度场，做不出内凹、洞穴和天然石拱；只有温带草原一种生物群落。
- **内容**：没有动物和声音；遗迹和建筑种类还少，没有桥、马厩、营地。
- **规模**：可行走的细节区域是 ±160m（网格 0.8m），远景 ±1100m（网格 3.7m），还不是无缝大世界。
- **性能**：约 47 万草叶、9000 多棵松树，加上阴影、湖面反射和后期，只在软件渲染下测过，真机帧率未测；手机上会自动降低草的密度、阴影和反射分辨率。
- **agent 工作流**：还没有场景之间的 diff、局部重建，以及对截图的自动美术评估。
