import { describe, expect, it } from "vitest";
import { PLAYER_R, isWalkable } from "../world/collision";
import { HAZARDS } from "../world/hazards";
import { STAGES } from "../world/lowland";
import { CANOPY_LANDINGS, FALL_DAMAGE, fallAhead, fallHeight, fallLanding, hpAfterFall, safeFromFalls } from "./falls";

const gates = { solved: [], act2: true, cleared: STAGES };

describe("player falls", () => {
  it("flags only Canopy voids, on the home island", () => {
    const flagged = HAZARDS.filter(h => h.playerFall);
    expect(flagged.length).toBeGreaterThan(3);
    for (const h of flagged) {
      expect(h.world).toBe("home");
      expect(h.kind).toBe("fall");
      expect(h.shape.kind === "rect" && h.shape.x0 >= 83 && h.shape.x1 <= 119 && h.shape.z1 < -200).toBe(true);
    }
  });

  it("only an edge of a flagged void is a fall; the Grove, arm and causeway never are", () => {
    // Facing the vines gap from the clearing, at the walker's stopping distance.
    expect(fallAhead(100, -216 + PLAYER_R, 0, -1, PLAYER_R, [])?.id).toBe("canopyVines");
    expect(fallAhead(100, -212, 0, -1, PLAYER_R, [])).toBeNull();
    expect(fallAhead(100, -216 + PLAYER_R, 0, 1, PLAYER_R, [])).toBeNull();
    for (const [x, z] of [[60, -220], [42, -190], [76, -250], [35, -223]]) expect(fallAhead(x, z, 1, 0, PLAYER_R, [])).toBeNull();
  });

  it("a built bridge's rails stop a side step, while the open lip beside it stays dangerous", () => {
    const solved = ["canopyVines"];
    expect(fallAhead(106.6, -217.7, 1, 0, PLAYER_R, solved)).toBeNull();
    expect(fallAhead(104, -216 + PLAYER_R, 0, -1, PLAYER_R, solved)?.id).toBe("canopyVines");
    // Unbuilt, the same step off is a real fall.
    expect(fallAhead(106, -216 + PLAYER_R, 0, -1, PLAYER_R, [])?.id).toBe("canopyVines");
  });

  it("recorded ground and both fallback landings are walkable and never on an edge", () => {
    for (const p of Object.values(CANOPY_LANDINGS)) {
      expect(isWalkable(p.x, p.z, gates, PLAYER_R), `${p.x},${p.z}`).toBe(true);
      expect(safeFromFalls(p.x, p.z, [])).toBe(true);
    }
    expect(safeFromFalls(100, -216 + PLAYER_R, [])).toBe(false);
    expect(fallLanding({ x: 1, z: 2 }, -220)).toEqual({ x: 1, z: 2 });
    expect(fallLanding(null, -220)).toBe(CANOPY_LANDINGS.south);
    expect(fallLanding(null, -233)).toBe(CANOPY_LANDINGS.north);
  });

  it("costs HP without ever knocking out", () => {
    expect(hpAfterFall(100)).toBe(100 - FALL_DAMAGE);
    expect(hpAfterFall(5)).toBe(1);
    expect(hpAfterFall(1)).toBe(1);
  });

  it("descends visibly, then rests at the floor", () => {
    expect(fallHeight(12, 2, .3)).toBeLessThan(12);
    expect(fallHeight(12, 2, .3)).toBeGreaterThan(2);
    expect(fallHeight(12, 2, 5)).toBe(1.7);
  });
});
