// The editor: owns the three.js scene, runs scene scripts into it, and renders frames.
// build(fn) = reset world -> run script -> settle water -> build meshes -> apply env -> report.
import * as THREE from 'three';
import { isSmall, reduceMotion } from '../platform.js';
import { heightAt } from '../world/grid.js';
import { currentB } from '../water/water.js';
import { distributeGrass } from '../objects/grass.js';
import { cachedGeometries } from '../objects/kinds.js';
import { validate } from '../runtime/schema.js';
import { newSession, resetWorld, runScript, settleWater, terrainSummary } from '../runtime/generate.js';
import { U, PAL } from '../render/uniforms.js';
import { computeHorizon } from '../render/horizon.js';
import { createSky } from '../render/sky.js';
import { terrainMat, buildTerrainMeshes } from '../render/terrain-mesh.js';
import { buildWaterMeshes, MIST_PX } from '../render/water-mesh.js';
import { createReflection } from '../render/reflection.js';
import { buildInstances } from '../render/props.js';
import { BLADE_HI, BLADE_LO, buildGrassMeshes } from '../render/grass.js';
import { createStreaks } from '../render/wind-streaks.js';
import { createPollen } from '../render/pollen.js';
import { atmosphere, applyTOD, todLabel } from '../render/time-of-day.js';
import { createShadows } from '../render/shadows.js';
import { createPost } from '../render/post.js';
import { createControls, resolveCam, surfaceAt } from './camera.js';
import { createPointerPush } from './pointer.js';
import * as ui from './ui.js';

const tick = () => new Promise(r => requestAnimationFrame(() => r()));

