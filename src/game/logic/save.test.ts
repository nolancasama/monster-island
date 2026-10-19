import { describe, expect, it } from "vitest";
import { decodeSave, encodeSave } from "./save";
import { befriend, discover, newProgress, noteSaid, pickUp, recordLike, solve } from "./progress";

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
    expect(s.progress.finished).toBe(false);
    expect(s.progress.bag).toEqual({ apples: 3 });
    expect(s.progress.said).toEqual(["likeApples"]);
    expect(Number.isNaN(s.player.x)).toBe(true);
  });
});
