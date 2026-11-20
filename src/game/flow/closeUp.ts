import { rt, type CameraShot } from "../runtime";
import { vy, type CrewId } from "../voyageRt";
import { COMPANION_IDS } from "../data/combat";
import { BOW_Z, DECK_Y, MASTS, SAIL_FOOT, SHIP, SHIP_POSTS, STERN_Z, hullHalf } from "../world/pirateShip";
import { frameTwo, shot } from "./script";
import type { Vec2, Vec3 } from "../types";

/**
 * Medium close-ups of a crew member (Captain Redbeard's important lines): face,
 * beard and upper body at a three-quarter angle, the ship behind. The lens is
 * picked from a few candidate angles and rejected if its line to the face
 * crosses a mast, a sail, the helm, a person or leaves the deck. The rig eases
 * into the close-up and back to the camera that was active before.
 */

/** Blend time into and out of a close-up (seconds). */
export const CLOSE_UP_EASE = 0.75;
/** Face height above the deck: the pirates' eyes, under the tricorn's brim (1.44 m, scene/models/lowland.ts npcGeometry). */
export const FACE_Y = 1.22;
/** The look-at point sits this far below the face, so the face lands in the upper-middle of the view. */
const TARGET_DROP = 0.04;
/** Lens distance from the face, and its height above the face. */
const DISTANCES = [1.75, 1.55, 2];
const LENS_RISE = 0.12;
/** People keep this far off the lens's line, so nobody's back fills the foreground. */
const PERSON_MARGIN = 0.35;
/** Angles off the subject's facing direction, nearest the camera's current side first. */
const ANGLES = [35, 45, 28, 55, 65].map((d) => (d * Math.PI) / 180);

export interface Blocker { x: number; z: number; r: number; top: number }

/** Ship-local, deck-relative obstacles the lens line must miss: masts, the helm and deck barrels. */
const POST_TOPS = SHIP_POSTS.map((p) => {
  const mast = Object.values(MASTS).find((m) => m.x === p.x && m.z === p.z);
  return { ...p, top: mast ? mast.h : p.r > 0.5 ? 1.5 : 1.05 };
});
/** Each gaff sail spans its boom aft of the mast, from the foot to the gaff; billow is ±0.9 m. */
export const SAIL_SPANS = Object.values(MASTS).map((m) => ({ x0: m.x - 0.9, x1: m.x + 1.1, z0: m.z - 0.3, z1: m.z + 4.7, y0: SAIL_FOOT - 0.25, y1: m.gaff + 0.2 }));

/** Is a ship-local point (y above the deck) clear of masts, sails and the given people? */
export function pointClear(x: number, y: number, z: number, people: readonly Blocker[], pad = 0.18): boolean {
  for (const p of POST_TOPS) if (y < p.top && Math.hypot(x - p.x, z - p.z) < p.r + pad) return false;
  for (const s of SAIL_SPANS) if (x > s.x0 - pad && x < s.x1 + pad && z > s.z0 - pad && z < s.z1 + pad && y > s.y0 && y < s.y1) return false;
  for (const p of people) if (y < p.top + PERSON_MARGIN && Math.hypot(x - p.x, z - p.z) < p.r + PERSON_MARGIN) return false;
  return true;
}

/** Is a ship-local lens position on the deck, inside the rails with room to spare? */
export function lensOnDeck(x: number, z: number): boolean {
  return z > BOW_Z + 1.5 && z < STERN_Z - 1 && Math.abs(x) < hullHalf(z) - 0.7;
}

/** Does the segment from the lens to the face miss everything (end points excluded near the face)? */
export function lineClear(a: Vec3, b: Vec3, people: readonly Blocker[]): boolean {
  if (!pointClear(a.x, a.y, a.z, people, 0.3)) return false;
  for (let i = 1; i < 24; i++) {
    const u = i / 24;
    if (!pointClear(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u, people)) return false;
  }
  return true;
}

/**
 * Ship-local, deck-relative close-up framing of a subject at `at` facing toward
 * `toward`, or null when no candidate is clear. `side` (+1/-1) is the side of
 * the facing line the camera prefers (the side it is already on).
 */
