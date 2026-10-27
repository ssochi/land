# 架构说明

## 分层

```
core      随机数、噪声、堆。纯函数，没有状态。
  ↓
world     DETAIL / FAR 两层高度网格，派生标量场（WATER、WDIST、FLOW、OCC、COVER、FOREST、PATH），
          折线工具（polyline.js），以及 terrainVer 等构建版本号。heightAt / normalAt / moistureAt 等查询都在这里。
  ↓
terrain   塑形操作（noise、mountains、peak、hill、flatten、plateau、terrace、smooth、apply）、侵蚀（erode、thermal）、土路（path.js）、
          崖面位移（crag.js：网格和 groundAt 共用，物件 / 草 / 第一人称都踩在实际画出的岩面上）。
water     河道开挖（river.js）、湖泊泛洪（lake.js），水体场的惰性重算（water.js）。
objects   模型库（kinds.js 注册表 + trees / flowers / rocks / structures / undergrowth / buildings / village-props 生成器）、
          村庄布局（village.js：m.village / m.building / m.fence / m.field 的逻辑）、scatter / place、草场烘焙（密度 / 高度 / 地面 / 遮蔽贴图）。
  ↓
runtime   参数 schema 与校验、scene.js 拿到的 `m` 对象（api.js）、不含渲染的世界生成流程（generate.js）。
  ↓
render    three.js：共享 uniform、通用 GLSL、材质贴图烘焙（texgen.js：岩石 / 草地地面 / 土路的反照率、法线、凹陷遮蔽）、
          各类材质与网格构建、阴影、湖面反射、地平线图、后期、风痕、飞絮、时刻。
  ↓
app       编辑器编排（editor.js）、镜头、鼠标拨草、第一人称（walker.js 纯物理，first-person.js 键鼠 / 触屏输入）、DOM 界面、window.mapEditor。
```

规则：

- 只能依赖下层，不能反向引用。
- `runtime` 及以下不访问 `document`、`window` 或 WebGL，世界生成可以在 Node 里跑（见 `test/helpers.js`）。
- 世界状态是模块级单例（网格、标量场、实例列表），每次构建前由 `runtime/generate.js` 的 `resetWorld()` 统一清空；每个持有状态的模块都导出自己的 `reset*()`。
- 惰性派生数据靠版本号失效：地形修改调用 `terrainChanged()`，汇流（`ensureFlow`）和融合高度（`currentB`）在下次查询时按 `world.terrainVer` 重算，水体场看 `world.waterDirty`。

## 页面启动与地图

`index.html` 先定义两个全局函数再加载 `maps.js`：`defineMaps(list)` 收下主界面的地图列表，`defineScene(fn)` 把场景函数登记在 `window.__scenes[当前加载的 id]` 下。`src/main.js` 按地址决定怎么开始：

- `?map=<id>`：按 `maps.js` 加载那张地图的脚本（动态插入 `<script>`，或在打包页面里直接取已内联的函数），然后构建；
- `?scene`：跳过主界面，构建页面旁边的 `scene.js`（`tools/render.mjs` 和 `compare.mjs` 用这个，`--scene` 指定的文件就以 `scene.js` 的名字提供）；
- 都没有：显示主界面（`src/app/maps.js`），点卡片加载并构建，同时把 `?map=<id>` 写进地址。

构建报告的行号取调用栈里场景脚本那一帧：从主界面打开的地图用 `setSceneFile(文件)` 换成按它自己的相对路径匹配（`scenes/village.js`，不会误认 `src/objects/village.js`）。打包时 `tools/build.mjs` 把每张地图的脚本内联成一段 `<script>`，前面先设好 `__scenePending = id`，末尾带 `//# sourceURL=<原文件>`；预览图转成 data URL。

## 一次构建

`app/editor.js` 的 `build(fn)`：

1. `resetWorld()` 清空世界状态，移除上一次的网格（模型几何体有缓存，保留）。
2. `runScript(fn, session)`：执行 `scene.js`。每个 `m.*` 调用先按 schema 校验参数、填默认值，再立即执行，并把状态、耗时、备注和行号写进报告。脚本抛错时构建继续，错误带行号写进报告。
3. `settleWater()`：刷新水体场，把湖和河写进报告。
4. 物件实例化（`render/props.js`）、草场烘焙（`objects/grass.js`）。草叶本身由 `render/grass.js` 每帧在镜头周围按距离分级生成。
5. 地形网格（`render/terrain-mesh.js`，陡坡顶点做崖面位移）、水面和瀑布（`render/water-mesh.js`：抛物线水帘、落点泡沫、水雾，同时把湖交给反射）、地平线图（`render/horizon.js`）。
6. 应用 `m.env()`，切到默认镜头，`window.__mapReady = true`，控制台打印 `MAP_REPORT {json}`。

每一帧：更新镜头（第一人称时先按 1/60 s 固定步长推进 walker，相机放在眼睛位置）→ 阴影（只有窗口移动或太阳转动时重画）→ 湖面反射（看不到湖时跳过）→ 主场景 + 后期。哪些物体参与阴影和反射由 three.js 的图层决定，编号在 `render/layers.js`：`SHADOW` 投影，`REFLECT` 出现在湖面倒影里。

## 开发与打包

