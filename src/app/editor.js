// The editor: owns the three.js scene, runs scene scripts into it, and renders frames.
// build(fn) = reset world -> run script -> settle water -> build meshes -> apply env -> report.
import * as THREE from 'three';
import { isSmall, reduceMotion } from '../platform.js';
import { clamp } from '../core/math.js';
import { heightAt } from '../world/grid.js';
import { currentB } from '../water/water.js';
import { distributeGrass } from '../objects/grass.js';
import { cachedGeometries } from '../objects/kinds.js';
import { validate } from '../runtime/schema.js';
import { newSession, resetWorld, runScript, settleWater, terrainSummary } from '../runtime/generate.js';
import { U, PAL, ROCK_TINT } from '../render/uniforms.js';
import { computeHorizon } from '../render/horizon.js';
import { createSky } from '../render/sky.js';
import { terrainMat, buildTerrainMeshes, setTerrainTextures } from '../render/terrain-mesh.js';
import { buildWaterMeshes, MIST_PX } from '../render/water-mesh.js';
import { createReflection } from '../render/reflection.js';
import { buildInstances, setPropTextures } from '../render/props.js';
import { createGrass } from '../render/grass.js';
import { createLights } from '../render/lights.js';
import { buildSmoke } from '../render/smoke.js';
import { bakeTextures } from '../render/texgen.js';
import { createStreaks } from '../render/wind-streaks.js';
import { createPollen } from '../render/pollen.js';
import { atmosphere, applyTOD, todLabel } from '../render/time-of-day.js';
import { createShadows } from '../render/shadows.js';
import { createPost } from '../render/post.js';
import { createControls, resolveCam, surfaceAt } from './camera.js';
import { createPointerPush } from './pointer.js';
import { WALK, createWalker, stepWalker, walkerView, walkerState } from './walker.js';
import { createFirstPersonInput } from './first-person.js';
import * as ui from './ui.js';

const tick = () => new Promise(r => requestAnimationFrame(() => r()));

