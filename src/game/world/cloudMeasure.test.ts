import { expect, it } from "vitest";
import { CLOUD_BASELINE, measureCloudArea } from "./cloudMeasure";

it("measures X1 and X2a floor and doubled dock-to-junction travel with both branches and the permanent barricade", () => {
  const report = measureCloudArea();
  for (const [area, minimum] of Object.entries({ cloudDock: 350, stormbreakCoast: 2600, hiddenHollow: 700, backTunnel: 300, windfallJunction: 800, skyrootCanopy: 1350 })) {
    expect(report.per[area], area).toBeGreaterThanOrEqual(minimum);
  }
  expect(report.dockJunction).toBeGreaterThanOrEqual(CLOUD_BASELINE.dockJunction * 2);
  expect(report.observatoryViaCanopy).toBe(true);
  expect(report.observatoryViaGrotto).toBe(true);
  expect(report.barricadePassable).toBe(false);
}, 30000);