- 开发：`index.html` 用 import map 把 `three` 指向 `node_modules`，直接加载 `src/main.js`，不需要构建。`scene.js` 以普通 `<script>` 先执行，通过 `defineScene(fn)` 把函数交给引擎。
- 打包：`tools/build.mjs` 用 esbuild 把 `src/main.js`（含 three.js）打成 IIFE，连同样式和场景脚本内联进 `dist/index.html`。内联的场景脚本带 `//# sourceURL=scene.js`，报告里的行号依然对应源文件。
- 报告的行号来自调用栈里第一个 `scene.js:行:列`。所以 `src/` 下不要出现以 `scene.js` 结尾的文件名。

## 扩展

**新增一个脚本操作**（例如 `t.terrace`）

1. 在 `src/runtime/schema.js` 的 `SCHEMA`、`SIGS`、`CALL` 里登记参数、签名和调用名。
2. 在 `src/terrain/` 实现操作函数，加进 `src/terrain/index.js` 的 `TERRAIN` 表。
3. 在 `src/runtime/api.js` 的 `t` 对象上加入口（地形操作用 `terr('terrace', o)` 即可获得校验、计时、版本号更新）。
4. 「脚本 API」面板会自动显示；需要的话在 `src/app/ui.js` 的 `order` 里排个位置。
5. 在 `test/` 里加用例。

**新增一种模型**

1. 在 `src/objects/` 写生成器 `makeXxx(seed)`，用 `mesh-builder.js` 的 `MB` 和各种 `add*` 拼网格，返回 `BufferGeometry`。
2. 在 `src/objects/kinds.js` 的 `KINDS` 登记（变体数、材质族、间距、遮蔽等），在 `KIND_DOCS` 写一句说明。
3. LOD：生成器接收第二个参数 `lod`（0 最精细），在 `KINDS` 里写 `lod: [d1, d2]` 切换距离（米），需要远处剔除的写 `cull`。`render/props.js` 每帧按距离把实例分到各级的 InstancedMesh 里。
4. 依赖脚本参数的模型（比如指定尺寸的房屋）用 `customVariant(kind, params)` 换一个 ≥1000 的变体号，生成器的第三个参数就是这份参数。

**材质卡号**（顶点属性 `aCard`，`render/props.js` 的着色器按它选材质）：0 顶点色 · 1 叶片卡片 · 2 砌石（砌缝由着色器画）· 3 岩石贴图（三向投影，随 `m.env({ rock })` 换色）· 4 茅草 · 5 木瓦 · 6 窗玻璃（白天暗、夜里亮）· 7 木板 · 8 灰泥 · 9 陶土瓦 · 10 乱石 · 11 灯罩（白天也微亮）· 12 远处树冠的叶团（顶点色，和叶片卡片一样在阴影里仍透进一部分阳光）· 20 以上是风车叶轮（绕轮毂转动，卡号 − 20 是材质）。4–10 用米为单位的 uv 采样 `texgen.js` 烘焙的建筑材质图集（一张 2048×1024，4×2 格，每格中间 448px 是贴图、四周 32px 是绕回的边，按连续 uv 的梯度采样，平铺处没有 mip 接缝）。

**纹理单元上限**：WebGL 只保证每个着色器 16 个纹理单元，多数 GPU（Windows 上的 ANGLE、Mac、手机）就是 16；超过的材质编译失败，直接不画。无头渲染用的 SwiftShader 允许 32，出图看不出来，所以 `editor.js` 在每次构建后的第一帧统计每个着色器用了几个纹理单元，超过 16 就在控制台报错（`tools/render.mjs` 会打印出来）。新增贴图时优先并进图集，不要再加单独的 sampler。

模型的 `userData` 可以带 `colliders`（第一人称和后续放置的避让圆）、`lights`（点光源位置和半径）、`smoke`（炊烟起点），实例化时按实例的位置、朝向、缩放变换后交给对应系统。

## 测试

`npm test` 运行 `test/*.test.js`：

- `core.test.js`：随机数、噪声、堆。
- `schema.test.js`：默认值、必填、类型错误、未知参数告警。
- `walker.test.js`：第一人称的步行 / 冲刺速度、跳跃高度、悬崖挡路而矮坎能跳上去、飞行与落地、树和墙的碰撞、深水游泳。
- `features.test.js`：台地的顶面和崖壁坡度、土路找平且不放置物件、树荫规则、河流入湖时水面降到湖面并截断、草场遮罩、崖面上的物件贴着位移后的岩面。
- `maps.test.js`：`maps.js` 里的 id 唯一、脚本和预览图存在，每张地图都能在 Node 里无错生成、带着登记的预览镜头。
- `village.test.js`：每种风格和朝向的房屋几何有效、LOD 逐级减面；固定参数后换 seed 模型不变；`flatten` 的 cut 模式只削不填；坡地房屋削坡建台、门前落差有限；`m.village` 可复现、房屋互不重叠、门朝着附近的街。
- `scene.test.js`：在 Node 里完整生成示例场景，锁定水位、地形范围和每种模型的数量（与浏览器里的报告一致）；以及脚本出错时的行号、调用返回值可被后续调用使用。

改动生成算法导致 `scene.test.js` 的数字变化是预期内的，确认画面后更新期望值即可；纯重构不应该让它变化。
