# 参考截图

`tools/compare.mjs` 用来把场景和旷野之息的实际截图并排对比，并给出可量化的差距（明暗范围、饱和度、天空和植被颜色、冷暖、细节频段）。

- `sources.json`：每张参考图的来源、对应的对照场景（`scenes/ref/`）、镜头名，以及要从统计里排除的 HUD 区域（`mask`，按画面比例 `[x0, y0, x1, y1]`）。
- 图片本身不进仓库（版权属于任天堂，这里只用于对比分析）。用 `node tools/fetch-refs.mjs` 下载到本目录，或按 `page` 里的链接手动下载，存成 `file` 指定的文件名。

```bash
node tools/fetch-refs.mjs            # 下载全部参考图
node tools/compare.mjs faron         # 渲染 scenes/ref/faron.js 的 ref 镜头，输出 out/compare/faron.png 和指标表
node tools/compare.mjs my.jpg --scene scene.js --camera hero   # 任意图片 + 任意场景镜头
```
