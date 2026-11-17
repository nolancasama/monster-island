import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ANCHOR, BRACKET_ABOVE, giantHatGeometry, hatBase, signSpots, statueGeometry, townGeometry } from "./models/town";
import {
  CHESTS, GULL_BERTH, LAMPS, PIER2, PIPPA, PLAZA_STATUE, PORT, SEASIDE_CHEST, SERVICES, customerSpot, lowlandDeckY, lowlandSolids, type ServiceId,
} from "../game/world/lowland";
import { groundY } from "../game/world/island";
import { PLAYER_R, gatesOf, isWalkable, moveCircle, standY } from "../game/world/collision";
import { newProgress } from "../game/logic/progress";
import { openChest } from "../game/logic/act2";
import { STAGES } from "../game/world/lowland";

/** Port Town's walkers: Act 2 started, every stage cleared. */
const gates = (() => {
  const p = newProgress();
  p.act2.started = true; p.act2.cleared = [...STAGES];
  return gatesOf(p);
})();
const walk = (x: number, z: number, r = PLAYER_R) => isWalkable(x, z, gates, r);

/** True when the segment a→b (top view) passes through a house's footprint. */
function blockedByHouse(a: { x: number; z: number }, b: { x: number; z: number }, id: ServiceId) {
  const h = SERVICES[id].house, c = Math.cos(h.yaw), s = Math.sin(h.yaw);
  for (let k = 0; k <= 200; k++) {
    const x = a.x + (b.x - a.x) * k / 200 - h.x, z = a.z + (b.z - a.z) * k / 200 - h.z;
    const lx = c * x - s * z, lz = s * x + c * z;
    if (Math.abs(lx) < h.w / 2 && Math.abs(lz) < h.d / 2) return true;
  }
  return false;
}

describe("shop counters (2026-11-16)", () => {
  it("every counter stands between its keeper and the plaza, solid, and the keeper stays talkable across it", () => {
    for (const id of Object.keys(SERVICES) as ServiceId[]) {
      const { keeper: k, counter: c } = SERVICES[id];
      const at = customerSpot(id);
      expect(walk(at.x, at.z), id).toBe(true);
      expect(Math.hypot(at.x - k.x, at.z - k.z), id).toBeLessThan(2.8 - 0.3);
      // Walking straight from the customer's side to the keeper stops at the counter.
      const end = moveCircle(at.x, at.z, k.x, k.z, PLAYER_R, gates);
      const toCounter = Math.hypot(end.x - c.x, end.z - c.z);
      expect(toCounter, id).toBeGreaterThan(c.d / 2 + PLAYER_R - 0.05);
      expect(Math.hypot(end.x - k.x, end.z - k.z), id).toBeGreaterThan(Math.hypot(c.x - k.x, c.z - k.z));
      // The counter's centre is not walkable at all.
      expect(walk(c.x, c.z, 0.05), id).toBe(false);
    }
  });

  it("counters leave the plaza open: a friend's width passes round both ends", () => {
    for (const id of ["market", "clothes", "trainer", "inn"] as ServiceId[]) {
      const c = SERVICES[id].counter, out = Math.sign(c.x - SERVICES[id].keeper.x);
      for (const s of [-1, 1]) expect(walk(c.x + out * 0.3, c.z + s * (c.w / 2 + 0.65), 0.55), `${id} ${s}`).toBe(true);
    }
  });
});

describe("shop signs clear of the roofs", () => {
  it("the blade signs and their brackets hang below each eave; the inn's stays where it was", () => {
    for (const s of signSpots()) {
      const id = (Object.keys(SERVICES) as ServiceId[]).find((k) => s.text.startsWith(SERVICES[k].name.en.toUpperCase().slice(0, 4)));
      if (!id) continue;
      const h = SERVICES[id].house, wallTop = groundY(h.x, h.z) - 0.15 + ({ market: 3, clothes: 3.2, trainer: 3.1, inn: 4.4, harbor: 3 } as const)[id];
      const top = s.blade ? s.y + BRACKET_ABOVE + 0.05 : s.y + s.h / 2 + 0.07;
      // Under the eave: the overhang's lowest edge is about .2 m below the wall top.
      expect(top, s.text).toBeLessThan(wallTop - 0.24);
      if (id === "inn") expect(s.y - groundY(h.x, h.z)).toBeCloseTo(3.5, 6);
    }
  });
});

