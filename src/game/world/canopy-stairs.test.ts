import { describe, expect, it } from "vitest";
import { isWalkable, moveCircle, PLAYER_R, standY } from "./collision";
import { CANOPY_FLIGHTS, CANOPY_FLIGHT_RIMS, CANOPY_RIM_R, canopyRaise, lowlandDeckY, STAGES } from "./lowland";
import { CANOPY_VOIDS, HAZARDS } from "./hazards";
import { fallAhead } from "../logic/falls";

const solved = ["groveLilies", "canopyVines", "canopyRope"] as const;
const open = { act2: true, cleared: STAGES, solved };
const maxSlope = Math.tan(38 * Math.PI / 180);

describe("Canopy stair flights", () => {
  it("walks both flights in both directions at realistic foot and mounted frame steps without stalling or height snaps", () => {
    for (const f of CANOPY_FLIGHTS) for (const radius of [PLAYER_R, .55]) for (const dt of [1 / 60, 1 / 30]) {
      const direction = Math.sign(f.topZ - f.footZ);
      const foot = f.footZ - direction, top = f.topZ + direction;
      for (const [start, end] of [[foot, top], [top, foot]]) {
        const x = (f.x0 + f.x1) / 2;
        let p = { x, z: start }, y = standY(x, start, solved);
        expect(isWalkable(x, start, open, radius)).toBe(true);
        const frames = Math.ceil(Math.abs(end - start) / ((radius === PLAYER_R ? 4.8 : 7) * dt));
        for (let frame = 1; frame <= frames; frame++) {
          const z = start + (end - start) * frame / frames;
          const next = moveCircle(p.x, p.z, x, z, radius, open);
          expect(next.x, f.id).toBeCloseTo(x, 6);
          expect(next.z, `${f.id} frame ${frame}`).toBeCloseTo(z, 6);
          const height = standY(next.x, next.z, solved);
          expect(Math.abs(height - y), `${f.id} height at ${z}`).toBeLessThanOrEqual(maxSlope * Math.abs(z - p.z) + .01);
          p = next; y = height;
        }
      }
    }
  });

  it("shares continuous top and foot heights and stays at or below 38 degrees across the usable width", () => {
    for (const f of CANOPY_FLIGHTS) {
      expect(f.steps).toBeGreaterThan(30);
      expect(f.x1 - f.x0 - 4 * CANOPY_RIM_R).toBeGreaterThanOrEqual(6);
      for (const x of [f.x0 + 1, (f.x0 + f.x1) / 2, f.x1 - 1]) {
        for (const z of [f.footZ, f.topZ]) {
          expect(lowlandDeckY(x, z, solved)).toBeCloseTo(f.height(x, z), 8);
          expect(Math.abs(standY(x, z - .001, solved) - standY(x, z + .001, solved))).toBeLessThan(.002);
        }
        for (let i = 0; i < 1600; i++) {
          const z = f.footZ + (f.topZ - f.footZ) * i / 1600;
          const dz = (f.topZ - f.footZ) / 1600;
          expect(Math.abs((f.height(x, z + dz) - f.height(x, z)) / dz), f.id).toBeLessThanOrEqual(maxSlope);
          // At the eased foot the existing uneven forest ground can meet
          // the line by a fraction of a millimetre before the treads rise.
          expect(Math.abs(standY(x, z, solved) - f.height(x, z)), `${f.id} ground join at ${x},${z}`).toBeLessThan(.005);
        }
      }
    }
    expect(canopyRaise(107.5, -195)).toBe(0);
  });

  it("keeps both long sides solid for either body, with no fall hazard", () => {
    expect(CANOPY_FLIGHT_RIMS).toHaveLength(4);
    for (const f of CANOPY_FLIGHTS) for (const radius of [PLAYER_R, .55]) for (const t of [.1, .5, .9]) for (const sign of [-1, 1]) {
      const z = f.footZ + (f.topZ - f.footZ) * t;
      let p = { x: (f.x0 + f.x1) / 2, z };
      for (let i = 0; i < 70; i++) {
        p = moveCircle(p.x, p.z, p.x + sign * .1, z, radius, open);
        expect(p.x).toBeGreaterThanOrEqual(f.x0 + 2 * CANOPY_RIM_R + radius - 1e-6);
        expect(p.x).toBeLessThanOrEqual(f.x1 - 2 * CANOPY_RIM_R - radius + 1e-6);
        expect(p.z).toBeCloseTo(z, 6);
        expect(fallAhead(p.x, p.z, sign, 0, radius, solved)).toBeNull();
      }
    }
  });

  it("retains the flagged voids and their fall-ahead behavior", () => {
    expect(HAZARDS.filter(h => h.playerFall)).toEqual(CANOPY_VOIDS);
    expect(CANOPY_VOIDS.map(h => [h.id, h.shape])).toEqual([
      ["canopyVines", { kind: "rect", x0: 83, x1: 119, z0: -219.5, z1: -216 }],
      ["canopyRope", { kind: "rect", x0: 83, x1: 119, z0: -229, z1: -225.5 }],
      ["brokenSpanWest", { kind: "rect", x0: 83, x1: 98, z0: -223.8, z1: -221.2 }],
      ["brokenSpanEast", { kind: "rect", x0: 111, x1: 119, z0: -223.8, z1: -221.2 }],
      ["treeRing", { kind: "rect", x0: 88, x1: 92, z0: -234, z1: -230 }],
      ["upperRoot", { kind: "rect", x0: 110, x1: 117, z0: -234, z1: -232.5 }],
    ]);
    for (const radius of [PLAYER_R, .55]) {
      expect(fallAhead(100, -216 + radius, 0, -1, radius, [])?.id).toBe("canopyVines");
      expect(fallAhead(106, -216 + radius, 0, -1, radius, solved)).toBeNull();
    }
  });

  it("blocks the landing until Canopy is cleared and keeps the Causeway spawn pockets open", () => {
    const closed = { ...open, cleared: STAGES.filter(id => id !== "canopy") };
    for (const radius of [PLAYER_R, .55]) {
      const shut = moveCircle(96, -236.5, 96, -240, radius, closed);
      expect(shut.z).toBeGreaterThanOrEqual(-237.6 + radius);
      expect(moveCircle(96, -236.5, 96, -240, radius, open).z).toBeCloseTo(-240, 6);
      for (const [x, z] of [[85, -247.4], [103, -247.5], [103.4, -251.8], [107.4, -249.2]])
        expect(isWalkable(x, z, open, radius), `${x},${z}`).toBe(true);
    }
  });
});
