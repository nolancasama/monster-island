import { MONSTERS } from "../data/monsters";
import { setActive } from "../logic/progress";
import { getGame, setGame, toast, updateProgress } from "../store";
import { effect, rt } from "../runtime";
import { gatesOf, nearestWalkable } from "../world/collision";
import { audio } from "../../audio/audio";
import type { MonsterId } from "../types";
import { LAVA } from "../world/island";
import { inHostileZone, learn } from "../combat";

const learnSwitch = () => learn("switch");

/** Teleport a monster with a little poof (far switches, getting unstuck, going home). */
export function poofTo(id: MonsterId, x: number, z: number) {
  const m = rt.monsters[id];
  const def = MONSTERS[id];
  effect("poof", m.x, 0.6, m.z);
  const p = nearestWalkable(x, z, def.radius, gatesOf(getGame().progress), def.can.includes("swim"));
  m.x = p.x;
  m.z = p.z;
  m.poofT0 = rt.time;
  effect("poof", m.x, 0.6, m.z);
}

/** A spot beside the player (behind and to the right of where they face). */
export function besidePlayer(back = 1.5, side = 1.1): { x: number; z: number } {
  const p = rt.player;
  const fx = Math.sin(p.yaw);
  const fz = Math.cos(p.yaw);
  return { x: p.x - fx * back - fz * side, z: p.z - fz * back + fx * side };
}

/** Phase 3 obstacle shots need room for big companions on the far shoulder. */
export function companionSpot(id: MonsterId): { x: number; z: number } {
  const p = rt.player;
  const shot = rt.camera.mode === "shot" ? rt.camera.shot : null;
  if (!shot || p.z > LAVA.z1 + 4) return besidePlayer(1.5, 1.1 * rt.followSide);
  const lateralX = -Math.cos(p.yaw);
  const lateralZ = Math.sin(p.yaw);
  const cameraSide = lateralX * (shot.pos.x - p.x) + lateralZ * (shot.pos.z - p.z);
  const side = (MONSTERS[id].size === "big" ? 2.7 : 2) * (cameraSide >= 0 ? -1 : 1);
  // Stay alongside rather than behind: the old back offset put Ember in the lens.
  return besidePlayer(0, side);
}

/** Make a friend the companion. Immediate: a far-away friend poofs over. */
export function switchTo(id: MonsterId, quiet = false) {
  const g = getGame();
  const before = g.progress.active;
  if (MONSTERS[id].companion === false || !g.progress.monsters[id].friend || before === id) return;
  updateProgress((p) => setActive(p, id));
  const act2 = g.progress.act2.started;
  if (before) {
    const old = rt.monsters[before];
    old.target = null;
    if (act2) {
      // Act 2: everyone travels together; the old companion falls in with the party.
      old.mode = "party";
    } else {
      old.mode = "wander";
      const home = MONSTERS[before].home;
      if (Math.hypot(old.x - home.x, old.z - home.z) > 8) poofTo(before, home.x, home.z);
    }
  }
  if (act2) learnSwitch();
  const m = rt.monsters[id];
  m.mode = "follow";
  m.target = null;
  const spot = besidePlayer();
  if (Math.hypot(m.x - rt.player.x, m.z - rt.player.z) > 9) poofTo(id, spot.x, spot.z);
  if (act2 && inHostileZone()) {
    m.x = rt.player.x; m.z = rt.player.z; m.poofT0 = rt.time;
    effect("poof", m.x, rt.player.y + .8, m.z);
  }
  m.anim = { kind: "hop", t0: rt.time };
  audio.play("switch");
  audio.voice(id, "hello");
  if (getGame().hint === "switch") setGame({ hint: null });
  if (!quiet) toast({ en: `${MONSTERS[id].name} is with you!`, ja: `${MONSTERS[id].name}が いっしょに いるよ`, icon: id, tone: "good" });
}
