import { getGame, setGame, toast } from "../store";
import { animate, rt } from "../runtime";
import { say, wait } from "./ask";
import { shot } from "./script";
import { audio } from "../../audio/audio";
import { standY } from "../world/collision";
import { mesaCameraLift } from "../world/mesa";
import { BUBBLE_LANDING, SUMMIT_DEPARTURE } from "../world/upperCanopy";
import type { Vec3 } from "../types";

type P = [number, number, number];

/** The descent lands in the Causeway only when a walking route already opens it. */
export function bubbleDestination(cleared: readonly string[]): "causeway" | "canopy" {
  return cleared.includes("grove") || cleared.includes("canopy") ? "causeway" : "canopy";
}

/** Waypoints: lift off the departure stone, drift out from the mountain, arc
 * west over the Grove, then down into the landing. */
export function bubblePath(from: Vec3, to: "causeway" | "canopy"): P[] {
  const land = BUBBLE_LANDING[to], gy = standY(land.x, land.z, [], "ground");
  const out: P = [from.x - .2, from.y + 1.6, from.z - 3.4];
  if (to === "causeway") return [[from.x, from.y, from.z], out, [70.5, from.y - .5, -231], [62.5, from.y - 5, -238.5], [67, gy + 9, -247], [land.x - 4, gy + 4, land.z + .5], [land.x, gy, land.z]];
  return [[from.x, from.y, from.z], out, [84, from.y - 1.5, -227], [92, from.y - 5, -232.5], [land.x, gy + 3, land.z + .4], [land.x, gy, land.z]];
}

/** Centripetal-ish Catmull-Rom through the waypoints, by global parameter u in [0, 1]. */
export function pathPoint(pts: P[], u: number): P {
  const n = pts.length - 1, f = Math.max(0, Math.min(1, u)) * n, i = Math.min(n - 1, Math.floor(f)), t = f - i;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
  const t2 = t * t, t3 = t2 * t;
  return [0, 1, 2].map(k => .5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)) as P;
}

/** The fixed Causeway lens for a point (yaw 0, pitch .8, dist 10.5, ahead 1). */
export function causewayLens(x: number, y: number, z: number): { cam: P; look: P } {
  return { cam: [x, y + 1.1 + 10.5 * Math.sin(.8), z + 10.5 * Math.cos(.8) - 1], look: [x, y + 1, z - 1] };
}

/** Camera keyframe: pulls back to show the mountain and treetops, sweeps over
 * the Grove, and settles exactly on the landing's ordinary framing. */
export function bubbleCamera(pts: P[], u: number, to: "causeway" | "canopy"): { cam: P; look: P } {
  const [bx, by, bz] = pathPoint(pts, u);
  const end = pts[pts.length - 1];
  const final = to === "causeway" ? causewayLens(end[0], end[1], end[2]) : { cam: [end[0] + 5.4, end[1] + 8, end[2] + 8.6] as P, look: [end[0], end[1] + 1, end[2]] as P };
  const pull = Math.sin(Math.min(1, u * 1.25) * Math.PI);
  const wide: P = [bx + 7 + 6 * pull, by + 4 + 7 * pull, bz + 9 + 6 * pull];
  const k = Math.max(0, Math.min(1, (u - .72) / .28)), s = k * k * (3 - 2 * k);
  const cam: P = [wide[0] + (final.cam[0] - wide[0]) * s, wide[1] + (final.cam[1] - wide[1]) * s, wide[2] + (final.cam[2] - wide[2]) * s];
  const look: P = [bx + (final.look[0] - bx) * s, by + .9 + (final.look[1] - by - .9) * s, bz + (final.look[2] - bz) * s];
  // Never let the lens pass through the mountain.
  cam[1] += mesaCameraLift({ x: look[0], y: look[1], z: look[2] }, { x: cam[0], y: cam[1], z: cam[2] });
  return { cam, look };
}

/**
 * Bubbo blows a big bubble around the player and they float down from the
 * summit: to the Causeway, or (before it is open by walking) to the upper
 * rope's foot in the lower Canopy. The first time follows "Can you help me?";
 * later the departure stone offers it directly.
 */
export async function bubbleDescent(first: boolean) {
  const p = rt.player, b = rt.monsters.bubbo, ride = rt.bubbleRide;
  const to = bubbleDestination(getGame().progress.act2.cleared);
  if (to === "canopy") await say("bubbo", "Let's land in the trees!", "きの うえに おりよう!");
  p.frozen = true;
  p.vx = p.vz = 0;
  p.yaw = Math.atan2(SUMMIT_DEPARTURE.face.x - p.x, SUMMIT_DEPARTURE.face.z - p.z);
  b.mode = "script";
  b.x = p.x + 1.1; b.z = p.z + .4; b.air = b.airTarget = 0;
  b.yaw = Math.atan2(p.x - b.x, p.z - b.z);
  const start = { x: p.x, y: p.y, z: p.z };
  const pts = bubblePath(start, to);
  shot({ x: p.x + 4.5, y: p.y + 2.6, z: p.z + 5.2 }, { x: p.x, y: p.y + 1, z: p.z });
  animate("bubbo", "power");
  audio.play("whoosh");
  // The bubble grows around the player.
  ride.phase = "forming"; ride.x = p.x; ride.y = p.y; ride.z = p.z; ride.k = 0;
  ride.t0 = rt.time;
  ride.dur = first ? 9.5 : 8;
  ride.formDur = first ? 1.4 : .8;
  ride.growDur = first ? 1.2 : .7;
  ride.pts = pts;
  ride.to = to;
  // The simulation owns all ride motion and phase transitions.
  while (rt.bubbleRide.phase !== "idle") await wait(16);
  p.frozen = false;
  rt.camera.mode = "follow";
  rt.camera.shot = null;
  setGame({ hint: null });
  if (first) toast({ en: "What a view!", ja: "いい ながめ!", icon: "star", tone: "good" }, 2400);
}
