import { getGame, setGame } from "../store";
import { rt } from "../runtime";
import { groundY } from "../world/island";
import type { Vec2 } from "../types";
import { DebugScriptCancelled, debugScriptEpoch, debugWait } from "../debugLifecycle";

/**
 * Scripted moments (conversations, powers, the intro and ending) run one at a
 * time. While one runs the mode is "busy": walking stops, and prompts and
 * dialogue return to "busy" when they close. Whatever happens, the player gets
 * control and the follow camera back at the end.
 */

let running: number | null = null;

export function isRunning() {
  return running !== null && running === debugScriptEpoch();
}

export async function run(fn: () => Promise<void>): Promise<void> {
  if (isRunning()) return;
  const generation = debugScriptEpoch();
  running = generation;
  setGame({ mode: "busy", focus: null });
  rt.joy.x = rt.joy.y = 0;
  try {
    await fn();
  } catch (error) {
    if (!(error instanceof DebugScriptCancelled)) throw error;
  } finally {
    if (generation !== debugScriptEpoch()) return;
    running = null;
    rt.player.frozen = false;
    rt.camera.mode = "follow";
    rt.camera.shot = null;
    rt.followSide = 1;
    if (getGame().screen === "game") setGame({ mode: "explore", line: null, prompt: null });
  }
}

/** Hold a fixed camera shot. */
export function shot(pos: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }) {
  rt.camera.mode = "shot";
  rt.camera.shot = { pos, target };
}

export function follow() {
  rt.camera.mode = "follow";
  rt.camera.shot = null;
}

/**
 * A three-quarter shot over the player's (a) shoulder toward someone they talk
 * to (b), so the monster's face is in view, from the side the camera is
 * already on. The target sits low so the panel at the bottom of the screen
 * does not cover either of them.
 */
export function frameTwo(a: Vec2, b: Vec2, zoom = 1) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  let px = -uz;
  let pz = ux;
  // Prefer the side the camera is on, with a nudge toward the sea (south) so the jungle is the backdrop.
  const cx = rt.camera.pos.x - a.x;
  const cz = rt.camera.pos.z - a.z + 2;
  let sign = 1;
  if (px * cx + pz * cz < 0) {
    px = -px;
    pz = -pz;
    sign = -1;
  }
  // The companion steps round to the far side of the player, out of the shot.
  rt.followSide = -sign;
  const back = (2.2 + len * 0.5) * zoom;
  const side = (3 + len * 0.35) * zoom;
  const gy = groundY(a.x, a.z);
  shot(
    { x: a.x - ux * back + px * side, y: gy + 2.2 * zoom, z: a.z - uz * back + pz * side },
    { x: a.x + ux * len * 0.62, y: gy + 0.55, z: a.z + uz * len * 0.62 }
  );
}

/** Face the player toward a point (instant). */
export function facePlayer(p: Vec2) {
  rt.player.yaw = Math.atan2(p.x - rt.player.x, p.z - rt.player.z);
}

/** Fade the screen to black and back around a scene change. */
export async function fadeThrough(during: () => void | Promise<void>, ms = 450) {
  const fast = new URLSearchParams(location.search).get("fast") === "1";
  const step = fast ? 10 : ms;
  setGame({ fade: 1 });
  await debugWait(step);
  await during();
  rt.camera.snap = true;
  await debugWait(fast ? 10 : 120);
  setGame({ fade: 0 });
  await debugWait(step);
}