export function closeUpFraming(at: Vec2, toward: Vec2, side: number, people: readonly Blocker[]): CameraShot | null {
  const fx = toward.x - at.x, fz = toward.z - at.z, len = Math.hypot(fx, fz) || 1;
  const yaw = Math.atan2(fx / len, fz / len);
  const face = { x: at.x, y: FACE_Y, z: at.z };
  const sides = side < 0 ? [-1, 1] : [1, -1];
  for (const a of ANGLES) for (const s of sides) for (const d of DISTANCES) {
    const h = yaw + s * a;
    const lens = { x: at.x + Math.sin(h) * d, y: FACE_Y + LENS_RISE, z: at.z + Math.cos(h) * d };
    if (!lensOnDeck(lens.x, lens.z) || !lineClear(lens, face, people)) continue;
    return { pos: lens, target: { x: at.x, y: FACE_Y - TARGET_DROP, z: at.z } };
  }
  return null;
}

/** Ease curve for the rig's close-up blend: monotonic, 0 at 0, exactly 1 at 1. */
export function closeUpEase(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
}

/** The ship-local people the lens must not look through (everyone on deck but the subject). */
function peopleExcept(who: CrewId): Blocker[] {
  const out: Blocker[] = [];
  const px = rt.player.x - SHIP.x, pz = rt.player.z - SHIP.z;
  out.push({ x: px, z: pz, r: 0.45, top: 1.75 });
  for (const id of COMPANION_IDS) {
    const m = rt.monsters[id];
    out.push({ x: m.x - SHIP.x, z: m.z - SHIP.z, r: 0.55, top: 1.45 });
  }
  for (const id of Object.keys(vy.crew) as CrewId[]) {
    const c = vy.crew[id];
    if (id !== who && c.visible) out.push({ x: c.x, z: c.z, r: 0.45, top: 2.05 });
  }
  return out;
}

let saved: { mode: "follow" | "shot"; shot: CameraShot | null } | null = null;
/** The shot this module last set: if the camera has moved on since, the saved camera is stale. */
let active: CameraShot | null = null;

/**
 * Ease into a medium close-up of a crew member talking to the player. `cut`
 * skips the blend (when a fade already hides the change). Falls back to the
 * two-shot when no clear angle exists.
 */
export function closeUp(who: CrewId, opts: { cut?: boolean } = {}) {
  const c = rt.camera;
  if (!saved || c.shot !== active) saved = { mode: c.mode, shot: c.shot ? { pos: { ...c.shot.pos }, target: { ...c.shot.target } } : null };
  const at = { x: vy.crew[who].x, z: vy.crew[who].z };
  const player = { x: rt.player.x - SHIP.x, z: rt.player.z - SHIP.z };
  // The camera's side of the subject's line of sight to the player (a positive
  // turn off the facing line has a negative cross product).
  const cx = c.pos.x - SHIP.x - at.x, cz = c.pos.z - SHIP.z - at.z;
  const side = -Math.sign((player.x - at.x) * cz - (player.z - at.z) * cx) || 1;
  const local = closeUpFraming(at, player, side, peopleExcept(who));
  if (opts.cut) c.snap = true; else c.ease = CLOSE_UP_EASE;
  if (!local) {
    frameTwo(rt.player, { x: SHIP.x + at.x, z: SHIP.z + at.z }, 0.9);
  } else {
    shot({ x: SHIP.x + local.pos.x, y: DECK_Y + local.pos.y, z: SHIP.z + local.pos.z },
      { x: SHIP.x + local.target.x, y: DECK_Y + local.target.y, z: SHIP.z + local.target.z });
  }
  active = c.shot;
}

/** Ease back to the camera that was active before the close-up (a shot, a two-shot's framing, or follow). */
export function endCloseUp() {
  if (!saved || rt.camera.shot !== active) { saved = active = null; return; }
  const c = rt.camera;
  c.mode = saved.mode;
  c.shot = saved.shot;
  c.ease = CLOSE_UP_EASE;
  saved = active = null;
}
