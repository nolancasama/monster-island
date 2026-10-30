import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../debugAccess", () => ({ debugEnabled: true }));
import { clearSave, DEBUG_SAVE_KEY, encodeSave, readSave, SAVE_KEY, SAVE_KEY_V1, SAVE_KEY_V2, SAVE_KEY_V3, writeSave } from "./save";
import { newProgress } from "./progress";
import { SPAWN } from "../world/island";

afterEach(() => vi.unstubAllGlobals());
describe("debug save isolation", () => {
  it("never reads, writes or clears real or migration keys", () => {
    const real = encodeSave(newProgress(), SPAWN, 100);
    const keys = [SAVE_KEY, SAVE_KEY_V1, SAVE_KEY_V2, SAVE_KEY_V3];
    const storage = new Map(keys.map(key => [key, real]));
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    });
    expect(readSave()).toBeNull();
    writeSave(encodeSave(newProgress(), SPAWN, 10));
    expect(readSave()?.seconds).toBe(10);
    expect(storage.has(DEBUG_SAVE_KEY)).toBe(true);
    clearSave();
    expect(storage.has(DEBUG_SAVE_KEY)).toBe(false);
    for (const key of keys) expect(storage.get(key)).toBe(real);
  });
});
