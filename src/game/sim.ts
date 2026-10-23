import { MONSTERS, LIVE_MONSTERS } from "./data/monsters";
import { gateOpen, objective } from "./logic/progress";
import { getGame, setGame } from "./store";
import { animate, rt, type MonsterRt } from "./runtime";
import { keyboardMove } from "../input/keyboard";
import { PLAYER_R, gatesOf, moveCircle, isWalkable, standY, type Obstacles } from "./world/collision";
import { CAVE, LAVA, MONSTER_STONE, RIVER, shoreZ } from "./world/island";
import { findFocus } from "./flow/focus";
import { talkTo } from "./flow/encounter";
import { finaleEnding, stoneEnding } from "./flow/story";
import { isRunning } from "./flow/script";
import { poofTo, companionSpot } from "./flow/companion";
import { lookIntoDarkCave } from "./flow/obstacles";
import { audio } from "../audio/audio";
import type { MonsterId } from "./types";

/**
 * One simulation step (called first every frame): player movement, monster
 * behaviour, the companion, focus, regrowing food and the automatic triggers.
 */

const WALK = 4.4;
let lastObjective = "";
let followStuck = 0;

export function tick(dt: number) {
  const g = getGame();
  if (g.screen === "title") {
    for (const id of LIVE_MONSTERS) homeLife(rt.monsters[id], dt);
    return;
  }
  if (g.screen !== "game") return;
  const paused = g.journalOpen || g.settingsOpen;
  if (!paused) rt.playTime += dt;

  movePlayer(dt, g.mode === "explore" && !paused && !rt.player.frozen);

  for (const id of LIVE_MONSTERS) {
    const m = rt.monsters[id];
    if (m.mode === "follow") follow(m, dt);
    else if (m.mode === "talk" || m.mode === "script") faceLook(m, dt);
    else homeLife(m, dt);
    m.lift = 0;
    // Fliers hover a little above the ground (scenes may set other heights).
    if (MONSTERS[id].can.includes("fly") && (m.mode === "follow" || m.mode === "talk") && m.airTarget < 0.3) m.airTarget = 0.35;
    m.air += (m.airTarget - m.air) * Math.min(1, dt * 2.5);
  }

  // Food grows back.
  for (const [id, left] of rt.taken) {
    const t = left - dt;
    if (t <= 0) rt.taken.delete(id);
    else rt.taken.set(id, t);
  }

  // World animations ease toward their targets.
  rt.palm += (rt.palmTarget - rt.palm) * Math.min(1, dt * 1.6);
  rt.stones += (rt.stonesTarget - rt.stones) * Math.min(1, dt * 1.2);
  rt.bridge += (rt.bridgeTarget - rt.bridge) * Math.min(1, dt * 1.2);
  rt.bramble += (rt.brambleTarget - rt.bramble) * Math.min(1, dt * 0.9);

  // Idle time on the same objective (the ★ marker, Maple's nudges).
  const o = JSON.stringify(objective(g.progress));
  if (o !== lastObjective) {
    lastObjective = o;
    rt.idle = 0;
  } else if (g.mode === "explore") rt.idle += dt;

  if (g.mode === "explore" && !paused && !isRunning()) {
    const f = findFocus();
    const cur = g.focus;
    if (f?.id !== cur?.id || f?.verb !== cur?.verb || f?.noun !== cur?.noun) setGame({ focus: f });
    else if (f && cur && (Math.abs(f.x - cur.x) > 0.3 || Math.abs(f.z - cur.z) > 0.3)) setGame({ focus: f });
    autoTriggers();
  } else if (g.focus && g.mode !== "explore") setGame({ focus: null });

  // Ambience follows the player.
  const p = rt.player;
  audio.setNearness(1 - Math.min(1, Math.max(0, (shoreZ(p.x) - p.z) / 12)), 1 - Math.min(1, Math.abs(p.x - (RIVER.x0 + RIVER.x1) / 2) / 14));
}

// ------------------------------------------------------------ player

function monsterObstacles(): Obstacles[] {
  const active = getGame().progress.active;
  const circles = LIVE_MONSTERS.filter((id) => id !== active).map((id) => ({ x: rt.monsters[id].x, z: rt.monsters[id].z, r: MONSTERS[id].radius }));
  return [{ circles, boxes: [] }];
}

