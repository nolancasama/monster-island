import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newProgress } from "../logic/progress";
import { getGame, setGame } from "../store";
import { rt } from "../runtime";
import { region } from "../world/region";
import { COMPANION_IDS } from "../data/combat";
import { DECK_Y, SHIP, SPOT, shipFloorY, shipWalkable } from "../world/pirateShip";
import { PLAYER_R } from "../world/collision";
import { resetVoyageRt, vy, type CrewId } from "../voyageRt";
import { cookMarker, setPhase } from "../voyageSim";
import { HUDDLE, HUDDLE_PARTY, HUDDLE_PIRATES, crewHome, huddleUp, setScene } from "./voyage";

vi.mock("../../audio/audio", () => ({ audio: { play: vi.fn(), voice: vi.fn(), startMusic: vi.fn(), cancelPanic: vi.fn(), stopFlame: vi.fn() } }));
// Server rendering reads the store's state directly (no React subscription).
vi.mock("../store", async (importOriginal) => {
  const store = await importOriginal<typeof import("../store")>();
  const useGame = Object.assign(<T,>(pick: (s: ReturnType<typeof store.getGame>) => T) => pick(store.getGame()), store.useGame);
  return { ...store, useGame };
});
import { VoyageBag } from "../../ui/VoyageHud";

const local = (w: { x: number; z: number }) => ({ x: w.x - SHIP.x, z: w.z - SHIP.z });

beforeEach(() => {
  const p = newProgress();
  p.act2.started = true;
  p.bag = { apples: 2, fish: 1 };
  setGame({ screen: "game", progress: p, voyageBag: null });
  region.world = "home";
  resetVoyageRt();
});
afterEach(() => { setPhase(null); resetVoyageRt(); });

describe("the capture: a fade, then the party huddled and surrounded", () => {
  it("everyone in the huddle stands on open deck, close together but never inside each other", () => {
    const party = Object.values(HUDDLE_PARTY);
    for (const s of party) expect(shipWalkable(SHIP.x + s.x, SHIP.z + s.z, PLAYER_R), JSON.stringify(s)).toBe(true);
    for (let i = 0; i < party.length; i++) for (let j = i + 1; j < party.length; j++) {
      const d = Math.hypot(party[i].x - party[j].x, party[i].z - party[j].z);
      expect(d).toBeGreaterThan(1.0);
      expect(d).toBeLessThan(2.4);
    }
    for (const s of party) expect(Math.hypot(s.x - HUDDLE.x, s.z - HUDDLE.z)).toBeLessThan(1.3);
  });

  it("the seven pirates ring the huddle on open deck, apart from each other and from the party", () => {
    const pirates = Object.values(HUDDLE_PIRATES);
    expect(pirates).toHaveLength(7);
    for (const s of pirates) {
      expect(shipWalkable(SHIP.x + s.x, SHIP.z + s.z, PLAYER_R), JSON.stringify(s)).toBe(true);
      for (const q of Object.values(HUDDLE_PARTY)) expect(Math.hypot(s.x - q.x, s.z - q.z)).toBeGreaterThan(1.3);
    }
    for (let i = 0; i < pirates.length; i++) for (let j = i + 1; j < pirates.length; j++)
      expect(Math.hypot(pirates[i].x - pirates[j].x, pirates[i].z - pirates[j].z)).toBeGreaterThan(1.3);
    // The stern side (toward the camera) stays open: nobody stands between the lens and the party.
    for (const s of pirates) expect(s.z - HUDDLE.z).toBeLessThan(1.0);
  });

  it("huddleUp puts the party in place on the deck, facing out, and the crew facing in", () => {
    setScene();
    rt.player.floatY = 3; vy.monY.leafy = 9;
    huddleUp();
    const p = rt.player;
    expect(local(p)).toEqual(expect.objectContaining({ x: expect.closeTo(HUDDLE_PARTY.player.x, 6), z: expect.closeTo(HUDDLE_PARTY.player.z, 6) }));
    expect(p.floatY).toBeNull();
    expect(rt.voyage.active).toBe(false);
    expect(vy.boatMoored).toBe(true);
    // The player faces Redbeard across the huddle.
    const red = HUDDLE_PIRATES.redbeard, toRed = Math.atan2(red.x - HUDDLE_PARTY.player.x, red.z - HUDDLE_PARTY.player.z);
    expect(Math.abs(Math.atan2(Math.sin(p.yaw - toRed), Math.cos(p.yaw - toRed)))).toBeLessThan(0.05);
    for (const id of COMPANION_IDS) {
      const m = rt.monsters[id], at = local(m);
      expect(at.x).toBeCloseTo(HUDDLE_PARTY[id].x, 6);
      expect(at.z).toBeCloseTo(HUDDLE_PARTY[id].z, 6);
      expect(vy.monY[id]).toBeUndefined();
      expect(m.mode).toBe("script");
    }
    for (const id of Object.keys(HUDDLE_PIRATES) as Array<keyof typeof HUDDLE_PIRATES>) {
      const c = vy.crew[id];
      expect(c.menace).toBe(true);
      const inward = Math.atan2(HUDDLE.x - c.x, HUDDLE.z - c.z);
      expect(Math.abs(Math.atan2(Math.sin(c.yaw - inward), Math.cos(c.yaw - inward)))).toBeLessThan(1e-6);
      expect(shipFloorY(c.x, c.z)).toBeCloseTo(DECK_Y, 6);
    }
  });

  it("afterwards the crew go home to their own places and stop closing in", () => {
    setScene();
    huddleUp();
    crewHome();
    for (const c of Object.values(vy.crew)) expect(c.menace).toBe(false);
    expect([vy.crew.redbeard.x, vy.crew.redbeard.z]).toEqual([SPOT.captain.x, SPOT.captain.z]);
    expect([vy.crew.gull.x, vy.crew.gull.z]).toEqual([SPOT.gull.x, SPOT.gull.z]);
    expect([vy.crew.max.x, vy.crew.max.z]).toEqual([SPOT.crew[2].x, SPOT.crew[2].z]);
  });
});

