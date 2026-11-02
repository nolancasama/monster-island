import { describe, expect, it, vi } from "vitest";
import { SAVE_KEY, SAVE_KEY_V1, SAVE_KEY_V2, SAVE_KEY_V3, decodeSave, encodeSave, readSave, writeSave } from "./save";
import { befriend, describeLine, discover, newProgress, noteSaid, pickUp, recordLike, solve } from "./progress";
import { PLAYER_R, gatesOf, isWalkable, nearestWalkable } from "../world/collision";
import { CAMP, CLIFF_TOP_SPOT, SPAWN } from "../world/island";
import { CAMP2, CLIFF_ROPE, GROVE_CROSSING, POND, STAGES, STAGE_EXITS } from "../world/lowland";
import { startAct2, markDescended } from "./act2";
import type { MonsterId } from "../types";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// Exercise the production save-key migration; Vitest otherwise enables the
// development-only debug save slot through import.meta.env.DEV.
vi.mock("../debugAccess", () => ({ debugEnabled: false }));

function midGame() {
  let p = { ...newProgress(), metMaple: true };
  p = recordLike(discover(p, "leafy"), "leafy", "fish");
  p = recordLike(p, "leafy", "apples");
  p = befriend(pickUp(p, "apples"), "leafy");
  p = solve(p, "fallenPalm");
  p = pickUp(pickUp(p, "fish"), "berries");
  p = noteSaid(noteSaid(p, "likeApples"), "canHelp");
  return p;
}

