import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const access = vi.hoisted(() => ({ debugEnabled: true }));
vi.mock("./debugAccess", () => access);
import { CLOUD_ISLE_RELEASED, cloudIsleOpen, harborDecision, setCloudIsleShipOpen } from "./release";
import { useDebug } from "./debugState";
import { newProgress } from "./logic/progress";
import { encodeSave } from "./logic/save";

beforeEach(() => {
  vi.stubGlobal("location", { search: "?debug=1" });
  access.debugEnabled = true;
  useDebug.setState({ cloudIsleShipOpen: false });
});
afterEach(() => vi.unstubAllGlobals());

describe("Cloud Isle release lock", () => {
  it("ships locked and permits a reversible session debug override", () => {
    expect(CLOUD_ISLE_RELEASED).toBe(false);
    expect(cloudIsleOpen()).toBe(false);
    setCloudIsleShipOpen(true);
    expect(cloudIsleOpen()).toBe(true);
    setCloudIsleShipOpen(false);
    expect(cloudIsleOpen()).toBe(false);
  });

  it("cannot open from an ordinary session, even with stale debug state", () => {
    access.debugEnabled = false;
    setCloudIsleShipOpen(true);
    expect(useDebug.getState().cloudIsleShipOpen).toBe(false);
    useDebug.setState({ cloudIsleShipOpen: true });
    expect(cloudIsleOpen()).toBe(false);
  });

  it("never serializes the override or changes saved progress", () => {
    const p = newProgress(), at = { x: 76, z: -328, yaw: 0 };
    const before = encodeSave(p, at, 100);
    setCloudIsleShipOpen(true);
    expect(encodeSave(p, at, 100)).toBe(before);
    expect(before).not.toContain("cloudIsleShipOpen");
  });

  it("requires debug=1 even when other development controls are enabled", () => {
    vi.stubGlobal("location", { search: "" });
    setCloudIsleShipOpen(true);
    expect(useDebug.getState().cloudIsleShipOpen).toBe(false);
    expect(cloudIsleOpen()).toBe(false);
  });

  it("keeps the first lead and blocks later harbour talks regardless of voyage history", () => {
    const p = newProgress();
    expect(harborDecision(p.act2.harbor)).toBe("lead");
    p.act2.harbor = true;
    for (const done of [false, true]) {
      p.act3.voyageDone = done;
      expect(harborDecision(p.act2.harbor)).toBe("locked");
    }
    setCloudIsleShipOpen(true);
    expect(harborDecision(false)).toBe("lead");
    expect(harborDecision(true)).toBe("sail");
  });
});
