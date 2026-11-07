import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LAYER_ENTRY, LAYER_PORTALS, layerOfZone, portalSwitch, registerLayerWorld, unregisterLayerWorld, type LayerPortal } from "./layers";
import { region } from "./region";
import { gatesOf, isWalkable, moveCircle, nearestWalkable, standY } from "./collision";
import { zoneAt } from "./lowland";
import { hazardAt } from "../logic/elements";
import { cameraProfileAt } from "../../scene/cameraProfiles";
import { decodeSave } from "../logic/save";
import { newProgress } from "../logic/progress";

// A fixture treetop: a 6 m leaf disc 20 m up, directly above lower-Canopy deck
// (100, -213), with one solid post and a fall hazard around the leaf.
const LEAF = { x: 100, z: -213, r: 3, y: 21 };
const onLeaf = (x: number, z: number, m: number) => Math.hypot(x - LEAF.x, z - LEAF.z) <= LEAF.r - m;
const open = { solved: ["canopyAscentRope", "canopyVines", "canopyRope"] as const, act2: true, cleared: [] as const };
/** The browser specs' Act 2 arrival, standing in the lower Canopy. */
function act2Progress() {
  const p = newProgress();
  for (const id of ["leafy", "bubbo", "puff", "ember", "lumo"] as const)
    p.monsters[id] = { discovered: true, friend: true, asked: {}, canKnown: {}, described: { name: true, size: true, part: true }, invited: true };
  p.active = "puff"; p.metMaple = true; p.endings = 3;
  p.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame", "canopyAscentRope"];
  p.act2 = { ...p.act2, started: true, lumoTaken: true, descended: true, zone: "canopy", checkpoint: "cliff",
    cleared: ["forest1"], tutorial: ["attack", "coins", "special", "eat", "rest", "switch"] };
  return p;
}
const PORTAL: LayerPortal = { id: "fixture", from: "ground", to: "high", at: { x: 100, z: -210 }, n: { x: 0, z: -1 }, enter: .45, half: 2 };

beforeEach(() => {
  registerLayerWorld("high", {
    zoneAt: (x, z) => onLeaf(x, z, 0) ? "upperCanopy" : null,
    walkable: (x, z, m) => onLeaf(x, z, m),
    surfaceY: (x, z) => onLeaf(x, z, 0) ? LEAF.y : -Infinity,
    solids: [{ kind: "circle", x: 101.5, z: -213, r: .4 }],
    hazards: [{ id: "fixtureFall", world: "home", kind: "fall", playerFall: true, shape: { kind: "disc", x: LEAF.x, z: LEAF.z, r: 6 }, safe: [{ kind: "disc", x: LEAF.x, z: LEAF.z, r: LEAF.r }] }],
  });
  LAYER_ENTRY.high = { x: LEAF.x - 1, z: LEAF.z };
});
afterEach(() => {
  unregisterLayerWorld("high");
  delete LAYER_ENTRY.high;
  LAYER_PORTALS.length = 0;
  region.layer = "ground";
});