describe("save / load", () => {
  it("round-trips the progress, the player and the time", () => {
    const p = midGame();
    const back = decodeSave(encodeSave(p, { x: 3.5, z: 2, yaw: 1 }, 321));
    expect(back?.progress).toEqual(p);
    expect(back?.player).toEqual({ x: 3.5, z: 2, yaw: 1 });
    expect(back?.seconds).toBe(321);
  });

  it("round-trips Phase 2 progress (endings, journal lines)", () => {
    let p = { ...midGame(), endings: 1 };
    p = solve(solve(p, "river"), "bridge");
    p = describeLine(discover(p, "puff"), "puff", "size");
    const back = decodeSave(encodeSave(p, { x: 37, z: -30, yaw: 0 }, 900));
    expect(back?.progress).toEqual(p);
    expect(back?.v).toBe(4);
  });

  it("uses a new key while retaining both migration keys", () => {
    expect(SAVE_KEY).toBe("mi.save.v4");
    expect(SAVE_KEY_V3).toBe("mi.save.v3");
    expect(SAVE_KEY_V2).toBe("mi.save.v2");
    expect(SAVE_KEY_V1).toBe("mi.save.v1");
  });

  it("migrates v2 to v4 with all Phase 2 progress kept", () => {
    let p = { ...solve(solve(solve(midGame(), "river"), "bridge"), "cliff"), endings: 2 };
    p = describeLine(discover(p, "puff"), "puff", "size");
    p = describeLine(p, "puff", "part");
    const { lumo: _lumo, ...monsters } = p.monsters;
    const player = { ...CLIFF_TOP_SPOT, yaw: 0.6 };
    const back = decodeSave(JSON.stringify({ v: 2, progress: { ...p, monsters }, player, seconds: 1200 }))!;
    expect(back.v).toBe(4);
    expect(back.progress).toEqual(p);
    expect(back.player).toEqual(player);
    expect(back.seconds).toBe(1200);
    expect(back.progress.monsters.lumo).toEqual(newProgress().monsters.lumo);
  });

  it("round-trips the final ending, Lumo's name and Ember's invitation", () => {
    const p = midGame();
    p.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame"];
    p.endings = 3;
    p.monsters.ember = { ...p.monsters.ember, discovered: true, friend: true, invited: true, described: { size: true, part: true } };
    p.monsters.lumo = { ...p.monsters.lumo, discovered: true, friend: true, described: { name: true, size: true, part: true } };
    const back = decodeSave(encodeSave(p, { x: 70, z: -120, yaw: 0 }, 1800))!;
    expect(back.v).toBe(4);
    expect(back.progress).toEqual(p);
  });

  it.each([1, 2, 3])("relocates a player stored inside a solid after loading save v%i without changing progression", (v) => {
    const p = midGame();
    const player = { x: CAMP.table.x, z: CAMP.table.z, yaw: 1.3 };
    const gates = gatesOf(p);
    expect(isWalkable(player.x, player.z, gates, PLAYER_R)).toBe(false);
    const back = decodeSave(JSON.stringify({ v, progress: p, player, seconds: 321 }))!;
    expect(back.progress).toEqual(p);
    expect(back.player).toEqual({ ...nearestWalkable(player.x, player.z, PLAYER_R, gates, false, true), yaw: player.yaw });
    expect(isWalkable(back.player.x, back.player.z, gatesOf(back.progress), PLAYER_R)).toBe(true);
    expect(back.seconds).toBe(321);
  });

  it("never restores Lumo as a companion", () => {
    const p = midGame();
    p.monsters.lumo = { ...p.monsters.lumo, discovered: true, friend: true };
    p.active = "lumo";
    expect(decodeSave(encodeSave(p, { x: 0, z: 0, yaw: 0 }, 0))!.progress.active).toBe("leafy");
    p.monsters.leafy.friend = false;
    expect(decodeSave(encodeSave(p, { x: 0, z: 0, yaw: 0 }, 0))!.progress.active).toBeNull();
  });

  it("migrates a Phase 1 (v1) save instead of discarding it", () => {
    const v1 = (finished: boolean) => {
      const { endings: _e, ...rest } = solve(midGame(), "river");
      const monsters = Object.fromEntries(
        Object.entries(rest.monsters).map(([id, r]) => {
          const { described: _d, ...old } = r;
          return [id, old];
        })
      );
      return JSON.stringify({ v: 1, progress: { ...rest, monsters, finished }, player: { x: 30, z: -2, yaw: 1 }, seconds: 640 });
    };
    const done = decodeSave(v1(true))!;
    expect(done.v).toBe(4);
    expect(done.progress.endings).toBe(1);
    expect(done.progress.solved).toEqual(["fallenPalm", "river"]);
    expect(done.progress.monsters.leafy.friend).toBe(true);
    expect(done.progress.monsters.leafy.described).toEqual({});
    expect(done.seconds).toBe(640);
    expect(decodeSave(v1(false))!.progress.endings).toBe(0);
  });

  it("an ending never stands without its obstacle", () => {
    const forged = (endings: number, solved: string[]) =>
      decodeSave(JSON.stringify({ v: 2, progress: { ...newProgress(), solved, endings }, player: {} }))!.progress.endings;
    expect(forged(2, ["fallenPalm", "river"])).toBe(1);
    expect(forged(1, ["fallenPalm"])).toBe(0);
    expect(forged(2, ["fallenPalm", "river", "bridge", "cliff"])).toBe(2);
    expect(forged(9, ["fallenPalm", "river", "bridge", "cliff"])).toBe(2);
  });

  it("does not restore Phase 3 obstacles before the Phase 2 ending or Ember's invitation", () => {
    const p = midGame();
    p.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame"];
    p.endings = 1;
    const restore = () => decodeSave(encodeSave(p, { x: 0, z: 0, yaw: 0 }, 0))!.progress;
    expect(restore().solved).toEqual(["fallenPalm", "river", "bridge", "cliff"]);
    p.endings = 3;
    expect(restore().solved).toEqual(["fallenPalm", "river", "bridge", "cliff", "lava"]);
    expect(restore().endings).toBe(2);
    p.monsters.ember = { ...p.monsters.ember, discovered: true, friend: true };
    expect(restore().solved).not.toContain("cave");
    p.monsters.ember.invited = true;
    expect(restore().solved).toEqual(p.solved);
    expect(restore().endings).toBe(2);
    p.monsters.lumo = { ...p.monsters.lumo, discovered: true, friend: true, described: { name: true, size: true, part: true } };
    expect(restore().endings).toBe(3);
    p.solved = p.solved.filter((id) => id !== "gateWing");
    expect(restore().endings).toBe(2);
  });

  it("discards unknown versions and broken text", () => {
    expect(decodeSave(null)).toBeNull();
    expect(decodeSave("not json")).toBeNull();
    expect(decodeSave(JSON.stringify({ v: 99, progress: {} }))).toBeNull();
  });

  it("cannot unlock things out of order", () => {
    const forged = JSON.stringify({
      v: 1,
      progress: {
        monsters: { bubbo: { discovered: false, friend: true }, leafy: { discovered: true, friend: true } },
        active: "bubbo",
        solved: ["river"],
        finished: true,
        bag: { apples: 99, rocks: 4 },
        said: ["likeApples", "hackTheGame"]
      },
      player: { x: "a" }
    });
    const s = decodeSave(forged)!;
    expect(s.progress.monsters.bubbo.friend).toBe(false);
    expect(s.progress.active).toBe("leafy");
    expect(s.progress.solved).toEqual([]);
    expect(s.progress.endings).toBe(0);
    expect(s.progress.bag).toEqual({ apples: 99 });
    expect(s.progress.said).toEqual(["likeApples"]);
    expect(s.player).toEqual({ x: SPAWN.x, z: SPAWN.z, yaw: 0 });
    expect(isWalkable(s.player.x, s.player.z, gatesOf(s.progress), PLAYER_R)).toBe(true);
  });
});

