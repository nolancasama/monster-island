import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { PartBuilder } from "../partBuilder";
import { addKit, bridge, cloudKit, giantTree, type KitComposite } from "./cloudKit";

function assertConnected(kit: KitComposite) {
  const byId = new Map(kit.parts.map(p => [p.id, p]));
  expect(byId.size).toBe(kit.parts.length);
  expect(kit.parts.filter(p => p.parent === null)).toHaveLength(1);
  for (const part of kit.parts) {
    const measured = new THREE.Box3();
    const positions = kit.geometry.getAttribute("position");
    for (let i = part.vertexStart; i < part.vertexStart + part.vertexCount; i++) {
      measured.expandByPoint(new THREE.Vector3().fromBufferAttribute(positions, i));
    }
    expect(measured.min.distanceTo(part.bounds.min), `${part.id} real lower bound`).toBeLessThan(.00001);
    expect(measured.max.distanceTo(part.bounds.max), `${part.id} real upper bound`).toBeLessThan(.00001);
    if (part.ground) expect(part.bounds.min.y, `${part.id} reaches ground`).toBeLessThanOrEqual(0);
    const ancestors = new Set([part.id]);
    let current = part;
    while (current.parent) {
      expect(ancestors.has(current.parent), "no cyclic supports").toBe(false);
      ancestors.add(current.parent);
      const parent = byId.get(current.parent);
      expect(parent, `${current.id} has a real parent`).toBeDefined();
      expect(current.bounds.intersectsBox(parent!.bounds), `${current.id} overlaps ${current.parent}`).toBe(true);
      expect(current.attachment?.part).toBe(parent!.id);
      current = parent!;
    }
  }
  for (const anchor of Object.values(kit.anchors)) {
    const owner = byId.get(anchor.part)!;
    expect(owner, "anchor belongs to a rendered part").toBeDefined();
    // Platform sockets can be on the upper surface of the tapered cylinder.
    expect(owner.bounds.clone().expandByScalar(.1).containsPoint(new THREE.Vector3(...anchor.point)),
      `${anchor.part} owns its socket`).toBe(true);
  }
  for (const end of kit.bridgeEnds) {
    const deck = byId.get(end.deck)!.bounds, support = byId.get(end.support)!.bounds;
    expect(deck.intersectsBox(support), "bridge end contacts its support").toBe(true);
    expect(deck.min.y).toBeLessThanOrEqual(support.max.y);
    expect(support.max.y).toBeLessThanOrEqual(deck.max.y);
    expect(end.point[0]).toBeGreaterThanOrEqual(support.min.x);
    expect(end.point[0]).toBeLessThanOrEqual(support.max.x);
    expect(end.point[2]).toBeGreaterThanOrEqual(support.min.z);
    expect(end.point[2]).toBeLessThanOrEqual(support.max.z);
  }
}

describe("Cloud Isle attachment kit", () => {
  for (const [name, build] of Object.entries(cloudKit)) {
    it(`${name}: rendered parts form one grounded attachment graph`, () => {
      const kit = build();
      assertConnected(kit);
      expect(kit.geometry.getAttribute("color").count).toBe(kit.geometry.getAttribute("position").count);
      kit.geometry.dispose();
    });
  }
  it("provides branch and platform sockets while keeping trunks at least 3 m across", () => {
    const tree = giantTree();
    expect(tree.anchors["walkwayBranch.platform"]).toBeDefined();
    expect(tree.anchors["trunk.tip"]).toBeDefined();
    const trunk = tree.parts.find(p => p.id === "trunk")!;
    expect(trunk.bounds.max.x - trunk.bounds.min.x).toBeGreaterThanOrEqual(3);
    expect(trunk.bounds.max.z - trunk.bounds.min.z).toBeGreaterThanOrEqual(3);
    tree.geometry.dispose();
  });
  it("keeps repeated conifers below the old 60-triangle instance cost", () => {
    const kit = cloudKit.mountainConifer();
    expect(kit.geometry.getAttribute("position").count / 3).toBeLessThan(60);
    kit.geometry.dispose();
  });
  it("keeps bridge ends supported along a rising, curved deck", () => {
    const kit = bridge({ length: 2, width: 14, deckAt: t => t * t * 1.2 });
    assertConnected(kit);
    expect(kit.bridgeEnds).toHaveLength(2);
    expect(kit.anchors[`${kit.bridgeEnds[1].deck}.end`].point[1]).toBe(1.2);
    kit.geometry.dispose();
  });
  it("retains vertex colours when baking into an area's existing draw call", () => {
    const kit = giantTree(), colors = Array.from(kit.geometry.getAttribute("color").array);
    const b = new PartBuilder();
    addKit(b, kit, [12, 5, 30], .7);
    const result = b.build();
    expect(Array.from(result.getAttribute("color").array)).toEqual(colors);
    result.dispose();
  });
  it("rejects the old canopy tree's real trunk-to-crown gap", () => {
    // CloudRoutes before Slice K: trunk y-14..y+7; crown lower edge y+7.65.
    const b = new PartBuilder(), parts: KitComposite["parts"] = [];
    const add = (id: string, geometry: THREE.BufferGeometry, point: [number, number, number], parent: string | null) => {
      const start = b.vertexCount;
      geometry.translate(...point); geometry.computeBoundingBox();
      parts.push({ id, parent, attachment: parent ? { part: parent, point: [0, 7, 0] } : null,
        origin: point, bounds: geometry.boundingBox!.clone(), ground: !parent,
        vertexStart: start, vertexCount: geometry.index?.count ?? geometry.getAttribute("position").count });
      b.add(geometry, "#708371", [0, 0, 0]);
    };
    add("oldTrunk", new THREE.CylinderGeometry(1.2, 2.2, 21, 7), [0, -3.5, 0], null);
    const crown = new THREE.SphereGeometry(3, 7, 6); crown.scale(1.8, .45, 1.4);
    add("oldCrown", crown, [-2, 9, 0], "oldTrunk");
    const kit: KitComposite = { geometry: b.build(), parts, anchors: {}, bridgeEnds: [] };
    expect(parts[1].bounds.min.y - parts[0].bounds.max.y).toBeCloseTo(.65);
    expect(() => assertConnected(kit)).toThrow(/oldCrown overlaps oldTrunk/);
    kit.geometry.dispose();
  });
});
