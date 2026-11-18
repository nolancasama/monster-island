import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { MONSTERS } from "../data/monsters";
import { NPCS } from "../data/town";
import { boatPose } from "../flow/act3";
import { monsterRootY } from "../ride";
import { rt } from "../runtime";
import { boatHullGeometry, boatSailGeometry } from "../../scene/CloudIsle";
import { npcGeometry } from "../../scene/models/lowland";
import { bubboParts, emberParts, leafyParts, puffParts, type MonsterParts } from "../../scene/models/monsters";
import { KNEE_Y, PLAYER_OUTFIT, armGeometry, bodyGeometry, shinGeometry, thighGeometry } from "../../scene/models/people";
import { PLAYER_R } from "./collision";
import { CLOUD_DOCK, cloudWalkable } from "./cloudisle";
import { cloudGroundY } from "./cloudTerrain";
import {
  BOAT_DECK_Y, BOAT_HALF_BEAM, BOAT_HALF_LENGTH, BOAT_HULL_BOTTOM_Y, BOAT_INNER, BOAT_MAST, BOAT_RIG, BOAT_SEATS, boatSeatWorld,
} from "./gullBoat";
import { GULL_BERTH } from "./lowland";

function horizontalRadius(geometry: THREE.BufferGeometry, pivot = [0, 0, 0], rotation = new THREE.Euler()) {
  const positions = geometry.getAttribute("position");
  const vertex = new THREE.Vector3();
  let radius = 0;
  for (let i = 0; i < positions.count; i++) {
    vertex.fromBufferAttribute(positions, i).applyEuler(rotation);
    radius = Math.max(radius, Math.hypot(vertex.x + pivot[0], vertex.z + pivot[2]));
  }
  return radius;
}

function monsterRadius({ body, eyes, parts }: MonsterParts, idle: (name: string, phase: number) => THREE.Euler) {
  let radius = Math.max(horizontalRadius(body), horizontalRadius(eyes));
  for (const { name, geo, pivot } of parts) {
    if (name === "smoke") continue;
    for (let i = 0; i <= 24; i++) {
      radius = Math.max(radius, horizontalRadius(geo, pivot, idle(name, i / 12 - 1)));
    }
  }
  return radius / Math.sqrt(0.97); // Maximum horizontal expansion from breathing.
}

const builders = { leafy: leafyParts, bubbo: bubboParts, puff: puffParts, ember: emberParts };

// The part pivots and idle angles are the ones applied by MonsterBody.
function idleAngle(id: keyof typeof builders, name: string, phase: number) {
  const side = name.endsWith("L") ? -1 : 1;
  if (name.startsWith("arm")) return new THREE.Euler(0, 0, side * (0.25 + phase * 0.05));
  if (name === "sprout") return new THREE.Euler(phase * 0.08, 0, phase * 0.12);
  if (name === "flower") return new THREE.Euler(0, phase * Math.PI, 0);
  if (name.startsWith("gills")) return new THREE.Euler(0, 0, -side * phase * 0.25);
  if (name.startsWith("wing")) return new THREE.Euler(0, 0, -side * (phase * 0.08 - 0.5));
  if (name === "tuft") return new THREE.Euler(0, 0, phase * 0.2);
  if (name === "tail") return new THREE.Euler(0, phase * (id === "ember" ? 0.18 : 0.35), 0);
  return new THREE.Euler();
}

function playerRadius() {
  const body = bodyGeometry(PLAYER_OUTFIT), thigh = thighGeometry(PLAYER_OUTFIT);
  const shin = shinGeometry(PLAYER_OUTFIT), arm = armGeometry(PLAYER_OUTFIT);
  return Math.max(horizontalRadius(body), ...[-1, 1].flatMap(side => [
    horizontalRadius(thigh, [side * 0.09, 0.5, 0]),
    horizontalRadius(shin, [side * 0.09, 0.5 + KNEE_Y, 0]),
    horizontalRadius(arm, [side * 0.27, 0.98, 0], new THREE.Euler(0, 0, side * 0.12)),
  ]));
}

