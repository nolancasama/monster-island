import { getGame } from "./store";
import { rt } from "./runtime";
import { SPOT } from "./world/pirateShip";
import { CREW_IDS, vy, type CrewId, type StormAction } from "./voyageRt";

/**
 * The storm crew's panic (docs/SHIP_RAFT_FIXES.md item 14): authored runs to
 * emergency stations. Kept out of flow/ so the per-frame voyage tick can call it
 * without importing the storm script (and, through it, the rest of the flow).
 */

type DeckPoint = { x: number; z: number };
interface EmergencyRoute {
  start: DeckPoint;
  path: readonly DeckPoint[];
  yaw: number;
  action: StormAction;
}

// The routes keep the middle of the deck and its approaches to the loose barrels, the mast
// and the fallen spar open for the player.
export const EMERGENCY_ROUTES: Record<Exclude<CrewId, "gull">, EmergencyRoute> = {
  tom: { start: SPOT.crew[0], path: [{ x: 2.25, z: -8.25 }, { x: 5.45, z: -8.25 }], yaw: Math.PI / 2, action: "haul" },
  sam: { start: SPOT.crew[1], path: [{ x: 1.7, z: -7.0 }, { x: 5.45, z: -6.85 }], yaw: Math.PI / 2, action: "haul" },
  max: { start: SPOT.crew[2], path: [{ x: 4.55, z: -13.35 }, { x: 4.55, z: -15.45 }, { x: 2.2, z: -18.1 }], yaw: Math.PI, action: "brace" },
  bill: { start: SPOT.bill, path: [{ x: -1.85, z: 0.75 }], yaw: -Math.PI / 2, action: "brace" },
  finn: { start: SPOT.finn, path: [{ x: -3.3, z: 17.35 }], yaw: -0.6, action: "haul" },
  pepper: { start: SPOT.cook, path: [{ x: 1.35, z: -16.5 }], yaw: -Math.PI / 2, action: "brace" },
  redbeard: { start: SPOT.captain, path: [{ x: -0.95, z: 11.65 }], yaw: Math.PI, action: "direct" },
};
const RUN_SPEED = 4.2;

export function startPanic() {
  vy.panic = { wide: rt.camera.shot, elapsed: 0, paused: false, brace: 0, openingFlash: vy.flash };
  for (const id of CREW_IDS) {
    if (id === "gull") continue;
    vy.crew[id].panic = { action: EMERGENCY_ROUTES[id].action, next: 0 };
  }
}

/** Simulate in ship space so the renderer, dialogue and the harness see the same crew positions. */
export function tickStormPanic(dt: number) {
  const panic = vy.panic;
  if (!panic) return;
  const g = getGame();
  const wide = panic.wide, shot = rt.camera.shot;
  // Returning from a close-up can restore a copy of the original wide lens.
  const openingWide = wide && shot && rt.camera.mode === "shot"
    && wide.pos.x === shot.pos.x && wide.pos.y === shot.pos.y && wide.pos.z === shot.pos.z
    && wide.target.x === shot.target.x && wide.target.y === shot.target.y && wide.target.z === shot.target.z;
  panic.paused = Boolean(g.line || g.prompt || g.journalOpen || g.settingsOpen
    || (!openingWide && (g.mode !== "explore" || rt.camera.mode !== "follow")));
  const age = rt.time - vy.flash;
  panic.brace = vy.flash !== panic.openingFlash && age >= 0 && age < 0.65 ? Math.sin(age * Math.PI / 0.65) : 0;
  if (panic.paused || dt <= 0) return;

  panic.elapsed += dt;
  for (let i = 0; i < CREW_IDS.length; i++) {
    const id = CREW_IDS[i];
    if (id === "gull") continue;
    const c = vy.crew[id], route = EMERGENCY_ROUTES[id];
    if (!c.panic) continue;
    let stride = RUN_SPEED * dt * (1 - 0.7 * panic.brace);
    while (c.panic.next !== null && stride > 0) {
      const target = route.path[c.panic.next];
      const dx = target.x - c.x, dz = target.z - c.z;
      const distance = Math.hypot(dx, dz);
      if (distance > stride) {
        c.yaw = Math.atan2(dx, dz);
        c.x += dx * stride / distance;
        c.z += dz * stride / distance;
        break;
      }
      c.x = target.x;
      c.z = target.z;
      stride -= distance;
      c.panic.next++;
      if (c.panic.next === route.path.length) {
        c.panic.next = null;
        c.yaw = route.yaw;
      }
    }
  }
}

export function stopPanic() {
  vy.panic = null;
  for (const id of CREW_IDS) vy.crew[id].panic = null;
}
