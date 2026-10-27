// DOM side of the editor: loading stage, build report drawer, API reference, camera chips, sliders.
import { SCHEMA, SIGS } from '../runtime/schema.js';
import { KIND_DOCS } from '../objects/kinds.js';

export const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const VIEWS = [['正常', 0], ['坡度', 1], ['等高', 2], ['侵蚀', 3], ['离水距离', 4], ['汇流', 5]];

export const stage = t => { $('loadStage').textContent = t; };
export const hideLoading = () => $('loading').classList.add('done');
export const showLoading = title => { $('loadTitle').textContent = title; stage('准备'); $('loading').classList.remove('done'); };

export function renderReport(r, view, onView) {
  const dot = $('statusDot');
  dot.className = 'dot ' + (r.errors.length ? 'err' : r.warnings.length ? 'warn' : 'ok');
  $('mapName').textContent = r.name;
  $('mapMeta').textContent = `scene.js · ${r.ops.length} 次调用 · 构建 ${(r.buildMs / 1000).toFixed(1)}s`;
  document.title = r.name;
  const c = r.counts;
  const trees = ['tree.oak', 'tree.birch', 'tree.pine'].reduce((a, k) => a + (c[k] || 0), 0);
  const flowers = Object.keys(c).filter(k => k.startsWith('flower.')).reduce((a, k) => a + c[k], 0);
  const lake = r.water.find(w => w.type === 'lake');
  $('paneReport').innerHTML = `
    <div class="kv">
      <div><span>树</span><b>${trees.toLocaleString()}</b></div>
      <div><span>花</span><b>${flowers.toLocaleString()}</b></div>
      <div><span>草叶</span><b>${((c.grassBlades || 0) / 10000).toFixed(1)} 万</b></div>
      <div><span>细节高差</span><b>${r.terrain.detail.min}–${r.terrain.detail.max}m</b></div>
      <div><span>远景最高</span><b>${r.terrain.far.max}m</b></div>
      <div><span>湖面</span><b>${lake ? lake.level + 'm' : '—'}</b></div>
    </div>
    ${r.errors.length || r.warnings.length ? `<div class="msgs">${r.errors.map(m => `<p class="err">${esc(m)}</p>`).join('')}${r.warnings.map(m => `<p class="warn">${esc(m)}</p>`).join('')}</div>` : ''}
    ${r.logs.length ? `<h3>m.log 输出</h3><pre class="api">${r.logs.map(esc).join('\n')}</pre>` : ''}
    <h3>调试视图</h3>
    <div class="views">${VIEWS.map(([l, v]) => `<button type="button" class="chip" data-view="${v}" aria-pressed="${view === v}">${l}</button>`).join('')}</div>
    <h3>调用记录</h3>
    <div class="ops">${r.ops.map(o => `<div class="op ${o.status}"><i>${o.line != null ? 'L' + o.line : o.i}</i><span class="name">${esc(o.call)}</span><em>${o.ms}ms</em>${o.note ? `<span class="note">${esc(o.note)}</span>` : ''}</div>`).join('')}</div>`;
  $('paneReport').querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { onView(+b.dataset.view); }));
}

export function markView(v) { document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.view === v))); }

function renderSchema() {
  const order = ['noise', 'mountains', 'peak', 'hill', 'flatten', 'plateau', 'terrace', 'smooth', 'erode', 'thermal', 'apply', 'river', 'lake', 'path', 'village', 'building', 'fence', 'field', 'scatter', 'place', 'grass', 'env', 'camera'];
  $('paneSchema').innerHTML = `<p class="lead">场景写在 <code>scene.js</code> 里：<code>defineScene((m) =&gt; { … })</code>。每个调用都立即执行，后面的代码能马上查询结果；出错时报告会给出行号。下面列出参数，缺省取默认值，写错参数名会收到警告。</p>
<pre class="api">defineScene((m) =&gt; {
  const t = m.terrain;
  t.peak(-250, -520, { radius: 300, height: 230 });
  t.lower(15, -80, 62, 15);
  const creek = m.water.river([[122, -128], [84, -104], [40, -86]], { width: 6 });
  const lake = m.water.lake(15, -80);           // { level, area } | null
  for (const [x, z, y, tx, tz] of creek.points(12))
    m.place('tree.birch', x - tz * 10, z + tx * 10);
  m.camera('hero', { at: [-84, -28], eye: 4, look: [25, -140], lookEye: 10 });
});</pre>
  <div class="schema">${order.map(k => { const d = SCHEMA[k]; return `<section><header><code>${esc(SIGS[k])}</code></header><p>${esc(d.desc)}</p><dl>${Object.entries(d.params).filter(([pk]) => !['x', 'z', 'kind', 'name', 'path'].includes(pk)).map(([pk, [t, df, ds]]) => `<dt>${pk}</dt><dd>${esc(ds || t)}${df !== undefined && df !== null ? ` · 默认 ${esc(JSON.stringify(df))}` : ''}</dd>`).join('')}</dl></section>`; }).join('')}
  <section><header><code>查询与辅助</code></header><dl>
    <dt>m.heightAt(x, z)</dt><dd>地面高度，随地形修改实时更新</dd>
    <dt>m.slopeAt(x, z)</dt><dd>0 平地 · 1 垂直</dd>
    <dt>m.normalAt(x, z)</dt><dd>[nx, ny, nz]</dd>
    <dt>m.waterAt(x, z)</dt><dd>{ level, depth, dist }，dist 为到最近水面的米数</dd>
    <dt>m.flowAt(x, z)</dt><dd>汇流强度 0–1（log 上游面积，1 ≈ 1 km²）</dd>
    <dt>m.moistureAt(x, z)</dt><dd>湿度 0–1：汇流、近水、低海拔合成，与 rules.moisture 同一函数</dd>
    <dt>m.sunAt(x, z)</dt><dd>坡向日照 0–1，平地 0.5，与 rules.sun 同一函数</dd>
    <dt>m.noise(x, z, opts)</dt><dd>0–1 的 fbm 噪声，与 rules.noise 同一函数</dd>
    <dt>m.random(seed)</dt><dd>可复现随机数；附 .range(a, b) .pick(arr) .chance(p)</dd>
    <dt>m.circle / ring / rect / polygon</dt><dd>区域，用作 scatter 的 area</dd>
    <dt>m.log(…)</dt><dd>写入报告的 m.log 输出</dd>
    <dt>m.name(s)</dt><dd>场景名</dd>
    <dt>m.kinds · m.bounds</dt><dd>模型清单；细节网格 ±160m、远景网格 ±1100m</dd>
  </dl></section>
  <section><header><code>模型库 kind</code></header><dl>${Object.entries(KIND_DOCS).map(([k, d]) => `<dt>${k}</dt><dd>${esc(d)}</dd>`).join('')}</dl></section></div>`;
}

