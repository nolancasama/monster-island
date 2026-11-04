import { afterEach, expect, it, vi } from "vitest";
import { hopTarget, hopPosition, LILY_ROUTE } from "./lilyHop";
import { LILY_PADS, LILY_PAD_R, STAGES, lowlandDeckY } from "../world/lowland";
import { isWalkable, standY, PLAYER_R, type Gates } from "../world/collision";
import { resetRuntime, rt } from "../runtime";
import { newProgress } from "./progress";
import { setGame } from "../store";
import { resetCombat, cb, playerRadius, riderSeatY, combatTick } from "../combat";
import { tick } from "../sim";
import { encodeSave } from "./save";
vi.mock("../../audio/audio", () => ({ audio: { play: vi.fn(), voice: vi.fn(), startMusic: vi.fn(), setNearness: vi.fn(), setScene: vi.fn() } }));
afterEach(() => { resetRuntime(); resetCombat(); setGame({ screen: "title", progress: newProgress() }); });
const gates: Gates = { act2: true, forest: true, volcano: true, solved: ["groveLilies"], cleared: [...STAGES] };

it("keeps three separated discs and open water off the deck and straight crossing", () => {
  expect(LILY_PADS).toHaveLength(3);
  for (let i = 1; i < 3; i++) {
    const a = LILY_PADS[i - 1], b = LILY_PADS[i];
    expect(Math.hypot(a.x - b.x, a.z - b.z) - 2 * LILY_PAD_R).toBeGreaterThan(.5);
    expect(isWalkable((a.x + b.x) / 2, (a.z + b.z) / 2, gates, 0)).toBe(false);
    expect(lowlandDeckY((a.x + b.x) / 2, (a.z + b.z) / 2, ["groveLilies"])).toBe(-Infinity);
  }
  expect(isWalkable(40.5, -223.2, gates, 0)).toBe(false);
});

it("accepts every adjacent edge both ways, only at its rim and with the right intent and unlock", () => {
  for (let i = 0; i < LILY_ROUTE.length; i++) for (const j of [i - 1, i + 1]) {
    const a = LILY_ROUTE[i], b = LILY_ROUTE[j]; if (!b) continue;
    const d = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / d, uz = (b.z - a.z) / d;
    const x = a.x + ux * .6, z = a.z + uz * .6;
    expect(hopTarget(x, z, ux, uz, true, 1)).toEqual(b);
    expect(hopTarget(x, z, -uz, ux, true, 1)).toBeNull();
    expect(hopTarget(x, z, ux, uz, false, 1)).toBeNull();
    expect(hopTarget(x, z, ux, uz, true, .999)).toBeNull();
    expect(hopTarget(a.x, a.z, ux, uz, true, 1)).toBeNull();
  }
  for (const [x, z] of [[75.5, -149], [106, -218], [55, -214], [0, -60]])
    expect(hopTarget(x, z, 1, 0, true, 1)).toBeNull();
});

it.each([PLAYER_R, .55])("crosses both ways using directional input at radius %s, saving every arc to its landing", radius => {
  resetRuntime();
  const progress = newProgress(); progress.act2.started = progress.act2.descended = true;
  for (const monster of Object.values(progress.monsters)) monster.discovered = true;
  progress.act2.cleared = [...STAGES]; progress.solved = ["groveLilies"];
  if (radius === .55) { progress.active = "bubbo"; progress.monsters.bubbo.friend = true; }
  setGame({ screen: "game", mode: "explore", progress, journalOpen: false, settingsOpen: false, panel: null, line: null });
  resetCombat(); for (const e of cb.enemies) e.state = "gone";
  cb.zones.current = "grove";
  if (radius === .55) { cb.stance.friend = "bubbo"; cb.stance.k = 1; }
  expect(playerRadius()).toBe(radius);
  rt.act2Unlock.groveLilies = 1; rt.time = 10;
  rt.camera.pos = { x: 0, y: 10, z: 10 }; rt.camera.target = { x: 0, y: 0, z: 0 }; rt.camera.snap = false;
  Object.assign(rt.player, LILY_ROUTE[0]);
  for (const route of [LILY_ROUTE.slice(1), [...LILY_ROUTE].reverse().slice(1)]) for (const target of route) {
    let landed = false, hopped = false;
    for (let n = 0; n < 240; n++) {
      const dx = target.x - rt.player.x, dz = target.z - rt.player.z, d = Math.hypot(dx, dz);
      const direction = rt.player.hop ? -1 : 1;
      rt.joy.x = direction * dx / (d || 1); rt.joy.y = -direction * dz / (d || 1);
      rt.time += 1 / 60; tick(1 / 60);
      if (rt.player.hop) {
        hopped = true;
        const h = rt.player.hop;
        const pose = hopPosition(h, rt.time, standY(h.fromX, h.fromZ, progress.solved), standY(h.toX, h.toZ, progress.solved));
        expect(rt.player.x).toBeCloseTo(pose.x);
        expect(rt.player.z).toBeCloseTo(pose.z);
        expect(rt.player.y).toBeCloseTo(radius === .55 ? riderSeatY()! : pose.y);
        if (rt.time === h.t0) {
          const hp = cb.vitals.hp;
          cb.shots.push({ id: 999, shape: "hostile", owner: "puff", hostile: true, source: 0,
            x: rt.player.x, y: rt.player.y, z: rt.player.z, y1: rt.player.y, vx: 0, vz: 0,
            life: 1, age: 0, radius: .4, damage: 5, knock: 0, stun: 0, size: 1 });
          combatTick(0);
          expect(cb.shots[0]?.life ?? 0).toBe(0);
          expect(cb.vitals.hp).toBe(hp);
          expect(cb.knock).toEqual({ x: 0, z: 0 });
        }
        const saved = JSON.parse(encodeSave(progress, rt.player, 10));
        expect(saved.player.x).toBe(rt.player.hop.toX);
        expect(saved.player.z).toBe(rt.player.hop.toZ);
        expect(isWalkable(saved.player.x, saved.player.z, gates, radius)).toBe(true);
      }
      if (hopped && !rt.player.hop) { landed = true; break; }
    }
    expect(landed, JSON.stringify(target)).toBe(true);
    expect(rt.player.x).toBe(target.x); expect(rt.player.z).toBe(target.z);
  }
  expect(rt.effects.filter(e => e.kind === "splash")).toHaveLength(8);
});
