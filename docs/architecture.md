# 架构说明

## 分层

```
core      随机数、噪声、堆。纯函数，没有状态。
  ↓
world     DETAIL / FAR 两层高度网格，派生标量场（WATER、WDIST、FLOW、OCC、COVER、FOREST），
          以及 terrainVer 等构建版本号。heightAt / normalAt / moistureAt 等查询都在这里。
  ↓
terrain   塑形操作（noise、mountains、peak、hill、flatten、smooth、apply）和侵蚀（erode、thermal）。
water     河道开挖（river.js）、湖泊泛洪（lake.js），水体场的惰性重算（water.js）。
objects   模型库（kinds.js 注册表 + trees / flowers / rocks 生成器）、scatter / place、草叶分布。
  ↓
runtime   参数 schema 与校验、scene.js 拿到的 `m` 对象（api.js）、不含渲染的世界生成流程（generate.js）。
  ↓
render    three.js：共享 uniform、通用 GLSL、各类材质与网格构建、阴影、地平线图、后期、风痕、飞絮、时刻。
  ↓
app       编辑器编排（editor.js）、镜头、鼠标拨草、DOM 界面、window.mapEditor。
```

规则：

- 只能依赖下层，不能反向引用。
- `runtime` 及以下不访问 `document`、`window` 或 WebGL，世界生成可以在 Node 里跑（见 `test/helpers.js`）。
- 世界状态是模块级单例（网格、标量场、实例列表），每次构建前由 `runtime/generate.js` 的 `resetWorld()` 统一清空；每个持有状态的模块都导出自己的 `reset*()`。
- 惰性派生数据靠版本号失效：地形修改调用 `terrainChanged()`，汇流（`ensureFlow`）和融合高度（`currentB`）在下次查询时按 `world.terrainVer` 重算，水体场看 `world.waterDirty`。

## 一次构建

`app/editor.js` 的 `build(fn)`：

1. `resetWorld()` 清空世界状态，移除上一次的网格（模型几何体有缓存，保留）。
2. `runScript(fn, session)`：执行 `scene.js`。每个 `m.*` 调用先按 schema 校验参数、填默认值，再立即执行，并把状态、耗时、备注和行号写进报告。脚本抛错时构建继续，错误带行号写进报告。
3. `settleWater()`：刷新水体场，把湖和河写进报告。
4. 物件实例化（`render/props.js`）、草叶分布（`objects/grass.js`）与草网格（`render/grass.js`）。
5. 地形网格（`render/terrain-mesh.js`）、水面（`render/water-mesh.js`）、地平线图（`render/horizon.js`）。
6. 应用 `m.env()`，切到默认镜头，`window.__mapReady = true`，控制台打印 `MAP_REPORT {json}`。

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

## 测试

`npm test` 运行 `test/*.test.js`：

- `core.test.js`：随机数、噪声、堆。
- `schema.test.js`：默认值、必填、类型错误、未知参数告警。
- `scene.test.js`：在 Node 里完整生成示例场景，锁定水位、地形范围和每种模型的数量（与浏览器里的报告一致）；以及脚本出错时的行号、调用返回值可被后续调用使用。

改动生成算法导致 `scene.test.js` 的数字变化是预期内的，确认画面后更新期望值即可；纯重构不应该让它变化。
