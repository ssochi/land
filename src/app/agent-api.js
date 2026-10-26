// window.mapEditor: the console / headless-browser interface agents drive the editor with.
import { heightAt, slopeAt } from '../world/grid.js';
import { ensureWater, waterInfo } from '../water/water.js';
import { listInstances } from '../objects/placement.js';
import { KIND_DOCS } from '../objects/kinds.js';
import { SCHEMA, SIGS } from '../runtime/schema.js';
import { U } from '../render/uniforms.js';

export function installAgentAPI(ed, canvas) {
  window.mapEditor = {
    get source() { return ed.sceneFn ? ed.sceneFn.toString() : ''; },
    schema: SCHEMA, signatures: SIGS, kinds: KIND_DOCS,
    run: fn => ed.build(fn),
    rerun: () => ed.build(ed.sceneFn),
    report: () => ed.report,
    heightAt: (x, z) => +heightAt(x, z).toFixed(3),
    slopeAt: (x, z) => +slopeAt(x, z).toFixed(3),
    waterAt: (x, z) => { ensureWater(); return waterInfo(x, z); },
    camera: c => typeof c === 'string' ? ed.setCamera(c) : ed.setCamera(Object.assign({ eye: 2.5, lookEye: 2 }, c)),
    view: v => ed.setView(v),
    instances: (kind, limit) => listInstances(kind, limit),
    pause: (on) => { ed.paused = on !== false; return ed.paused; },
    step: (sec) => ed.step(sec),
    snapshot: () => { ed.renderFrame(); return canvas.toDataURL('image/png'); },
    // first person
    walk: (o) => ed.walk(o),
    orbit: () => { ed.orbit(); return ed.player(); },
    input: (o) => ed.setInput(o),
    player: () => ed.player(),
    // escape hatch for debugging: the live three.js objects and shared uniforms
    debug: { renderer: ed.renderer, scene: ed.scene, camera: ed.camera, controls: ed.controls, uniforms: U, world: () => ed.worldGroup() }
  };
}