describe("traversal layers", () => {
  it("keeps the ground's answers at a point with a leaf above it", () => {
    const ground = { walk: isWalkable(LEAF.x, LEAF.z, open, .35), y: standY(LEAF.x, LEAF.z, open.solved), zone: zoneAt(LEAF.x, LEAF.z) };
    expect(ground.zone).toBe("canopy");
    expect(ground.y).toBeLessThan(14);
    // Explicit and default (active) layer agree; the high layer has its own answers.
    expect(isWalkable(LEAF.x, LEAF.z, open, .35, false, "high")).toBe(true);
    expect(standY(LEAF.x, LEAF.z, open.solved, "high")).toBe(LEAF.y);
    expect(zoneAt(LEAF.x, LEAF.z, "high")).toBe("upperCanopy");
    region.layer = "high";
    expect(standY(LEAF.x, LEAF.z, open.solved)).toBe(LEAF.y);
    expect(isWalkable(LEAF.x + 4, LEAF.z, open, .35)).toBe(false); // ground deck below, but not here
    region.layer = "ground";
    expect({ walk: isWalkable(LEAF.x, LEAF.z, open, .35), y: standY(LEAF.x, LEAF.z, open.solved), zone: zoneAt(LEAF.x, LEAF.z) }).toEqual(ground);
  });

  it("uses only the layer's own solids and hazards", () => {
    expect(isWalkable(101.5, -213, open, .35, false, "high")).toBe(false); // the fixture post
    expect(isWalkable(101.5, -213, open, .35, false, "ground")).toBe(true); // no post on the deck
    region.layer = "high";
    expect(hazardAt(LEAF.x + 4.5, LEAF.z, "home", [])?.id).toBe("fixtureFall");
    expect(hazardAt(106, -217.5, "home", [])).toBeNull(); // the lower Canopy's void is not up here
    region.layer = "ground";
    expect(hazardAt(LEAF.x + 4.5, LEAF.z, "home", [])).toBeNull();
    expect(hazardAt(106, -217.5, "home", [])?.id).toBe("canopyVines");
  });

  it("moves and projects walkers within their layer", () => {
    region.layer = "high";
    const q = moveCircle(LEAF.x, LEAF.z, LEAF.x - 6, LEAF.z, .35, gatesOf({ ...newProgress(), act2: { ...newProgress().act2, started: true } }));
    expect(Math.hypot(q.x - LEAF.x, q.z - LEAF.z)).toBeLessThanOrEqual(LEAF.r - .35 + 1e-6);
    const near = nearestWalkable(LEAF.x - 5, LEAF.z, .35, open);
    expect(onLeaf(near.x, near.z, .35)).toBe(true);
  });

  it("switches at a portal with a dead band and never toggles in place", () => {
    LAYER_PORTALS.push(PORTAL);
    expect(portalSwitch("ground", 100, -210.3)).toBeNull(); // inside the dead band
    expect(portalSwitch("ground", 100, -210.5)).toBe("high");
    expect(portalSwitch("high", 100, -210.5)).toBeNull();
    expect(portalSwitch("high", 100, -209.7)).toBeNull();
    expect(portalSwitch("high", 100, -209.5)).toBe("ground");
    expect(portalSwitch("ground", 103, -210.5)).toBeNull(); // beside the strip
    for (let z = -210.4; z <= -209.6; z += .1) {
      expect(portalSwitch("ground", 100, z)).toBeNull();
      expect(portalSwitch("high", 100, z)).toBeNull();
    }
  });

  it("maps zones to layers", () => {
    expect(layerOfZone("cave")).toBe("cave");
    expect(layerOfZone("upperCanopy")).toBe("high");
    expect(layerOfZone("summit")).toBe("high");
    expect(layerOfZone("canopy")).toBe("ground");
    expect(layerOfZone(null)).toBe("ground");
  });

  it("never gives a treetop walker a ground camera", () => {
    const above = { x: LEAF.x, y: LEAF.y, z: LEAF.z, climbing: false, cloud: false };
    expect(cameraProfileAt(above).id).toBe("ancient-canopy");
    expect(cameraProfileAt({ ...above, layer: "high" }).id).not.toBe("ancient-canopy");
    expect(cameraProfileAt({ ...above, layer: "high" }).id).toBe("upper-canopy");
  });

  it("loads a layered save on its layer, or its entry, or the ground", () => {
    const p = act2Progress();
    const save = (x: number, z: number, layer?: string) => JSON.stringify({ v: 4, progress: p, player: { x, z, yaw: 0, layer }, seconds: 1 });
    const on = decodeSave(save(LEAF.x + .5, LEAF.z, "high"))!;
    expect(on.player).toMatchObject({ x: LEAF.x + .5, z: LEAF.z, layer: "high" });
    expect(on.progress.act2.zone).toBe("upperCanopy");
    const off = decodeSave(save(LEAF.x + 5, LEAF.z, "high"))!;
    expect(off.player).toMatchObject({ ...LAYER_ENTRY.high, layer: "high" });
    unregisterLayerWorld("high");
    const gone = decodeSave(save(LEAF.x + .5, LEAF.z, "high"))!;
    expect(gone.player.layer).toBeUndefined();
    const plain = decodeSave(save(100, -212))!;
    expect(plain.player.layer).toBeUndefined();
    expect(isWalkable(gone.player.x, gone.player.z, gatesOf(gone.progress), .35, false, "ground")).toBe(true);
  });

  it("validates ground saves on the ground even while the live game is on another layer", () => {
    const p = act2Progress();
    region.layer = "high";
    const loaded = decodeSave(JSON.stringify({ v: 4, progress: p, player: { x: 100, z: -212, yaw: 0 }, seconds: 1 }))!;
    expect(region.layer).toBe("high");
    expect(loaded.player).toMatchObject({ x: 100, z: -212 });
    expect(loaded.player.layer).toBeUndefined();
  });
});
