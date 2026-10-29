import { afterEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { BRIDGE, groundY } from "../game/world/island";
import { CANOPY_GAPS, gapDeck, lowlandBridgeY } from "../game/world/lowland";
import { bridgeDeckY, isWalkable, moveCircle, PLAYER_R, standY, type Gates } from "../game/world/collision";
import { bridgeFrameGeometry, bridgeVinesGeometry } from "./models/forest";
import { ropeBridgeGeometry, vineBridgeGeometry } from "./models/lowland";
import { conformBridge } from "./models/bridge";
import { cb, mountPose, resetCombat } from "../game/combat";
import { newProgress } from "../game/logic/progress";
import { getGame, setGame } from "../game/store";
import { resetRuntime, rt } from "../game/runtime";

const all: Gates = { solved: ["bridge", "canopyVines", "canopyRope"], forest: true, act2: true, cleared: ["forest1", "canopy"] };

function renderedBridge(id: "bridge" | keyof typeof CANOPY_GAPS) {
  const material = new THREE.MeshBasicMaterial();
  const group = new THREE.Group();
  const g = id === "bridge" ? BRIDGE : CANOPY_GAPS[id];
  const deck = id === "bridge" ? BRIDGE : gapDeck(id);
  const len = deck.z1 - deck.z0;
  const height = (x: number, z: number) => id === "bridge" ? bridgeDeckY(z, x) : lowlandBridgeY(id, x, z);
  const originZ = id === "bridge" ? deck.z1 : (deck.z0 + deck.z1) / 2;
  const originY = height(g.x, deck.z1);
  const geometries = id === "bridge" ? [bridgeFrameGeometry(len, BRIDGE.half, [-len * .3, -len * .72]), bridgeVinesGeometry(len, BRIDGE.half)]
    : [id === "canopyVines" ? vineBridgeGeometry(len) : ropeBridgeGeometry(len)];
  for (const geometry of geometries) {
    const mesh = new THREE.Mesh(conformBridge(geometry, g.x, originZ, originY, height), material);
    mesh.position.set(g.x, originY, originZ);
    group.add(mesh);
  }
  group.updateMatrixWorld(true);
  const top = (x: number, z: number) => {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 50, z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(group, true)[0];
    expect(hit, `${id} has a real deck at ${x},${z}`).toBeDefined();
    return hit.point.y;
  };
  return { ...deck, x: g.x, top, dispose: () => { geometries.forEach(g => g.dispose()); material.dispose(); } };
}

afterEach(() => { resetRuntime(); setGame({ progress: newProgress(), screen: "title" }); resetCombat(); });

describe("continuous bank-to-bank bridge surfaces", () => {
  it.each(["bridge", "canopyVines", "canopyRope"] as const)("%s: walking in both directions matches the visible deck, including both land joins", id => {
    const deck = renderedBridge(id);
    for (const direction of [-1, 1]) {
      for (const dx of [-.5, 0, .5]) {
        for (let i = 0; i <= 100; i++) {
          const t = direction > 0 ? i / 100 : 1 - i / 100;
          const z = deck.z0 + .003 + t * (deck.z1 - deck.z0 - .006), x = deck.x + dx;
          expect(Math.abs(standY(x, z, all.solved) - deck.top(x, z)), `${id}: feet at ${x},${z}`).toBeLessThan(.02);
        }
        for (const z of [deck.z0, deck.z1]) {
          expect(standY(deck.x + dx, z, all.solved)).toBeCloseTo(groundY(deck.x + dx, z), 5);
          expect(Math.abs(deck.top(deck.x + dx, z) - groundY(deck.x + dx, z))).toBeLessThan(.02);
        }
      }
      let z = direction > 0 ? deck.z0 - .5 : deck.z1 + .5;
      for (let i = 0; i < Math.ceil((deck.z1 - deck.z0 + 1) / .08); i++) {
        const next = z + .08 * direction;
        const moved = moveCircle(deck.x, z, deck.x, next, PLAYER_R, all);
        expect(moved.z, `${id} join is traversable`).toBeCloseTo(next, 4);
        expect(isWalkable(moved.x, moved.z, all, PLAYER_R)).toBe(true);
        z = next;
      }
    }
    deck.dispose();
  });

  it.each(["bubbo", "ember"] as const)("%s's mounted feet use the same canopy deck from either direction", friend => {
    resetRuntime(); resetCombat();
    const progress = newProgress(); progress.solved = [...all.solved]; progress.active = friend;
    progress.act2.started = true;
    setGame({ progress, screen: "game" });
    cb.stance.friend = friend; cb.stance.k = 1;
    for (const id of ["canopyVines", "canopyRope"] as const) {
      const deck = renderedBridge(id);
      for (const yaw of [0, Math.PI]) for (let i = 0; i <= 24; i++) {
        rt.player.x = deck.x; rt.player.z = deck.z0 + (deck.z1 - deck.z0) * i / 24; rt.player.yaw = yaw;
        rt.player.y = standY(rt.player.x, rt.player.z, getGame().progress.solved);
        const pose = mountPose(friend)!;
        if (pose.z > deck.z0 + .01 && pose.z < deck.z1 - .01)
          expect(Math.abs(pose.y - deck.top(pose.x, pose.z))).toBeLessThan(.02);
      }
      deck.dispose();
    }
  });
});
