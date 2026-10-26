// Build-session flags shared by the scene runtime and the lazily derived fields.
// `terrainVer` is bumped on every terrain edit; caches (flow, blended heights) compare against it.

export const world = { terrainVer: 0, waterDirty: false, waterTouched: false, objectsTouched: false };

export function terrainChanged() {
  world.terrainVer++;
  if (world.waterTouched) world.waterDirty = true;
}

export function resetWorldState() {
  world.terrainVer = 0; world.waterDirty = false; world.waterTouched = false; world.objectsTouched = false;
}
