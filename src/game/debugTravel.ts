import { getGame, setGame } from "./store";
import { rt, resetRuntime } from "./runtime";
import { resetCombat, travelCombat, cb } from "./combat";
import { applyWorld } from "./flow/story";
import { debugEnabled } from "./debugAccess";
import { cancelDebugScripts } from "./debugLifecycle";
import { placePlayer, goToTarget, travelTarget } from "./travel";
import { gatesOf, isWalkable, nearestWalkable, PLAYER_R } from "./world/collision";
import { DEBUG_DESTINATIONS, progressForDestination } from "./logic/debugProgress";
export { DEBUG_DESTINATIONS } from "./logic/debugProgress";

function clearInteraction() {
  cancelDebugScripts();
  rt.player.frozen = rt.player.riding = false;
  rt.player.climbY = null;
  rt.player.action = null;
  rt.joy.x = rt.joy.y = 0;
  cb.move = null; cb.hold = cb.touchHold = false;
  setGame({ screen: "game", mode: "explore", focus: null, prompt: null, line: null, panel: null, drawing: false, discovering: null, friendCard: null, banner: null, journalOpen: false, settingsOpen: false, fade: 0, hint: null });
  rt.camera.mode = "follow";
  rt.camera.shot = null;
}

export function jumpDebug(id: string) {
  if (!debugEnabled) return;
  const destination = DEBUG_DESTINATIONS.find(d => d.id === id);
  if (!destination) return;
  const progress = progressForDestination(id, getGame().progress);
  clearInteraction();
  const seconds = rt.playTime;
  resetRuntime();
  rt.playTime = seconds;
  setGame({ progress });
  rt.world = progress.act3.world;
  resetCombat();
  // Restore Maple and other destination targets before placing, then gather
  // companions around the final player position using the save-load path.
  applyWorld(progress);
  if (destination.target === "beach" || destination.target === "volcanoTrail" || destination.area) {
    const at = travelTarget(destination.target)!;
    placePlayer(at.x, at.z, at.x, at.z + 1);
  } else goToTarget(destination.target);
  applyWorld(progress);
}

export function switchDebugWorld(world: "home" | "cloud") {
  if (!debugEnabled || rt.world === world) return;
  jumpDebug(world === "cloud" ? "cloud:cloudDock" : "voyage");
}

export function teleportDebug(x: number, z: number, world: "home" | "cloud" = rt.world) {
  if (!debugEnabled || !Number.isFinite(x) || !Number.isFinite(z)) return;
  switchDebugWorld(world);
  clearInteraction();
  const at = nearestDebugGround(x, z);
  placePlayer(at.x, at.z, at.x + Math.sin(rt.player.yaw), at.z + Math.cos(rt.player.yaw));
  travelCombat();
  applyWorld(getGame().progress);
}

/** Project onto valid terrain even when flight or a map click is far offshore. */
export function nearestDebugGround(x: number, z: number): { x: number; z: number } {
  if (!debugEnabled) return { x: rt.player.x, z: rt.player.z };
  const gates = gatesOf(getGame().progress);
  let at = nearestWalkable(x, z, PLAYER_R, gates);
  // The gameplay helper searches a local radius. Map clicks can land in the
  // open sea, so find a valid world point if that local search exhausts it.
  if (!isWalkable(at.x, at.z, gates, PLAYER_R)) {
    let best = Infinity;
    const bounds = rt.world === "cloud" ? { x0: -36, x1: 36, z0: -10, z1: 182 } : { x0: -40, x1: 125, z0: -338, z1: 20 };
    for (let pz = bounds.z0; pz <= bounds.z1; pz += .5) for (let px = bounds.x0; px <= bounds.x1; px += .5) {
      const distance = (px - x) ** 2 + (pz - z) ** 2;
      if (distance < best && isWalkable(px, pz, gates, PLAYER_R)) { at = { x: px, z: pz }; best = distance; }
    }
  }
  return at;
}
