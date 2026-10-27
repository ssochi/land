# 建模工具（`src/objects/poly/`）

模型用代码写，但不再只靠「盒子 + 四边形 + 回转体」拼。`Poly` 是一套照着 Blender 建模工具做的多边形网格工具：从基本体开始，用倒角、内插、挤出、细分曲面、实体化、阵列、镜像、变形器塑形，最后烘焙进 `MB`（`mesh-builder.js`），带按米展开的 uv 和加权法线。

```js
import { Poly, fillet2, rect2 } from './poly/index.js';

// 一块手工劈出来的木方：倒棱、轻微不规则，木纹顺着长边
Poly.box(1.2, 0.12, 0.12, { u: X }).bevel({ width: 0.02, segments: 1 }).jitter(0.004, 3, seed)
  .toMB(mb, { at: matrix, color: WOOD, card: 7 });

// 门板：内插一圈、往里挤一点，再整体倒圆角
Poly.box(1.0, 2.0, 0.08).inset('pz', 0.1).extrude('last', -0.02).bevel({ width: 0.01, segments: 2 });

// 圆润的石块：带折痕的细分曲面 + 噪声
Poly.box(0.5, 0.3, 0.4).subdivide({ levels: 2, sharp: 30, crease: 0.5 }).jitter(0.02, 4, seed);
```

## 为什么这样做

原来的模型方方正正、面数少，原因不是性能顾虑，而是手里只有 `box`、`quad`、`lathe` 三种零件：没有倒角、细分、挤出，所有边都是 90° 的硬边、所有面都是完全平的平面，光照下就是电脑味很重的方块。游戏美术的常规做法（中模工作流，mid-poly）是：主要轮廓上的边做倒角，再用加权法线让大平面保持平整、倒角处平滑过渡，不用烘焙法线贴图就能得到「精心制作」的边缘，面数只增加几倍。这套工具就是把这种工作流做成代码。

## 调研：Blender 提供的建模工具

来源：Blender 官方手册的修改器、编辑模式和几何节点章节（见文末），以及 Polycount 上关于中模工作流的讨论。按「对我们写代码建模有多大用」分类：

| Blender | 作用 | 这里 |
|---|---|---|
| **Bevel** 修改器（Limit Method = Angle，Segments，Profile，Harden Normals） | 把夹角大于阈值的边切成圆角或斜角，平面保持平整 | `bevel({ width, segments, angle, profile })` ✅ |
| **Subdivision Surface**（Catmull-Clark，边折痕） | 细分并向光滑极限曲面靠拢；折痕控制哪些边保持锐利 | `subdivide({ levels, sharp, crease, simple })` ✅ |
| **Weighted Normal** + **Smooth by Angle** | 按面积加权求顶点法线，超过角度阈值的边保持硬边 | 烘焙时默认开启（`smooth` 角度，默认 50°）✅ |
| **Inset Faces** | 在面内缩一圈，可带深度 | `inset(sel, amount, depth)` ✅ |
| **Extrude Region / Individual** | 沿法线或给定方向挤出 | `extrude(sel, dist, { individual })` ✅ |
| **Solidify** | 给薄面加厚度 | `solidify(t)` ✅ |
| **Array** / **Mirror** / **Weld** | 阵列复制、镜像、按距离合并顶点 | `array` `mirror` `weld` ✅ |
| **Displace** / **Simple Deform**（Taper、Twist、Bend） | 噪声位移、锥化、扭转、弯曲 | `jitter` `taper` `twist` `bend` `warp(fn)` ✅ |
| **Screw / Spin**，曲线 **Bevel / Curve to Mesh** | 截面绕轴回转、沿曲线扫掠 | `Poly.lathe` `Poly.sweep`（可带 `scale(t)` 锥化）✅ |
| 曲线圆角（Fillet Curve），文字/曲线的挤出 | 2D 轮廓倒圆后挤出成立体 | `fillet2` + `Poly.prism` ✅ |
| 基本体（Cube、Cylinder、Grid、Icosphere…） | | `box` `cylinder` `grid` `icosphere` ✅ |
| **Boolean**（差、并、交） | 开洞、合并任意网格 | 计划中：需要时接 manifold-3d（WASM，保证流形）或 three-bvh-csg；墙上开门窗目前直接按矩形切面 |
| **Skin**（骨架长成网格）、**Wireframe** | 树枝、栏杆、框架 | 计划中 |
| **Decimate**、**Remesh** | 自动减面、重新布线 | 远景 LOD 目前用 `withDetail` 重跑同一段建模代码（见「用法建议」）；需要时再加 |
| Knife、Loop Cut、Bridge Edge Loops、Poke、Grid Fill | 编辑模式的手工操作 | 按需加 |
| 几何节点：Instance on Points、Distribute Points on Faces、Curve to Mesh、Mesh Boolean… | 程序化散布与组合 | 场景层已有散布（`m.scatter`），模型层按需加 |

