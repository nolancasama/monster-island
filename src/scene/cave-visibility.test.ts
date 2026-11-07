import { afterAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { caveFloorY, caveWalkable } from "../game/world/cave";
import { isWalkable } from "../game/world/collision";
import { CAVE_MOUTH } from "../game/world/lowland";
import { CAMERA_PROFILES } from "./cameraProfiles";
import { caveDecorGeometry, caveWallGeometry } from "./models/cave";

const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const meshes = [caveWallGeometry(), caveDecorGeometry()].map(g => { const m = new THREE.Mesh(g, material); m.updateMatrixWorld(); return m; });
afterAll(() => { for (const m of meshes) m.geometry.dispose(); material.dispose(); });
const frame = CAMERA_PROFILES.find(p => p.id === "cave")!;
const gates = { solved: [] as const, act2: true };

describe("the fixed cave lens", () => {
  it("is a fixed yaw-0 view that never takes terrain or mesa lifts", () => {
    expect(frame).toMatchObject({ yaw: 0, fixed: true });
  });

  it("sees the player's head over every camera-side wall, everywhere on the cave floor", () => {
    let points = 0;
    const failures: string[] = [];
    for (let x = 63; x <= 90; x += .6) for (let z = -232; z <= -186; z += .6) {
      // West of the portal's dead band the walker is back on the ground layer.
      if (x < CAVE_MOUTH.portalX - .45 || !caveWalkable(x, z, .35) || !isWalkable(x, z, gates, .35, false, "cave")) continue;
      points++;
      const y = caveFloorY(x, z);
      const head = new THREE.Vector3(x, y + 1.3, z);
      const lens = new THREE.Vector3(x, y + 1.1 + frame.dist * Math.sin(frame.pitch), z + frame.dist * Math.cos(frame.pitch) - frame.ahead);
      const ray = new THREE.Raycaster(lens, head.clone().sub(lens).normalize(), 0, lens.distanceTo(head) - .05);
      const hits = meshes.flatMap(m => ray.intersectObject(m));
      if (hits.length) failures.push(`(${x.toFixed(1)},${z.toFixed(1)}) hit at ${hits[0].point.toArray().map(n => n.toFixed(2))}`);
    }
    expect(points).toBeGreaterThan(350);
    expect(failures).toEqual([]);
  }, 60_000);
});
