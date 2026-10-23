import { describe, expect, it } from "vitest";
import { SAVE_KEY, SAVE_KEY_V1, SAVE_KEY_V2, decodeSave, encodeSave } from "./save";
import { befriend, describeLine, discover, newProgress, noteSaid, pickUp, recordLike, solve } from "./progress";

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
    expect(back?.v).toBe(3);
  });

  it("uses a new key while retaining both migration keys", () => {
    expect(SAVE_KEY).toBe("mi.save.v3");
    expect(SAVE_KEY_V2).toBe("mi.save.v2");
    expect(SAVE_KEY_V1).toBe("mi.save.v1");
  });

  it("migrates v2 to v3 with all Phase 2 progress kept", () => {
    let p = { ...solve(solve(solve(midGame(), "river"), "bridge"), "cliff"), endings: 2 };
    p = describeLine(discover(p, "puff"), "puff", "size");
    p = describeLine(p, "puff", "part");
    const { lumo: _lumo, ...monsters } = p.monsters;
    const player = { x: 51, z: -61, yaw: 0.6 };
    const back = decodeSave(JSON.stringify({ v: 2, progress: { ...p, monsters }, player, seconds: 1200 }))!;
    expect(back.v).toBe(3);
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
    expect(back.v).toBe(3);
    expect(back.progress).toEqual(p);
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
    expect(done.v).toBe(3);
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
    expect(s.progress.bag).toEqual({ apples: 3 });
    expect(s.progress.said).toEqual(["likeApples"]);
    expect(Number.isNaN(s.player.x)).toBe(true);
  });
});