function renderApi() {
  $('paneApi').innerHTML = `<p class="lead">页面加载后 <code>window.mapEditor</code> 可在控制台或无头浏览器里使用。构建完成时 <code>window.__mapReady</code> 为 true，控制台打印一行 <code>MAP_REPORT {json}</code>。</p>
<pre class="api">mapEditor.run(m =&gt; { … })    // 用新脚本整体重建，返回报告
mapEditor.rerun()             // 用当前脚本重建
mapEditor.source              // 当前 scene.js 函数源码
mapEditor.report()            // 结构化报告：调用、行号、告警、计数
mapEditor.heightAt / slopeAt / waterAt (x, z)
mapEditor.instances(kind, n)  // 已放置物件 [[x, z, scale], …]
mapEditor.camera(name | {pos, target} | {at, eye, look, lookEye})
mapEditor.view(0..5)          // 正常/坡度/等高/侵蚀/离水/汇流
mapEditor.pause(true)         // 暂停动画循环（无头渲染用）
mapEditor.step(sec)           // 推进风与风痕
mapEditor.snapshot()          // 渲染一帧并返回 PNG dataURL
mapEditor.walk({ x, z, yaw, pitch, fly })   // 进入第一人称（参数都可省略）
mapEditor.input({ forward, right, sprint, up, down, jump, fly })  // 模拟按键；jump / fly 为单次触发
mapEditor.player()            // 位置、速度、是否着地 / 飞行 / 游泳
mapEditor.orbit()             // 回到环绕镜头</pre>
<p class="lead">第一人称：<code>V</code> 切换，<code>WASD</code> 移动，<code>Shift</code> 冲刺，<code>空格</code> 跳跃，<code>F</code> 或双击空格飞行（空格上升、<code>C</code> 下降），点击画面锁定鼠标，<code>Esc</code> 释放。</p>`;
}

export function renderCams(presets, onSelect) {
  $('cams').innerHTML = presets.map(c => `<button type="button" class="chip" data-cam="${esc(c.name)}" aria-pressed="false">${esc(c.label || c.name)}</button>`).join('');
  $('cams').querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => onSelect(b.dataset.cam)));
}

export function setWalkMode(on, touch) {
  $('walkBtn').setAttribute('aria-pressed', String(on));
  $('fpHud').hidden = !on; $('touchPad').hidden = !(on && touch);
  $('fpHint').classList.toggle('touch', !!touch);
  document.body.classList.toggle('walking', on);
  if (on) markCam(null);
}

export function setWalkState(t) { const el = $('fpState'); if (el.textContent !== t) el.textContent = t; }

export function markCam(name) { document.querySelectorAll('#cams .chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cam === name))); }

function syncSliders() { ['todInput', 'windInput'].forEach(id => { const el = $(id); el.style.setProperty('--fill', (el.value / el.max * 100) + '%'); }); $('windOut').textContent = (+$('windInput').value).toFixed(2); }

export function setControls(time, wind) { $('todInput').value = time; $('windInput').value = wind; syncSliders(); }

export function showTimeOfDay(label, fogHex) { $('todOut').textContent = label; document.body.style.background = '#' + fogHex; }

// static panes, drawer tabs and slider wiring; handlers receive the new slider value
export function initUI({ onTime, onWind, onWalk }) {
  renderSchema(); renderApi();
  $('walkBtn').addEventListener('click', e => { e.currentTarget.blur(); onWalk(); });
  const tabs = [['tabReport', 'paneReport'], ['tabSchema', 'paneSchema'], ['tabApi', 'paneApi']];
  tabs.forEach(([t, p]) => $(t).addEventListener('click', () => tabs.forEach(([t2, p2]) => { $(t2).setAttribute('aria-selected', String(t2 === t)); $(p2).hidden = p2 !== p; })));
  $('reportBtn').addEventListener('click', () => { const d = $('drawer'), open = d.hidden; d.hidden = !open; $('reportBtn').setAttribute('aria-expanded', String(open)); });
  $('todInput').addEventListener('input', e => { onTime(+e.target.value); syncSliders(); });
  $('windInput').addEventListener('input', e => { onWind(+e.target.value); syncSliders(); });
}
