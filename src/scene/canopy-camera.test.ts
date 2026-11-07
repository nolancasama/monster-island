import { expect, it } from "vitest";
import { CANOPY_ROPES, CLIFF_ROPE } from "../game/world/lowland";
import { cameraProfileAt } from "./cameraProfiles";

const lens = (x: number, z: number, climbing = false) => {
  const p = cameraProfileAt({ x, z, y: 3, climbing, cloud: false });
  const h = p.dist * Math.cos(p.pitch);
  return { id: p.id, x: x + Math.sin(p.yaw) * h, z: z + Math.cos(p.yaw) * h };
};

it("the entrance rope's climb camera stays on the open forest side of the wall", () => {
  const r = CANOPY_ROPES.entrance, c = lens(r.x, r.bodyZ, true);
  expect(c.id).toBe("canopy-entrance-rope");
  expect(c.z).toBeGreaterThan(r.faceZ + 3);
});

it("the exit rope's climb camera stays north while the foot keeps the fixed Causeway lens", () => {
  const r = CANOPY_ROPES.exit;
  expect(lens(r.x, r.bodyZ, true).z).toBeLessThan(r.faceZ - 3);
  for (let z = r.foot.z; z > -251; z -= 1) {
    const c = lens(r.x, z);
    expect(c.id).toBe("ruined-causeway");
    expect(c.x).toBe(r.x);
    expect(c.z).toBeCloseTo(z + 10.5 * Math.cos(.8));
  }
});

it("the sanctuary rope keeps its own climb framing and the open Causeway uses its fixed profile", () => {
  expect(lens(CLIFF_ROPE.x, CLIFF_ROPE.bodyZ, true).id).toBe("cliff-rope");
  expect(lens(76, -256).id).toBe("ruined-causeway");
});
