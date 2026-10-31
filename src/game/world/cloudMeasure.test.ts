import { expect, it } from "vitest";
import { CLOUD_BASELINE, measureCloudArea } from "./cloudMeasure";

it("measures the expanded island: at least 3x the original floor, every area at scale, and doubled dock-to-junction travel with both branches and the permanent barricade", () => {
  const report = measureCloudArea();
  for (const [area, minimum] of Object.entries({ cloudDock: 350, stormbreakCoast: 2600, hiddenHollow: 700, backTunnel: 300, windfallJunction: 800, skyrootCanopy: 1350, thunderGrotto: 1350, observatoryApproach: 200, ancientObservatory: 850 })) {
    expect(report.per[area], area).toBeGreaterThanOrEqual(minimum);
  }
  expect(report.dockJunction).toBeGreaterThanOrEqual(CLOUD_BASELINE.dockJunction * 2);
  // The brief's requirement: at least three times the original walkable floor.
  expect(report.total).toBeGreaterThanOrEqual(CLOUD_BASELINE.total * 3);
  expect(report.routeCanopy).toBeGreaterThanOrEqual(CLOUD_BASELINE.routeCanopy * 2);
  expect(report.routeGrotto).toBeGreaterThanOrEqual(CLOUD_BASELINE.routeGrotto * 2);
  expect(report.observatoryViaCanopy).toBe(true);
  expect(report.observatoryViaGrotto).toBe(true);
  expect(report.barricadePassable).toBe(false);
}, 30000);