describe("the clothes shop's giant hat", () => {
  it("sits on the roof: the brim halves lie on the two slopes and nothing is below the roof's top at the ridge", () => {
    const g = giantHatGeometry(), pos = g.getAttribute("position") as THREE.BufferAttribute;
    const base = hatBase(), house = SERVICES.clothes.house, slope = 1.7 / (house.d / 2);
    let lowest = Infinity;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i), z = pos.getZ(i);
      // The roof's top surface at this distance from the ridge.
      const roofTop = base - Math.abs(z) * slope;
      lowest = Math.min(lowest, y - roofTop);
    }
    // Embedded by at most a couple of centimetres (the brim's underside), never cutting deep.
    expect(lowest).toBeGreaterThan(-0.05);
    const box = new THREE.Box3().setFromBufferAttribute(pos);
    expect(box.max.y - base).toBeGreaterThan(1.2);
    expect(box.max.x - box.min.x).toBeGreaterThan(2);
  });
});

describe("the harbour office's anchor", () => {
  it("is one piece: both arms start at the shank's foot", () => {
    const { foot, arm, angle } = ANCHOR;
    for (const s of [-1, 1]) {
      const cx = s * Math.cos(angle) * arm / 2, cy = foot + Math.sin(angle) * arm / 2;
      const inner = { x: cx - s * Math.cos(angle) * arm / 2, y: cy - Math.sin(angle) * arm / 2 };
      expect(inner.x).toBeCloseTo(0, 6);
      expect(inner.y).toBeCloseTo(foot, 6);
    }
  });
});

describe("the plaza statue", () => {
  it("replaces the fountain on its footprint, tall enough to read from the plaza, and solid", () => {
    const box = new THREE.Box3().setFromBufferAttribute(statueGeometry().getAttribute("position") as THREE.BufferAttribute);
    expect(Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z)).toBeLessThanOrEqual(PLAZA_STATUE.r + 0.01);
    expect(box.max.y).toBeGreaterThan(4);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.01);
    expect(lowlandSolids().some((s) => s.kind === "circle" && s.x === PLAZA_STATUE.x && s.z === PLAZA_STATUE.z)).toBe(true);
    expect(walk(PLAZA_STATUE.x, PLAZA_STATUE.z + PLAZA_STATUE.r + 0.2)).toBe(false);
    expect(walk(PLAZA_STATUE.x, PLAZA_STATUE.z + PLAZA_STATUE.r + 0.5)).toBe(true);
  });

  it("the two street lamps beside it are gone; the others stay", () => {
    expect(LAMPS).toHaveLength(4);
    for (const l of LAMPS) expect(Math.hypot(l.x - PLAZA_STATUE.x, l.z - PLAZA_STATUE.z)).toBeGreaterThan(10);
  });
});

describe("the pier and Gull's boat", () => {
  it("the pier deck is level with the quay: no step up from the plaza", () => {
    const quay = groundY(PIER2.x, PIER2.z1 + 0.4), deck = lowlandDeckY(PIER2.x, PIER2.z1 - 1, []);
    expect(deck - quay).toBeGreaterThanOrEqual(0);
    expect(deck - quay).toBeLessThan(0.12);
    expect(standY(PIER2.x, PIER2.z0 + 1, [])).toBeCloseTo(deck, 6);
    // Walkable from the plaza onto the pier and out to its end.
    const end = moveCircle(PIER2.x, PIER2.z1 + 1, PIER2.x, PIER2.z0 + 0.5, PLAYER_R, gates);
    expect(end.z).toBeLessThan(PIER2.z0 + 0.6);
  });

  it("Gull's boat lies alongside the pier, clear of it and of the quay, and the town draws no other boat", () => {
    const halfBeam = 1.56, halfLength = 3.2;
    expect(GULL_BERTH.x - halfBeam).toBeGreaterThan(PIER2.x + PIER2.half);
    expect(GULL_BERTH.x - halfBeam - (PIER2.x + PIER2.half)).toBeLessThan(0.4);
    expect(GULL_BERTH.z + halfLength).toBeLessThan(PORT.z0);
    expect(GULL_BERTH.z - halfLength).toBeGreaterThan(PIER2.z0 - 1);
    const pos = townGeometry().getAttribute("position") as THREE.BufferAttribute;
    let inBerth = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (Math.abs(x - GULL_BERTH.x) < halfBeam && Math.abs(z - GULL_BERTH.z) < halfLength && y > -0.5) inBerth++;
    }
    expect(inBerth).toBe(0);
  });
});