## 数据结构

- `poly.P`：顶点位置（`THREE.Vector3`）。
- `poly.F`：面，`{ v, card, col, u, vDown, tag }`。`v` 是顶点下标，从外面看逆时针；`card` 是材质卡号（`null` 时用烘焙的默认值）；`col` 面颜色；`u` 贴图 u 方向（默认水平），`vDown` 让 v 沿坡向下（屋瓦）；`tag` 是名字，后面的步骤可以按名字选面。
- `poly.last`：上一步新做出来的面（内插后的内面、挤出后被移动的面），可以接着用 `'last'` 选。

选面（`pick(sel)`）：`'all'`、`'last'`、一个 tag（基本体自带：盒子 `px nx py ny pz nz`，柱/棱柱 `top bottom side`，扫掠 `side start end`）、一个函数 `({ f, i, n, c }) => bool`（`n` 法线、`c` 中心），或者下标数组。

## 工具一览

**基本体**（`primitives.js`）：`Poly.box(sx, sy, sz)` 居中的盒子；`Poly.grid(sx, sz, nx, nz)` 朝上的网格面；`Poly.prism(outline, h)` 2D 轮廓（可凹）向上挤出；`Poly.lathe(profile, segs)` 回转体，轮廓点 `r = 0` 处自动封极点；`Poly.cylinder(r, h, segs, attr, r2)`；`Poly.sweep(path, profile, attr, { closed, up, scale })` 截面沿路径扫掠（平行传输标架）；`Poly.icosphere(r, detail)`。2D：`rect2` `circle2` `fillet2(pts, r, segs)`（倒圆角，segs 1 为斜角）。

**倒角**（`bevel.js`）：`bevel({ width, segments, angle = 40, profile: 'round' | 'chamfer', select })`。夹角超过 `angle` 的内部边被切回 `width`，换成 `segments` 段的圆弧（有理二次贝塞尔，圆弧精确）；几条倒角边交汇的顶点补一块角片；没倒角但连着倒角顶点的边上会滑出一个点，所以倒角可以在顶点处中途停下。只要求网格流形、绕向一致；开放边界的边不倒角。

**细分曲面**（`subdivide.js`）：`subdivide({ levels = 1, sharp, crease = 1, simple })`。Catmull-Clark；夹角超过 `sharp` 度的边按 `crease`（0–1）上折痕，折痕会传给细分后的半边；`simple` 只细分不平滑（给位移加分辨率）。

**面工具**（`faces.js`）：`inset(sel, amount, depth, { tag, rim, attr })`、`extrude(sel, dist | vector, { individual, side })`、`solidify(t)`。

**变形与复制**（`deform.js`）：`warp(fn)`、`jitter(amount, scale, seed)`（三维平滑噪声，共享顶点一起动，不会撕开）、`taper(k, y0, y1)`、`twist(angle, y0, y1)`、`bend(angle, y0, y1)`、`array(count, vector | Matrix4)`、`mirror(axis, { weld })`、`weld(eps)`。

**变换与组合**（`mesh.js`）：`translate` `scale` `rotate(axis, angle)` `place(c, ax, ay, az)` `transform(Matrix4)`（镜像变换会自动翻面）、`merge(...polys)`、`set(attr, sel)`、`clone()`、`bounds()`、`volume()`。