export function createEditor(renderer, canvas) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 4000);
  const sky = createSky(scene);
  const controls = createControls(camera, canvas);
  const streaks = createStreaks(scene, camera, controls);
  const pollen = createPollen(scene, renderer);
  const shadows = createShadows(renderer, scene, camera, controls);
  const post = createPost(renderer, scene, camera);
  const reflection = createReflection(renderer, scene, camera);
  MIST_PX.value = renderer.getPixelRatio();
  const pointer = createPointerPush(canvas, camera);

  const ed = { built: false, paused: false, sceneFn: null, report: null, cameras: [], scene, camera, controls };
  let worldGroup = null;

  function setTimeOfDay(v) { applyTOD(v); ui.showTimeOfDay(todLabel(v), U.uFogColor.value.getHexString()); }

  function setView(v) { U.uDebug.value = v; ui.markView(v); }

  function setCamera(name) {
    const c = typeof name === 'string' ? ed.cameras.find(q => q.name === name) : name;
    if (!c) return false;
    const { pos, tgt } = resolveCam(c);
    camera.position.copy(pos); controls.target.copy(tgt); controls.update();
    ui.markCam(c.name || null);
    streaks.respawnAll();
    return true;
  }

  // m.env() settings -> uniforms, palette, effects, sliders
  function applyEnv(E) {
    atmosphere.fogOverride = E.fogDensity;
    atmosphere.haze = E.haze ? new THREE.Color(E.haze) : null;
    U.uHazeFar.value = E.hazeFar; U.uCloudCover.value = E.clouds; U.uGlare.value = E.glare;
    const vf = E.valleyFog || {};
    U.uVFog.value.set(vf.height != null ? vf.height : 0, vf.thickness || 12, E.valleyFog ? (vf.density != null ? vf.density : 0.02) : 0);
    U.uWind.value = reduceMotion ? Math.min(E.wind, 0.25) : E.wind; U.uWindDir.value.set(E.windDir[0], E.windDir[1]).normalize();
    terrainMat.uniforms.uSnowLine.value = E.snowLine;
    streaks.visible = E.streaks && !reduceMotion; pollen.pts.visible = E.pollen;
    if (E.grass) for (const k of ['root', 'mid', 'tipA', 'tipB']) if (E.grass[k]) PAL[k].set(E.grass[k]);
    if (E.water) for (const k of ['shallow', 'deep']) if (E.water[k]) PAL[k].set(E.water[k]);
    ui.setControls(E.time, U.uWind.value); setTimeOfDay(E.time);
  }

  async function build(fn) {
    ed.built = false; window.__mapReady = false;
    const t0 = performance.now();
    ed.sceneFn = fn;
    const session = newSession(), report = session.report;
    ed.report = report; ed.cameras = session.cameras;
    resetWorld(); atmosphere.fogOverride = null;
    if (worldGroup) {
      const keep = cachedGeometries();
      worldGroup.traverse(o => { if (o.geometry && !keep.has(o.geometry) && o.geometry !== BLADE_HI && o.geometry !== BLADE_LO) o.geometry.dispose(); });
      scene.remove(worldGroup);
    }
    worldGroup = new THREE.Group(); scene.add(worldGroup);

    ui.stage('运行 scene.js'); await tick();
    await runScript(fn, session);

    const tf = performance.now();
    ui.stage('生成水体与物件'); await tick();
    settleWater(report);
    report.counts = buildInstances(worldGroup);
    ui.stage('种草'); await tick();
    const grass = distributeGrass(isSmall ? 0.35 : 0.6);
    buildGrassMeshes(worldGroup, grass.chunks); report.counts.grassBlades = grass.total;

    ui.stage('生成地形网格'); await tick();
    U.uHzOn.value = 0;
    buildTerrainMeshes(worldGroup, currentB());
    reflection.setLakes(buildWaterMeshes(worldGroup));
    ui.stage('计算地形光照'); await tick();
    const th = performance.now(); computeHorizon(); U.uHzOn.value = 1; report.timing.horizon = Math.round(performance.now() - th);

    applyEnv(validate(Object.assign({ op: 'env' }, session.env)).p || validate({ op: 'env' }).p);
    if (!ed.cameras.length) ed.cameras.push(validate({ op: 'camera', name: 'default', at: [0, 30], look: [0, -30] }).p);

    report.terrain = terrainSummary();
    report.name = session.name;
    report.timing.finalize = Math.round(performance.now() - tf);
    report.buildMs = Math.round(performance.now() - t0);
    report.ok = report.errors.length === 0;
    report.cameras = ed.cameras.map(c => c.name);
    ui.renderReport(report, U.uDebug.value, setView); ui.renderCams(ed.cameras, setCamera);
    const hash = (location.hash || '').slice(1);
    setCamera(ed.cameras.find(c => c.name === hash) ? hash : ed.cameras[0].name);
    shadows.invalidate();
    ed.built = true; window.__mapReady = true;
    console.log('MAP_REPORT ' + JSON.stringify(report));
    return report;
  }

  function renderFrame() {
    controls.update();
    const g = surfaceAt(camera.position.x, camera.position.z) + 0.6;  // keep the camera above ground and water
    if (camera.position.y < g) camera.position.y = g;
    sky.position.copy(camera.position);
    U.uFogDensity.value = atmosphere.fogBase;
    pollen.m.uniforms.uCenter.value.set(controls.target.x, heightAt(controls.target.x, controls.target.z), controls.target.z);
    shadows.update(); reflection.update(); post.render();
  }

  // advance animation time by sec in fixed 50ms steps (deterministic headless stepping)
  function step(sec) { const n = Math.max(1, Math.round((sec || 0) / 0.05)); for (let i = 0; i < n; i++) { U.uTime.value += 0.05; streaks.update(0.05); } }

  function resize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false); post.resize(); reflection.resize(); }

  function start() {
    ui.initUI({ onTime: setTimeOfDay, onWind: v => { U.uWind.value = v; } });
    addEventListener('resize', resize);
    const clock = new THREE.Clock();
    const frame = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      U.uTime.value += dt;
      pointer.update(dt);
      if (ed.built && !ed.paused) { streaks.update(dt); renderFrame(); }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  return Object.assign(ed, { build, setCamera, setView, renderFrame, step, start, worldGroup: () => worldGroup });
}