describe("Gull's boat", () => {
  const ids = Object.keys(BOAT_SEATS) as Array<keyof typeof BOAT_SEATS>;

  it("gives the full idle rigs clearance from the deck edge, rails, mast and one another", () => {
    // Round the measured envelopes up, including the player mesh where it exceeds PLAYER_R.
    const radius = { leafy: 0.52, bubbo: 0.95, puff: 0.74, ember: 1.35, player: 0.39, gull: 0.40 };
    for (const id of Object.keys(builders) as Array<keyof typeof builders>) {
      const meshRadius = monsterRadius(builders[id](), (name, phase) => idleAngle(id, name, phase));
      expect(Math.max(meshRadius, MONSTERS[id].radius), id).toBeLessThanOrEqual(radius[id]);
    }
    expect(Math.max(playerRadius(), PLAYER_R)).toBeLessThanOrEqual(radius.player);
    expect(horizontalRadius(npcGeometry(NPCS.harbor))).toBeLessThanOrEqual(radius.gull);

    const geometry = boatHullGeometry(), material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, .01);
    for (const [i, id] of ids.entries()) {
      const { x, z } = BOAT_SEATS[id], r = radius[id];
      expect(BOAT_INNER.halfX - Math.abs(x) - r, id).toBeGreaterThanOrEqual(.05);
      expect(BOAT_INNER.halfZ - Math.abs(z) - r, id).toBeGreaterThanOrEqual(.05);
      expect(Math.hypot(x - BOAT_MAST.x, z - BOAT_MAST.z) - BOAT_MAST.r - r, id).toBeGreaterThanOrEqual(.05);
      for (const other of ids.slice(i + 1)) {
        const at = BOAT_SEATS[other];
        expect(Math.hypot(x - at.x, z - at.z) - radius[other] - r, `${id} and ${other}`).toBeGreaterThanOrEqual(.05);
      }
      // The extra 5 mm covers the sagitta between samples on the convex deck.
      for (let k = 0; k < 72; k++) {
        const angle = k * Math.PI / 36;
        ray.ray.origin.set(x + Math.cos(angle) * (r + .055), BOAT_DECK_Y + .005, z + Math.sin(angle) * (r + .055));
        const hit = ray.intersectObject(mesh)[0];
        expect(hit?.point.y, id).toBeCloseTo(BOAT_DECK_Y, 5);
      }
    }
    geometry.dispose();
    material.dispose();
  });

  it("turns the seats with the boat and frames the player and fully raised sail", () => {
    const sail = boatSailGeometry(), vertices = sail.getAttribute("position");
    for (const pose of [GULL_BERTH, { x: 91, z: -370, yaw: Math.PI / 2 }, { ...CLOUD_DOCK.boat, yaw: 0 }]) {
      Object.assign(rt.voyage, pose, { active: true, y: -.1 });
      boatPose();
      const { player } = rt;
      expect(player).toMatchObject(boatSeatWorld("player", pose));
      expect(player.y).toBeCloseTo(BOAT_DECK_Y - .1);
      for (const id of Object.keys(builders) as Array<keyof typeof builders>) {
        expect(rt.monsters[id]).toMatchObject(boatSeatWorld(id, pose));
        expect(monsterRootY(rt.monsters[id], [], 0)).toBeCloseTo(player.y);
      }
      const starboard = pose.yaw + Math.PI / 2;
      expect(player.x).toBeCloseTo(pose.x + Math.sin(starboard) * BOAT_SEATS.player.x + Math.sin(pose.yaw) * BOAT_SEATS.player.z);
      expect(player.z).toBeCloseTo(pose.z + Math.cos(starboard) * BOAT_SEATS.player.x + Math.cos(pose.yaw) * BOAT_SEATS.player.z);
      const shot = rt.camera.shot!;
      const camera = new THREE.PerspectiveCamera(55, 1.6, .1, 900);
      camera.position.set(shot.pos.x, shot.pos.y, shot.pos.z);
      camera.lookAt(shot.target.x, shot.target.y, shot.target.z);
      camera.updateMatrixWorld();
      const visible = (vertex: THREE.Vector3) => {
        const projected = vertex.project(camera);
        expect(Math.max(Math.abs(projected.x), Math.abs(projected.y), Math.abs(projected.z))).toBeLessThan(1);
      };
      visible(new THREE.Vector3(player.x, player.y, player.z));
      visible(new THREE.Vector3(player.x, player.y + 1.6, player.z));
      const axis = new THREE.Vector3(0, 1, 0);
      for (let i = 0; i < vertices.count; i++) {
        const vertex = new THREE.Vector3().fromBufferAttribute(vertices, i);
        vertex.add(new THREE.Vector3(BOAT_MAST.x, BOAT_RIG.sailY, BOAT_MAST.z)).applyAxisAngle(axis, pose.yaw);
        visible(vertex.add(new THREE.Vector3(pose.x, rt.voyage.y, pose.z)));
      }
    }
    sail.dispose();
    rt.voyage.active = false;
  });

  it("berths in water clear of Cloud Isle's pier and seabed", () => {
    const { boat, spawn } = CLOUD_DOCK;
    // The dock runs to z = -9.5, including the half-metre lip beyond its walk shape.
    expect(boat.z + BOAT_HALF_LENGTH).toBeLessThan(-9.5);
    expect(cloudWalkable(spawn.x, spawn.z, {}, PLAYER_R)).toBe(true);
    const hullBottom = -.1 - .05 + BOAT_HULL_BOTTOM_Y;
    for (let i = 0; i <= 20; i++) {
      for (let j = 0; j <= 40; j++) {
        const x = boat.x + BOAT_HALF_BEAM * (i / 10 - 1);
        const z = boat.z + BOAT_HALF_LENGTH * (j / 20 - 1);
        expect(cloudWalkable(x, z)).toBe(false);
        expect(cloudGroundY(x, z)).toBeLessThan(hullBottom);
      }
    }
  });
});