**烘焙**（`output.js`）：`poly.toMB(mb, { at, color, card, smooth = 50, shade, sway, v0 })`。法线按面积加权、在软边围成的扇区里求平均（硬边阈值 `smooth` 度），大平面保持平整，倒角和曲面平滑过渡；uv 在每个面的标架里按米计（u 水平或面的 `u`，v 向上或沿坡；`v0` 给灰泥这类需要「离墙脚高度」的材质加偏移）；凸面扇形三角化，凹面在面内耳切。`bake(poly)` 和 `emit(mb, baked, opts)` 是它的两半：同一个零件反复出现时（同尺寸的木方），烘焙一次、缓存，之后只 `emit`，`buildings.js` 的倒棱木方就是这样做的。

## 怎样加一个工具

工具就是一个函数，注册到 `Poly` 上：

```js
// src/objects/poly/my-tool.js
import { Poly } from './mesh.js';

// 把选中的面往外鼓起 h（中心点抬高），返回值随意：改 poly 本身即可
Poly.op('puff', (p, sel, h) => {
  const made = [];
  for (const fi of p.pick(sel)) {
    const f = p.F[fi], c = p.vert(p.center(f).addScaledVector(p.normal(f), h)), v = f.v;
    f.v = [v[0], v[1], c];                                  // 原来的面变成第一块
    for (let k = 1; k < v.length; k++) made.push(p.face([v[k], v[(k + 1) % v.length], c], { card: f.card, col: f.col, tag: f.tag }));
    made.push(fi);
  }
  p.last = made;
});
```

然后在 `index.js` 里 `import './my-tool.js';`，就能链式调用：`Poly.box(1, 1, 1).puff('py', 0.2).bevel({ width: 0.02 })`。约定：

- 函数签名 `(poly, ...参数)`，就地修改 `poly`（也可以返回一个新的 `Poly`，它的内容会替换原来的）。
- 新面继承来源面的 `card` `col` `u` `vDown` `tag`；新做出的面放进 `poly.last`。
- 保持流形和绕向（从外面看逆时针）：`test/poly.test.js` 的 `closed()` 检查每条有向边都有反向边、欧拉示性数、体积为正，新工具照着加一条测试。
- 基本体用 `Poly.make(name, fn)` 注册，返回新的 `Poly`。
- 已有工具可以随时改或扩展（加参数、换算法），只要保持上面的约定，用到它的模型不用跟着改。

## 用法建议

- **LOD 用同一段代码**：远景级别不要另写一份简化模型（布局、颜色一变，换级就会被看出来），而是把近景代码包在 `withDetail(lod, fn)` 里再跑一遍：比 `DETAIL.minBevel`（1 级 5cm、2 级 15cm）窄的倒角省掉、宽的只留一段斜面，细分少一级（1 级至少保留一级，圆的东西还是圆的），`lathe` / `cylinder` / `circle2` / `icosphere` 的分段按比例减少。所有随机数照常按顺序取，各级的布局和颜色完全一致。`village-props.js` 的道具都这样做；`buildings.js` 另用 `withChamfer(lod === 0, fn)` 让近景房屋的 `box` / `obox` / `beam` 自动带倒棱。换级效果用 `node tools/lod-check.mjs <kind>` 检查。
- **倒角宽度**跟零件尺寸走：木方 2–3cm，小件取最小边的 15–20%；`segments: 1` 加上加权法线已经像圆角，大件或特写才用 2–3 段。
- **打破完美**：`jitter` 给木头、石头一点不规则（幅度为尺寸的 3–7%），石块用「细分 + 折痕 + 噪声」。
- **缓存**：同尺寸零件重复很多时，`bake` 一次、`emit` 多次。

## 参考

- Blender 手册：[修改器](https://docs.blender.org/manual/en/latest/modeling/modifiers/index.html)、[Bevel 修改器](https://docs.blender.org/manual/en/latest/modeling/modifiers/generate/bevel.html)、[Subdivision Surface](https://docs.blender.org/manual/en/latest/modeling/modifiers/generate/subdivision_surface.html)、[网格编辑工具](https://docs.blender.org/manual/en/latest/modeling/meshes/editing/index.html)、[几何节点](https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/index.html)
- 中模工作流（倒角 + 加权法线代替烘焙）：Polycount 讨论 [1](https://polycount.com/discussion/comment/2760612)、[2](https://polycount.com/discussion/comment/2500571)
- 布尔运算备选：[manifold-3d](https://www.npmjs.com/package/manifold-3d)（WASM，保证流形，含 extrude / revolve / smooth / refine）、[three-bvh-csg](https://www.npmjs.com/package/three-bvh-csg)
