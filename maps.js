// 主界面上的地图（index.html 在引擎之前加载本文件）。每张地图是一份调用 defineScene(fn) 的场景脚本；
// thumb 是 `node tools/thumbs.mjs` 用该地图的 camera 镜头渲染的预览图。顺序就是主界面上的顺序。
// 打开页面时加 ?map=<id> 可以跳过主界面直接进入某张地图。
defineMaps([
  { id: 'jinghu', file: 'scene.js', title: '镜湖原野', camera: 'hero', thumb: 'docs/maps/jinghu.jpg',
    desc: '湖畔山谷：台地上的瀑布泻入镜湖，溪流、白桦和土路，遗迹与山丘上的瞭望塔，四周是雪山和松林。' },
  { id: 'hateno', file: 'scenes/village.js', title: '哈特诺式山村', camera: 'overview', thumb: 'docs/maps/hateno.jpg',
    desc: '坐在一块块岩台上的村子：灰泥墙、陶土瓦、高烟囱，方塔村长家和带翼楼的旅馆围着前院。时间拨到 1.0 以后窗户和路灯亮起。' },
  { id: 'faron', file: 'scenes/ref/faron.js', title: '法罗尼草原', camera: 'wide', thumb: 'docs/maps/faron.jpg',
    desc: '对照旷野之息构图：草坡、长苔的圆石和松树，土路翻过山脊通向远处的塔，谷地里起雾。' },
  { id: 'hills', file: 'scenes/ref/hills.js', title: '起伏草丘', camera: 'ref', thumb: 'docs/maps/hills.jpg',
    desc: '海拉鲁平原式的缓丘：落叶小路、一排石墩、云影掠过草地，大阔叶树撑住画面一角。' },
  { id: 'ruins', file: 'scenes/ref/ruins.js', title: '遗迹日落', camera: 'ref', thumb: 'docs/maps/ruins.jpg',
    desc: '日落逆光下开满白花的草地，残墙、石柱和台阶，逆光的大树，远处雾中的台地。' },
  { id: 'rocks', file: 'scenes/ref/rocks.js', title: '法罗尼岩壁', camera: 'ref', thumb: 'docs/maps/rocks.jpg',
    desc: '傍晚的缓坡草地夹在高大的岩壁和浑圆的岩峰之间，看岩面的起伏、裂隙和冷暖。' }
]);