export function createEditor(renderer, canvas) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.2, 4000);
  const sky = createSky(scene);
  const controls = createControls(camera, canvas);
  const streaks = createStreaks(scene, camera, controls);
  const pollen = createPollen(scene, renderer);
  const shadows = createShadows(renderer, scene, camera, controls);
  const post = createPost(renderer, scene, camera);
  const reflection = createReflection(renderer, scene, camera);
  const grass = createGrass(scene), lights = createLights();
  const textures = bakeTextures(renderer);
  setTerrainTextures(textures); setPropTextures(textures);
  MIST_PX.value = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
  const pointer = createPointerPush(canvas, camera);

  const ed = { built: false, paused: false, sceneFn: null, report: null, cameras: [], scene, camera, controls, renderer, mode: 'orbit', textures };
  let worldGroup = null, props = null;

  // ── first person ─────────────────────────────────────
  const ORBIT_FOV = 45, WALK_FOV = 62, touch = matchMedia('(pointer: coarse)').matches;
  let walker = null;
  const fp = createFirstPersonInput(canvas, {
    active: () => ed.mode === 'walk',
    onToggle: () => (ed.mode === 'walk' ? exitWalk() : enterWalk()),
    onLook: (dyaw, dpitch) => { walker.yaw += dyaw; walker.pitch = fp.clampPitch(walker.pitch + dpitch); }
  });

  // o: { x, z, yaw, pitch, fly } — anything omitted comes from the current camera; entering from high above starts in flight
  function enterWalk(o = {}) {
    if (!ed.built) return null;
    const d = camera.getWorldDirection(new THREE.Vector3());
    const x = o.x != null ? o.x : camera.position.x, z = o.z != null ? o.z : camera.position.z;
    const fly = o.fly != null ? !!o.fly : o.x == null && camera.position.y - heightAt(x, z) > 8;
    walker = createWalker(x, z, { yaw: o.yaw != null ? o.yaw : Math.atan2(-d.x, -d.z), pitch: o.pitch != null ? o.pitch : Math.asin(clamp(d.y, -1, 1)) * 0.5,
      y: fly ? (o.x == null ? camera.position.y : heightAt(x, z) + 20) - WALK.eye : null, flying: fly });
    ed.mode = 'walk'; controls.enabled = false;
    camera.fov = WALK_FOV; camera.updateProjectionMatrix();
    ui.setWalkMode(true, touch);
    applyWalker(); shadows.invalidate(); streaks.respawnAll();
    return walkerState(walker);
  }

  function exitWalk() {
    if (ed.mode !== 'walk') return;
    ed.mode = 'orbit'; fp.release();
    const v = walkerView(walker);
    controls.target.set(v.x + v.dx * 10, v.y + v.dy * 10, v.z + v.dz * 10);
    camera.fov = ORBIT_FOV; camera.updateProjectionMatrix();
    controls.enabled = true; controls.update();
    ui.setWalkMode(false);
  }

  // place the camera at the walker's eye; the orbit target follows the gaze so shadows, wind streaks and
  // pollen stay centred on what the player looks at
  function applyWalker() {
    const v = walkerView(walker);
    camera.position.set(v.x, v.y, v.z);
    controls.target.set(v.x + v.dx * 8, v.y + v.dy * 8, v.z + v.dz * 8);
    camera.lookAt(controls.target);
    const fov = WALK_FOV + (walker.sprinting ? (walker.flying ? 12 : walker.swimming ? 2 : 7) : 0);   // speed kick
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * 0.15; camera.updateProjectionMatrix(); }
    ui.setWalkState(walker.flying ? (walker.sprinting ? '疾飞' : '飞行') : walker.swimming ? '游泳' : !walker.grounded ? '空中' : walker.sprinting ? '冲刺' : '步行');
  }

  function updateWalker(dt) {
    for (let t = dt; t > 1e-6; t -= 1 / 60) stepWalker(walker, Math.min(t, 1 / 60), fp.input);   // fixed substeps
    applyWalker();
  }

  // scripted input for agents and headless runs: held values persist, jump / fly fire once
  function setInput(o = {}) {
    const i = fp.input;
    for (const k of ['forward', 'right']) if (o[k] != null) i[k] = clamp(+o[k], -1, 1);
    for (const k of ['sprint', 'up', 'down']) if (o[k] != null) i[k] = !!o[k];
    if (o.jump) i.jump = true;
    if (o.fly) i.toggleFly = true;
    return Object.assign({}, i);
  }

  function setTimeOfDay(v) { applyTOD(v); ui.showTimeOfDay(todLabel(v), U.uFogColor.value.getHexString()); }

  function setView(v) { U.uDebug.value = v; ui.markView(v); }

  function setCamera(name) {
    const c = typeof name === 'string' ? ed.cameras.find(q => q.name === name) : name;
    if (!c) return false;
    exitWalk();
    const { pos, tgt } = resolveCam(c);
    camera.fov = c.fov || ORBIT_FOV; camera.updateProjectionMatrix();
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
    // rock colour relative to what the cliffs average as painted (baked texture × strata tints × cavity), so the
    // given colour is roughly what a sunlit cliff ends up as
    const rk = new THREE.Color(E.rock || '#977d69'), ref = new THREE.Color('#977d69');
    ROCK_TINT.value.set(rk.r / ref.r, rk.g / ref.g, rk.b / ref.b);
    streaks.visible = E.streaks && !reduceMotion; pollen.pts.visible = E.pollen;
    if (E.grass) for (const k of ['root', 'mid', 'tipA', 'tipB']) if (E.grass[k]) PAL[k].set(E.grass[k]);
    if (E.water) for (const k of ['shallow', 'deep']) if (E.water[k]) PAL[k].set(E.water[k]);
    ui.setControls(E.time, U.uWind.value); setTimeOfDay(E.time);
  }

  async function build(fn) {
    exitWalk();
    ed.built = false; window.__mapReady = false;
    const t0 = performance.now();
    ed.sceneFn = fn;
    const session = newSession(), report = session.report;
    ed.report = report; ed.cameras = session.cameras;
    resetWorld(); atmosphere.fogOverride = null; grass.setField(null);
    if (worldGroup) {
      const keep = cachedGeometries();
      worldGroup.traverse(o => { if (o.geometry && !keep.has(o.geometry)) o.geometry.dispose(); });
      scene.remove(worldGroup);
    }
    worldGroup = new THREE.Group(); scene.add(worldGroup);

    ui.stage('运行 scene.js'); await tick();
    await runScript(fn, session);

    const tf = performance.now();
    ui.stage('生成水体与物件'); await tick();
    settleWater(report);
    props = buildInstances(worldGroup); report.counts = props.counts;
    lights.set(props.lights); buildSmoke(worldGroup, props.smoke);
    ui.stage('种草'); await tick();
    const gf = distributeGrass(isSmall ? 0.35 : 0.6);
    grass.setField(gf.field); report.counts.grassBlades = gf.total;

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
    ed.built = true; window.__mapReady = true; unitsChecked = false;
    console.log('MAP_REPORT ' + JSON.stringify(report));
    return report;
  }

  function renderFrame() {
    if (ed.mode !== 'walk') {
      controls.update();
      const g = surfaceAt(camera.position.x, camera.position.z) + 0.6;  // keep the camera above ground and water
      if (camera.position.y < g) camera.position.y = g;
    }
    sky.position.copy(camera.position);
    U.uFogDensity.value = atmosphere.fogBase;
    pollen.m.uniforms.uCenter.value.set(controls.target.x, heightAt(controls.target.x, controls.target.z), controls.target.z);
    grass.update(camera); if (props) props.update(camera); lights.update(camera); shadows.update(); reflection.update(); post.render();
    if (ed.built && !unitsChecked) { unitsChecked = true; checkTextureUnits(); }
  }

  // WebGL only guarantees 16 texture units per shader and most GPUs (Windows/ANGLE, Mac, phones) stop there: a
  // material that samples more fails to compile and silently disappears. Headless SwiftShader allows 32, so
  // test renders would look fine; report it loudly instead (tools/render.mjs prints console errors).
  let unitsChecked = false;
  function checkTextureUnits() {
    const gl = renderer.getContext(), SAMPLERS = [0x8B5E, 0x8B60, 0x8B5F, 0x8B62, 0x8DC1], over = [];   // 2D, cube, 3D, 2D shadow, 2D array
    for (const p of renderer.info.programs) {
      let units = 0;
      for (let i = 0, n = gl.getProgramParameter(p.program, gl.ACTIVE_UNIFORMS); i < n; i++) {
        const u = gl.getActiveUniform(p.program, i);
        if (u && SAMPLERS.includes(u.type)) units += u.size;
      }
      if (units > 16) over.push(`${p.name} (${units})`);
    }
    if (over.length) console.error(`[land] shader uses more than 16 texture units, many GPUs will not draw it: ${over.join(', ')}`);
  }

  // advance animation time by sec in fixed 50ms steps (deterministic headless stepping)
  function step(sec) { const n = Math.max(1, Math.round((sec || 0) / 0.05)); for (let i = 0; i < n; i++) { U.uTime.value += 0.05; if (ed.mode === 'walk') updateWalker(0.05); streaks.update(0.05); } }

  function resize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false); post.resize(); reflection.resize(); MIST_PX.value = renderer.getDrawingBufferSize(new THREE.Vector2()).y; }

  function start() {
    ui.initUI({ onTime: setTimeOfDay, onWind: v => { U.uWind.value = v; }, onWalk: () => (ed.mode === 'walk' ? exitWalk() : enterWalk()) });
    addEventListener('resize', resize);
    const clock = new THREE.Clock();
    const frame = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      U.uTime.value += dt;
      const walking = ed.mode === 'walk';
      if (ed.built && !ed.paused && walking) updateWalker(dt);
      pointer.update(dt, walking ? walker : null);
      if (ed.built && !ed.paused) { streaks.update(dt); renderFrame(); }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  return Object.assign(ed, { build, setCamera, setView, renderFrame, step, start, worldGroup: () => worldGroup, grassStats: () => grass.stats(),
    walk: enterWalk, orbit: exitWalk, setInput, player: () => (walker ? Object.assign({ mode: ed.mode }, walkerState(walker)) : { mode: ed.mode }) });
}
