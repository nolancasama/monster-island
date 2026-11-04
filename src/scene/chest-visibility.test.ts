import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newProgress } from "../game/logic/progress";
import { setGame } from "../game/store";
import { SECRET_IDS } from "../game/world/elementObjects";
import { CHESTS } from "../game/world/lowland";

const { frames, smoke } = vi.hoisted(() => ({ frames: [] as Array<(state: unknown, dt: number) => void>, smoke: vi.fn() }));
vi.mock("@react-three/fiber", () => ({ useFrame: (fn: (state: unknown, dt: number) => void) => frames.push(fn) }));
vi.mock("../game/smoke", () => ({ revealSmoke: smoke }));
// Server rendering reads the store's initial state; these tests set progress first.
vi.mock("../game/store", async importOriginal => {
  const store = await importOriginal<typeof import("../game/store")>();
  return { ...store, useGame: <T,>(pick: (s: ReturnType<typeof store.getGame>) => T) => pick(store.getGame()) };
});
vi.mock("./materials", () => ({ additiveSprite: () => ({ opacity: 0 }), flatMat: {} }));
import { Chest } from "./Chest";

afterEach(() => { frames.length = 0; smoke.mockClear(); setGame({ progress: newProgress() }); });

describe("chest visibility", () => {
  it.each(SECRET_IDS)("hides the entire %s chest until discovery and puffs once", id => {
    const chest = CHESTS.find(c => c.secret === id)!;
    const p = newProgress();
    setGame({ screen: "game", progress: p });
    const hidden = renderToStaticMarkup(createElement(Chest, { id: chest.id, visible: () => true }));
    expect(hidden).toBe("");
    const frame = frames[0];
    frame(null, .016);
    expect(smoke).not.toHaveBeenCalled();
    setGame({ progress: { ...p, act2: { ...p.act2, secrets: [id] } } });
    frame(null, .016);
    frame(null, .016);
    expect(smoke).toHaveBeenCalledTimes(1);
    frames.length = 0;
    const revealed = renderToStaticMarkup(createElement(Chest, { id: chest.id, visible: () => true }));
    expect(revealed).toContain("<mesh");
    frames[0](null, .016);
    expect(smoke).toHaveBeenCalledTimes(1);
  });

  it("plays no smoke when Continue loads an already discovered secret", () => {
    const p = newProgress();
    setGame({ screen: "title", progress: p });
    renderToStaticMarkup(createElement(Chest, { id: "emberThicketChest", visible: () => true }));
    frames[0](null, .016);
    setGame({ screen: "game", progress: { ...p, act2: { ...p.act2, secrets: ["emberThicket"] } } });
    frames[0](null, .016);
    frames[0](null, .016);
    expect(smoke).not.toHaveBeenCalled();
  });

  it("shows an ordinary chest without discovery", () => {
    setGame({ progress: newProgress() });
    expect(renderToStaticMarkup(createElement(Chest, { id: "forestChest", visible: () => true }))).toContain("<mesh");
  });
});