function movePlayer(dt: number, canMove: boolean) {
  const p = rt.player;
  let ix = 0;
  let iy = 0;
  if (canMove) {
    const k = keyboardMove();
    ix = k.x + rt.joy.x;
    iy = k.y + rt.joy.y;
    const l = Math.hypot(ix, iy);
    if (l > 1) {
      ix /= l;
      iy /= l;
    }
  }
  // Camera space -> world: forward is away from the camera.
  const cy = rt.camera.yaw;
  const fx = -Math.sin(cy);
  const fz = -Math.cos(cy);
  const rx = -fz;
  const rz = fx;
  const wx = (fx * iy + rx * ix) * WALK;
  const wz = (fz * iy + rz * ix) * WALK;
  const accel = 1 - Math.exp(-dt * 12);
  p.vx += (wx - p.vx) * accel;
  p.vz += (wz - p.vz) * accel;
  if (!canMove && Math.hypot(p.vx, p.vz) < 0.05) {
    p.vx = p.vz = 0;
  }
  if (!p.frozen && (p.vx || p.vz)) {
    const nx = p.x + p.vx * dt;
    const nz = p.z + p.vz * dt;
    const q = moveCircle(p.x, p.z, nx, nz, PLAYER_R, gatesOf(getGame().progress), false, monsterObstacles());
    p.vx = (q.x - p.x) / dt;
    p.vz = (q.z - p.z) / dt;
    p.x = q.x;
    p.z = q.z;
  }
  p.speed = p.frozen ? 0 : Math.hypot(p.vx, p.vz);
  if (p.speed > 0.3 && !p.frozen) {
    const want = Math.atan2(p.vx, p.vz);
    let d = want - p.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    p.yaw += d * Math.min(1, dt * 12);
    p.step += p.speed * dt * 2.3;
  }
  p.y = standY(p.x, p.z, getGame().progress.solved);
  if (p.riding) p.y = -0.05;
  if (p.climbY !== null) p.y = p.climbY;
}

// ------------------------------------------------------------ monsters

const turn = (m: MonsterRt, want: number, dt: number, rate = 8) => {
  let d = want - m.yaw;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  m.yaw += d * Math.min(1, dt * rate);
};

function faceLook(m: MonsterRt, dt: number) {
  m.speed = 0;
  if (m.look) turn(m, Math.atan2(m.look.x - m.x, m.look.z - m.z), dt, 6);
}

/** Walk toward a point; returns true on arrival. */
function walkTo(m: MonsterRt, x: number, z: number, speed: number, dt: number): boolean {
  const dx = x - m.x;
  const dz = z - m.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.25) {
    m.speed = 0;
    return true;
  }
  const def = MONSTERS[m.id];
  const step = Math.min(d, speed * dt);
  const q = moveCircle(m.x, m.z, m.x + (dx / d) * step, m.z + (dz / d) * step, def.radius, gatesOf(getGame().progress), def.can.includes("swim"));
  const moved = Math.hypot(q.x - m.x, q.z - m.z);
  m.x = q.x;
  m.z = q.z;
  m.speed = moved / Math.max(dt, 1e-4);
  m.step += moved * 2.6;
  turn(m, Math.atan2(dx, dz), dt);
  m.swimming = def.can.includes("swim") && isInWater(m.x);
  return moved < step * 0.2;
}

function isInWater(x: number) {
  return x > RIVER.x0 + 0.3 && x < RIVER.x1 - 0.3;
}

/** On its own at home: wander, rest, eat, nap, play; notice the player. */
function homeLife(m: MonsterRt, dt: number) {
  const def = MONSTERS[m.id];
  const g = getGame();
  const rec = g.progress.monsters[m.id];
  const p = rt.player;
  const dPlayer = Math.hypot(p.x - m.x, p.z - m.z);

  // Lumo belongs to the garden. The four powers wake it; it never wanders
  // out through the gate or naps again after that moment.
  if (m.id === "lumo") {
    m.x = def.home.x;
    m.z = def.home.z;
    m.speed = 0;
    m.target = null;
    m.mode = gateOpen(g.progress) ? "idle" : "sleep";
    m.airTarget = 0;
    if (gateOpen(g.progress) && dPlayer < 10) turn(m, Math.atan2(p.x - m.x, p.z - m.z), dt, 3);
    return;
  }

  // A shy flier waits up on its perch until it is called down ("Come here!").
  if (def.perch && !rec.discovered) {
    m.x = def.perch.x;
    m.z = def.perch.z;
    m.speed = 0;
    m.mode = "idle";
    m.airTarget = def.perch.y + (m.noticed ? 0.45 : 0);
    if (g.screen === "game" && !m.noticed && dPlayer < 7) {
      // Noticed: it flutters higher and hides its face.
      m.noticed = true;
      animate(m.id, "hide");
      audio.voice(m.id, "surprised");
    }
    if (dPlayer < 9) turn(m, Math.atan2(p.x - m.x, p.z - m.z), dt, 3);
    return;
  }
  if (def.can.includes("fly")) m.airTarget = m.mode === "sleep" ? 0.05 : 0.35;

  // First approach: a reaction (shy ones hide their face, curious ones come closer).
  if (g.screen === "game" && !rec.discovered && !m.noticed && dPlayer < 7) {
    m.noticed = true;
    animate(m.id, def.temper === "shy" ? "hide" : "notice");
    audio.voice(m.id, "surprised");
    m.mode = def.temper === "curious" && m.id !== "ember" ? "wander" : "idle";
    m.target = def.temper === "curious" && m.id !== "ember" ? { x: m.x + (p.x - m.x) * 0.45, z: m.z + (p.z - m.z) * 0.45 } : null;
    m.until = rt.time + 3;
    return;
  }
  // Discovered (not yet friends) monsters keep an eye on the player when near.
  if (g.screen === "game" && dPlayer < 4 && m.mode !== "sleep") {
    m.speed = 0;
    turn(m, Math.atan2(p.x - m.x, p.z - m.z), dt, 4);
    return;
  }
  if (m.mode === "wander" && m.target) {
    const done = walkTo(m, m.target.x, m.target.z, 1.3, dt);
    if (done || rt.time > m.until + 6) {
      m.target = null;
      m.mode = "idle";
      m.until = rt.time + 1.5 + Math.random() * 2.5;
    }
    return;
  }
  m.speed = 0;
  if (rt.time < m.until) {
    if (m.mode === "eat") turn(m, Math.atan2(def.foodSpot.x - m.x, def.foodSpot.z - m.z), dt, 3);
    return;
  }
  // Pick the next thing to do.
  const r = Math.random();
  const home = def.home;
  const away = Math.hypot(m.x - home.x, m.z - home.z) > home.r * 1.6;
  if (away || r < 0.5) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * home.r;
    m.mode = "wander";
    m.target = { x: home.x + Math.cos(a) * d, z: home.z + Math.sin(a) * d };
    m.until = rt.time + 6;
  } else if (r < 0.68) {
    m.mode = "eat";
    m.until = rt.time + 3;
  } else if (r < 0.8 && !rec.friend) {
    m.mode = "sleep";
    m.until = rt.time + 6;
  } else if (r < 0.92) {
    m.mode = "play";
    animate(m.id, Math.random() < 0.5 ? "hop" : "spin");
    m.until = rt.time + 1.6;
  } else {
    m.mode = "idle";
    m.until = rt.time + 2.5;
  }
}