/** Raw legacy names belong only to migration fixtures. */
describe("forest layout save migration", () => {
  it("keeps removed forest identifiers confined to save migration", () => {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const removed = /oldTrail|SHORTCUT_GATE|Fern Crossing/;
    const stale = (readdirSync(root, { recursive: true }) as string[])
      .filter(path => /\.(ts|tsx)$/.test(path) && !/logic[\\/]save(?:\.test)?\.ts$/.test(path))
      .filter(path => removed.test(readFileSync(join(root, path), "utf8")));
    expect(stale).toEqual([]);
  });

  function chapter() {
    const p = newProgress();
    for (const id of ["leafy", "bubbo", "puff", "ember", "lumo"] as MonsterId[]) {
      p.monsters[id] = { discovered: true, friend: true, asked: {}, canKnown: {}, described: { name: true, size: true, part: true }, ...(id === "ember" ? { invited: true } : {}) };
    }
    p.endings = 3;
    p.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame"];
    return markDescended(startAct2(p));
  }
  function load(position: { x: number; z: number }, fields: Record<string, unknown> = {}, legacy = true, shortcut = false) {
    const p = chapter();
    const act2: Record<string, unknown> = { ...p.act2, ...fields };
    if (legacy) delete act2.forestLayout;
    return decodeSave(JSON.stringify({ v: 4, progress: { ...p, act2, solved: [...p.solved, ...(shortcut ? ["causewayGate"] : [])] }, player: { ...position, yaw: .7 }, seconds: 87 }))!;
  }

  it("recovers an unsolved swim or island save at the near bank, and preserves solved dismount saves", () => {
    for (const position of [POND, GROVE_CROSSING.swimEnd, GROVE_CROSSING.friendLanding, GROVE_CROSSING.landing]) {
      const p = chapter();
      p.act2.zone = "grove";
      const back = decodeSave(encodeSave(p, { ...position, yaw: .7 }, 87))!;
      expect(back.player).toEqual({ ...GROVE_CROSSING.near, yaw: .7 });
      expect(back.progress.solved).not.toContain("groveLilies");
      expect(back.progress.act2.zone).toBe("grove");
    }
    const p = solve(chapter(), "groveLilies");
    const back = decodeSave(encodeSave(p, { ...GROVE_CROSSING.landing, yaw: .7 }, 87))!;
    expect(back.player).toEqual({ ...GROVE_CROSSING.landing, yaw: .7 });
    expect(back.progress.solved).toContain("groveLilies");
  });

  it.each([
    { label: "old camp", position: { x: 76, z: -191.5 }, zone: "camp" },
    { label: "old trail", position: { x: 76, z: -220 }, zone: "oldTrail" },
    { label: "mesa", position: { x: 78, z: -209 }, zone: "forest1" },
    { label: "removed grove approach", position: { x: 66, z: -202 }, zone: "grove" },
    { label: "off land", position: { x: 20, z: -220 }, zone: "forest1" },
  ])("moves $label to the valid checkpoint, with no heal or lost progress", ({ position, zone }) => {
    for (const checkpoint of ["camp", "cliff"] as const) {
      const back = load(position, { zone, checkpoint, hp: 43, mp: { leafy: 27 }, cleared: ["forest1"] });
      expect(back.player).toEqual({ ...(checkpoint === "camp" ? CAMP2.rest : CLIFF_ROPE.foot), yaw: .7 });
      expect(back.progress.act2).toMatchObject({ forestLayout: 2, checkpoint, hp: 43 });
      expect(back.progress.act2.mp.leafy).toBe(27);
      expect(isWalkable(back.player.x, back.player.z, gatesOf(back.progress), PLAYER_R)).toBe(true);
      expect(back.seconds).toBe(87);
    }
  });

  it("maps the removed zone id and retains legacy shortcut access before dropping its unlock", () => {
    const back = load({ x: 76, z: -220 }, { zone: "oldTrail", cleared: [] }, true, true);
    expect(back.progress.act2.zone).toBe("forest1");
    expect(back.progress.act2.cleared).toEqual(["forest1"]);
    expect(back.progress.solved).not.toContain("causewayGate");
    const old = load({ x: 76, z: -251 }, { zone: "causeway", cleared: undefined }, true, true);
    expect(old.progress.act2.cleared).toEqual(["forest1", "grove", "canopy"]);
    expect(old.progress.solved).not.toContain("causewayGate");
  });

  it.each([
    { zone: "grove", x: 50, z: -220 },
    { zone: "canopy", x: 106, z: -212 },
    { zone: "causeway", x: 76, z: -251 },
    { zone: "causeway", x: 76, z: -244 },
    { zone: "coast", x: 70, z: -273 },
    { zone: "port", x: 76, z: -296 },
  ])("keeps valid $zone positions and checkpoint meaning", ({ zone, x, z }) => {
    const back = load({ x, z }, { zone, checkpoint: "camp", cleared: [...STAGES] });
    expect(back.player).toEqual({ x, z, yaw: .7 });
    expect(back.progress.act2.zone).toBe(zone);
    expect(back.progress.act2.checkpoint).toBe("camp");
  });

  it("restores all port access even when an old explicit clear list is incomplete", () => {
    const back = load({ x: 76, z: -296 }, { zone: "port", checkpoint: "port", portFound: true, cleared: [] });
    expect(back.progress.act2.cleared).toEqual([...STAGES]);
    expect(back.player).toMatchObject({ x: 76, z: -296 });
  });

  it("validates a saved barrier position with its own clear flags", () => {
    const gate = STAGE_EXITS.find(g => g.id === "forest1")!;
    const blocked = load(gate, { zone: "forest1", cleared: [], checkpoint: "camp" });
    expect(blocked.player).toEqual({ ...CAMP2.rest, yaw: .7 });
    const open = load(gate, { zone: "forest1", cleared: ["forest1"] }, false);
    expect(open.player).toEqual({ x: gate.x, z: gate.z, yaw: .7 });
  });

  it("writes the new marker and reloads a migrated save without moving it again", () => {
    const migrated = load({ x: 76, z: -191.5 }, { checkpoint: "camp", zone: "camp" });
    const text = encodeSave(migrated.progress, migrated.player, migrated.seconds);
    expect(JSON.parse(text).progress.act2.forestLayout).toBe(2);
    expect(decodeSave(text)).toEqual(migrated);
  });

  it.each([1, 2, 3])("loads v%i and writes the new format without overwriting the legacy key", (v) => {
    const key = [SAVE_KEY_V1, SAVE_KEY_V2, SAVE_KEY_V3][v - 1];
    const original = JSON.stringify({ v, progress: chapter(), player: { x: 3.5, z: 2, yaw: 0 }, seconds: 50 });
    const storage = new Map([[key, original]]);
    vi.stubGlobal("localStorage", { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, value: string) => storage.set(k, value) });
    try {
      const back = readSave()!;
      expect(back).not.toBeNull();
      writeSave(encodeSave(back.progress, back.player, back.seconds));
      expect(storage.get(key)).toBe(original);
      expect(JSON.parse(storage.get(SAVE_KEY)!).progress.act2.forestLayout).toBe(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
