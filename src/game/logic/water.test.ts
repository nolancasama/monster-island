import { describe, expect, it } from "vitest";
import { ISLET, POND } from "../world/hazards";
import { lowlandY, STREAMS, streamY } from "../world/lowland";
import { STREAM_WIDTH, streamBanks } from "../world/streams";
import { POND_WADE, waterAt } from "./water";
import { hazardAt } from "./elements";
import { inGroveSwamp, shallowWaterAt } from "../world/groveShallows";

describe("water classification", () => {
  it("distinguishes pond rim, deep water and the dry bank", () => {
    expect(waterAt(POND.x + POND.r + .01, POND.z, "home")).toBe("none");
    expect(waterAt(POND.x + POND.r - .01, POND.z, "home")).toBe("shallow");
    expect(waterAt(POND.x + POND.r - POND_WADE, POND.z, "home")).toBe("shallow");
    expect(waterAt(POND.x + POND.r - POND_WADE - .01, POND.z, "home")).toBe("deep");
    expect(waterAt(POND.x, POND.z + 4.5, "home")).toBe("deep");
    expect(waterAt(POND.x, POND.z + 4.5, "cloud")).toBe("none");
  });

  it("excludes safe islets and solved bridges, but not unsolved bridges", () => {
    expect(waterAt(ISLET.x, ISLET.z, "home")).toBe("none");
    expect(waterAt(-41.5, 67, "cloud")).toBe("deep");
    expect(waterAt(-41.5, 67, "cloud", ["coastWindmill"])).toBe("none");
    expect(waterAt(-43.01, 75, "cloud")).toBe("none");
    expect(waterAt(-42.9, 75, "cloud")).toBe("shallow");
    expect(waterAt(90, -222, "home")).toBe("none"); // Fall gaps are not water.
  });

  it("matches the rendered stream banks and only submerged terrain", () => {
    // First stream: sample the actual interpolated
    // bank normal so that bend joins have exactly the rendered width.
    const banks = streamBanks(STREAMS[0], STREAM_WIDTH);
    let wet = 0, exposed = 0;
    for (let segment = 1; segment < banks.length; segment++) {
      const a = banks[segment - 1], b = banks[segment];
      for (let i = 1; i < 10; i++) for (let j = 1; j < 10; j++) {
        const t = i / 10, u = j / 10;
        const leftX = a[0] + (b[0] - a[0]) * t, leftZ = a[1] + (b[1] - a[1]) * t;
        const x = leftX + (a[2] + (b[2] - a[2]) * t - leftX) * u;
        const z = leftZ + (a[3] + (b[3] - a[3]) * t - leftZ) * u;
        const submerged = lowlandY(x, z) < streamY(x, z);
        // Deep authored hazards take priority where a tributary meets a pool.
        // Authored swamp floor replaces the former decorative ribbons here;
        // its dry puzzle banks take priority even over a submerged old bed.
        const renderedWet = inGroveSwamp(x, z) ? shallowWaterAt(x, z) : submerged;
        if (!hazardAt(x, z, "home")) expect(waterAt(x, z, "home")).toBe(renderedWet ? "shallow" : "none");
        expect(waterAt(x, z, "cloud")).toBe("none");
        if (submerged) wet++; else exposed++;
      }
    }
    expect(wet).toBeGreaterThan(0);
    expect(exposed).toBeGreaterThan(0);
    // Beyond the visible bank, even though the terrain channel is wider.
    for (const [x, z] of [[38, -213.7], [55.9, -215.85]])
      expect(waterAt(x, z, "home")).toBe(shallowWaterAt(x, z) ? "shallow" : "none");
  });
});
