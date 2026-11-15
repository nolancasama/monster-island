import { describe, expect, it } from "vitest";
import { WEARABLES, WEARABLE_IDS, WEARERS } from "../game/data/wearables";
import { MOUNT, WEAR_ANCHORS, outfitGeometry, wearableGeometry } from "./models/wearables";

const triangles = (g: { getAttribute(n: string): { count: number } }) => g.getAttribute("position").count / 3;

describe("wearable models (docs/PORT_TOWN_REVAMP.md §3.5)", () => {
  it("every item is low-poly, vertex-coloured and mounted by its slot", () => {
    for (const id of WEARABLE_IDS) {
      const g = wearableGeometry(id);
      expect(triangles(g), id).toBeGreaterThan(8);
      expect(triangles(g), id).toBeLessThanOrEqual(300);
      expect(g.getAttribute("color"), id).toBeDefined();
      expect(MOUNT[id] === "head", id).toBe(WEARABLES[id].slot === "head");
    }
  });

  it("every wearer has all three anchors, and a full outfit is one geometry of at most 600 triangles", () => {
    for (const who of WEARERS) {
      for (const mount of ["head", "eyes", "mouth"] as const) expect(WEAR_ANCHORS[who][mount].scale, `${who} ${mount}`).toBeGreaterThan(0);
      for (const head of WEARABLE_IDS.filter((i) => WEARABLES[i].slot === "head")) for (const face of WEARABLE_IDS.filter((i) => WEARABLES[i].slot === "face")) {
        const g = outfitGeometry(who, { head, face })!;
        expect(triangles(g), `${who} ${head}+${face}`).toBeLessThanOrEqual(600);
      }
    }
    expect(outfitGeometry("puff", {})).toBeNull();
  });

  it("an anchor scales the shared model without changing it", () => {
    const before = wearableGeometry("crown").getAttribute("position").array.slice();
    const placed = outfitGeometry("ember", { head: "crown" })!;
    expect(wearableGeometry("crown").getAttribute("position").array).toEqual(before);
    placed.computeBoundingSphere();
    expect(placed.boundingSphere!.center.y).toBeGreaterThan(WEAR_ANCHORS.ember.head.pos[1] - 0.1);
  });
});