/** Companion: keep beside the player; poof back if far behind or stuck. */
function follow(m: MonsterRt, dt: number) {
  const p = rt.player;
  if (p.frozen) {
    faceLook(m, dt);
    return;
  }
  const spot = companionSpot(m.id);
  const dPlayer = Math.hypot(p.x - m.x, p.z - m.z);
  if (dPlayer > 13) {
    poofTo(m.id, spot.x, spot.z);
    followStuck = 0;
    return;
  }
  const dSpot = Math.hypot(spot.x - m.x, spot.z - m.z);
  const obstacleShot = rt.camera.mode === "shot" && p.z <= LAVA.z1 + 4;
  if (dSpot < (obstacleShot ? 0.2 : 0.5) || (!obstacleShot && dPlayer < 1.3 && dSpot < 1.2)) {
    m.speed = 0;
    if (p.speed < 0.2) turn(m, Math.atan2(p.x - m.x, p.z - m.z), dt, 3);
    followStuck = 0;
    return;
  }
  const speed = Math.min(6.2, 1.5 + dSpot * 1.6);
  const stuck = walkTo(m, spot.x, spot.z, speed, dt);
  followStuck = stuck && dPlayer > 3 ? followStuck + dt : 0;
  if (followStuck > 1.5 && isWalkable(spot.x, spot.z, gatesOf(getGame().progress), MONSTERS[m.id].radius)) {
    poofTo(m.id, spot.x, spot.z);
    followStuck = 0;
  }
}

// ------------------------------------------------------------ triggers

/** Walking up close to an undiscovered monster starts the encounter; reaching the stone ends the slice. */
function autoTriggers() {
  const g = getGame();
  const p = rt.player;
  if (Math.hypot(p.x - CAVE.x, p.z - CAVE.z) > 5) rt.caveWarned = false;
  if (g.progress.solved.includes("lava") && !g.progress.solved.includes("cave") && !rt.caveWarned && Math.abs(p.x - CAVE.x) < 2.4 && p.z < CAVE.z + 1.7 && p.z > CAVE.z - 1) {
    rt.caveWarned = true;
    void lookIntoDarkCave();
    return;
  }
  for (const id of LIVE_MONSTERS) {
    const m = rt.monsters[id];
    if (id === "ember" && !g.progress.solved.includes("lava")) continue;
    if (id === "lumo" && !gateOpen(g.progress)) continue;
    if (g.progress.monsters[id].discovered) continue;
    if (Math.hypot(p.x - m.x, p.z - m.z) < 2.6) {
      void talkTo(id as MonsterId);
      return;
    }
  }
  if (g.progress.solved.includes("river") && g.progress.endings < 1 && Math.hypot(p.x - MONSTER_STONE.x, p.z - MONSTER_STONE.z) < 4.2) {
    void stoneEnding();
  }
  if (objective(g.progress).id === "finale") void finaleEnding();
}