describe("the cooking markers", () => {
  const cooking = () => setPhase({ name: "cooking" });

  it("nothing is marked outside the cooking job, or before a dish is ready", () => {
    vy.cook.dish = "fish";
    expect(cookMarker()).toBeNull();
    cooking();
    vy.cook.dish = null; vy.cook.order = { who: "tom", food: "fish" };
    expect(cookMarker()).toBeNull();
  });

  it("marks the finished dish, then only the pirate who ordered it, then nothing once served", () => {
    cooking();
    vy.cook.order = { who: "sam", food: "meat" };
    vy.cook.dish = "meat";
    const dish = cookMarker()!;
    expect(dish.kind).toBe("dish");
    expect([dish.x, dish.z]).toEqual([SPOT.stove.x, SPOT.stove.z]);
    expect(dish.y).toBeGreaterThan(DECK_Y + 1.4);
    // Taken: the marker moves to Sam (never Tom or Max).
    vy.cook.dish = null; vy.carry = { kind: "dish", food: "meat" };
    const crew = cookMarker()!;
    expect(crew).toEqual(expect.objectContaining({ kind: "crew", who: "sam" as CrewId, x: vy.crew.sam.x, z: vy.crew.sam.z }));
    // Served: gone; the next order repeats the same steps.
    vy.carry = null; vy.cook.order = null;
    expect(cookMarker()).toBeNull();
    vy.cook.order = { who: "max", food: "fish" }; vy.cook.dish = "fish";
    expect(cookMarker()?.kind).toBe("dish");
    vy.cook.dish = null; vy.carry = { kind: "dish", food: "fish" };
    expect(cookMarker()?.who).toBe("max");
  });
});

describe("Redbeard's questions show the bag", () => {
  it("lists every food in the bag with its count and lights up the food asked about", () => {
    expect(renderToStaticMarkup(createElement(VoyageBag))).toBe("");
    setGame({ voyageBag: { target: "fish" } });
    const html = renderToStaticMarkup(createElement(VoyageBag));
    expect(html).toContain('data-testid="voyage-bag"');
    expect(html).toMatch(/data-testid="voyage-bag-apples"[^>]*>.*?<b>2<\/b>/);
    expect(html).toMatch(/voyage-bag-item target"[^>]*data-testid="voyage-bag-fish"[^>]*data-target="true"[^>]*>.*?<b>1<\/b>/);
  });

  it("shows an asked-about food the bag does not hold as 0, and the counts follow the bag", () => {
    setGame({ voyageBag: { target: "bananas" } });
    expect(renderToStaticMarkup(createElement(VoyageBag))).toMatch(/data-testid="voyage-bag-bananas"[^>]*>.*?<b>0<\/b>/);
    setGame({ progress: { ...getGame().progress, bag: { apples: 1, fish: 1 } } });
    expect(renderToStaticMarkup(createElement(VoyageBag))).toMatch(/data-testid="voyage-bag-apples"[^>]*>.*?<b>1<\/b>/);
  });
});
