import { describe, expect, it } from "vitest";
import { GROVE_DOOR, GROVE_DOOR_RETURNS, LOWLAND_RIDGES, lowlandSolids } from "../../game/world/lowland";
import { groundY } from "../../game/world/island";
import { groveDoorFrameGeometry, groveDoorGeometry } from "./groveDoor";

describe("Grove stone gate geometry", () => {
  it("matches both post footprints to solids and joins the existing ridge ends", () => {
    const solids = lowlandSolids();
    const geometry = groveDoorFrameGeometry();
    const p = geometry.getAttribute("position");
    const y = groundY(GROVE_DOOR.x, GROVE_DOOR.z);
    for (const side of [-1, 1]) {
      const x = GROVE_DOOR.x + side * (GROVE_DOOR.half + GROVE_DOOR.postWidth / 2);
      expect(solids).toContainEqual({ kind: "box", x, z: GROVE_DOOR.z, hx: GROVE_DOOR.postWidth / 2, hz: GROVE_DOOR.depth / 2, yaw: 0 });
      for (const edge of [-1, 1]) {
        let hasCorner = false;
        for (let i = 0; i < p.count; i++) {
          if (Math.abs(p.getX(i) - (x + edge * GROVE_DOOR.postWidth / 2)) < 1e-4 &&
              Math.abs(p.getZ(i) - (GROVE_DOOR.z + GROVE_DOOR.depth / 2)) < 1e-4 &&
              Math.abs(p.getY(i) - y) < 1e-4) hasCorner = true;
        }
        expect(hasCorner).toBe(true);
      }
    }
    for (const wall of GROVE_DOOR_RETURNS) {
      expect(solids).toContainEqual({ kind: "capsule", ...wall });
      expect(LOWLAND_RIDGES.some(r =>
        Math.hypot(r.ax - wall.bx, r.az - wall.bz) < 1e-4 ||
        Math.hypot(r.bx - wall.bx, r.bz - wall.bz) < 1e-4
      )).toBe(true);
    }
    geometry.dispose();
  });

  it("keeps the frame outside the full trail opening below the lintel", () => {
    const geometry = groveDoorFrameGeometry();
    const p = geometry.getAttribute("position");
    const lintelY = groundY(GROVE_DOOR.x, GROVE_DOOR.z) + GROVE_DOOR.height;
    // Check triangle bounds, so a triangle spanning the opening cannot pass just
    // because its individual vertices stand outside it.
    for (let i = 0; i < p.count; i += 3) {
      const xs = [p.getX(i), p.getX(i + 1), p.getX(i + 2)];
      const ys = [p.getY(i), p.getY(i + 1), p.getY(i + 2)];
      if (Math.min(...ys) >= lintelY - 1e-4) continue;
      const left = GROVE_DOOR.x - GROVE_DOOR.half, right = GROVE_DOOR.x + GROVE_DOOR.half;
      expect(Math.max(...xs) <= left + 1e-4 || Math.min(...xs) >= right - 1e-4).toBe(true);
    }
    geometry.dispose();
  });

  it("parks both open doors fully outside the walk band", () => {
    for (const dir of [1, -1] as const) {
      const geometry = groveDoorGeometry(dir);
      geometry.rotateY(dir * GROVE_DOOR.openAngle);
      geometry.translate(GROVE_DOOR.x - dir * GROVE_DOOR.half, 0, GROVE_DOOR.z);
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox!;
      if (dir === 1) expect(bounds.max.x).toBeLessThanOrEqual(GROVE_DOOR.x - GROVE_DOOR.half + 1e-4);
      else expect(bounds.min.x).toBeGreaterThanOrEqual(GROVE_DOOR.x + GROVE_DOOR.half - 1e-4);
      geometry.dispose();
    }
  });
});