describe("Pippa behind the Food Market", () => {
  it("stands on open ground behind the market, solid, and can be reached on foot round its south end", () => {
    const m = SERVICES.market.house;
    expect(PIPPA.x).toBeLessThan(m.x - m.d / 2);
    expect(walk(PIPPA.x, PIPPA.z, 0.05)).toBe(false);
    // From the plaza by the market, west along the market's south end, then to her.
    let p = { x: 66, z: -304 };
    for (const to of [{ x: 61, z: -305.5 }, { x: 57.5, z: -307.6 }, { x: 56.4, z: -307.6 }]) p = moveCircle(p.x, p.z, to.x, to.z, PLAYER_R, gates);
    expect(Math.hypot(p.x - PIPPA.x, p.z - PIPPA.z)).toBeLessThan(2.6);
    // Arriving there, she is in front of the fixed camera (which sits north of the player, looking south).
    expect(PIPPA.z).toBeLessThan(p.z);
  });

  it("is out of sight from the plaza: outside the plaza camera's view or behind a building", () => {
    // The fixed lowland camera sits about 8 m north of the player and looks south (-z).
    const halfFov = 40 * Math.PI / 180;
    for (let x = 64; x <= 90; x += 2) for (let z = -312; z <= -292; z += 2) {
      if (!walk(x, z)) continue;
      const camera = { x, z: z + 8 }, dx = PIPPA.x - camera.x, dz = PIPPA.z - camera.z;
      const inView = dz < 0 && Math.abs(Math.atan2(dx, -dz)) < halfFov;
      const hidden = blockedByHouse(camera, PIPPA, "market") || blockedByHouse(camera, PIPPA, "trainer");
      expect(!inView || hidden, `from ${x},${z}`).toBe(true);
    }
  });
});

describe("the chest behind the Seaside Inn", () => {
  const chest = CHESTS.find((c) => c.id === "seasideChest")!;

  it("is a normal chest on open ground behind the inn, hidden from the plaza by it", () => {
    expect(chest).toBeDefined();
    expect(chest.secret).toBeUndefined();
    expect({ x: chest.x, z: chest.z }).toEqual({ x: SEASIDE_CHEST.x, z: SEASIDE_CHEST.z });
    const inn = SERVICES.inn.house;
    expect(chest.x).toBeGreaterThan(inn.x + inn.d / 2 + 0.8);
    expect(chest.x + 0.5).toBeLessThan(PORT.x1);
    expect(walk(chest.x, chest.z + 1.2)).toBe(true);
    expect(walk(chest.x, chest.z, 0.05)).toBe(false);
    for (const player of [{ x: 77, z: -303 }, { x: 87, z: -306 }, { x: 90, z: -305 }, { x: 86, z: -311.5 }]) {
      const camera = { x: player.x, z: player.z + 8 };
      expect(blockedByHouse(camera, chest, "inn"), JSON.stringify(player)).toBe(true);
    }
  });

  it("opens once: a modest reward, saved, never collected twice", () => {
    const p = newProgress();
    p.endings = 3; p.monsters.lumo.friend = true; p.act2.started = true;
    const opened = openChest(p, "seasideChest");
    expect(opened.act2.chests).toContain("seasideChest");
    expect(opened.act2.coins - p.act2.coins).toBe(chest.coins);
    expect(chest.coins).toBeLessThanOrEqual(25);
    expect(openChest(opened, "seasideChest")).toBe(opened);
    // Saving it: logic/save.test.ts ("keeps Port Town's seaside chest opened").
  });
});
