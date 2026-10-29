import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { CAMP, groundY, TENT_SIZE } from "../game/world/island";
import { flatMat } from "./materials";
import { expeditionEquipmentGeometry, tentGeometry } from "./models/tent";

describe("Maple's finished expedition tent", () => {
  it("has closed, outward-facing walls and roof from every side, including both gables", () => {
    const geometry = tentGeometry(), material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.updateMatrixWorld();
    const hit = (from: number[], direction: number[]) => new THREE.Raycaster(
      new THREE.Vector3(...from), new THREE.Vector3(...direction)
    ).intersectObject(mesh)[0];
    for (const side of [-1, 1]) {
      for (const z of [-1.2, -0.4, 0.4, 1.2]) {
        expect(hit([side * 3, 0.4, z], [-side, 0, 0]).point.x).toBeCloseTo(side * TENT_SIZE.width / 2, 5);
        const roof = hit([side * 3, 1.5, z], [-side, 0, 0]);
        expect(roof, "closed sloping canvas roof").toBeDefined();
      }
      for (const x of [-1.1, 0, 1.1]) {
        expect(hit([x, 0.5, side * 3], [0, 0, -side]), "closed front or recessed doorway/back wall").toBeDefined();
      }
      expect(hit([0.2, 1.85, side * 3], [0, 0, -side]), "closed triangular gable").toBeDefined();
    }
    for (const x of [-1.3, -0.4, 0.4, 1.3]) {
      expect(hit([x, 4, 0.3], [0, -1, 0]), "closed roof above").toBeDefined();
      expect(hit([x, -1, 0.3], [0, 1, 0]), "closed ground cloth below").toBeDefined();
    }
    expect(hit([0.2, 0.6, 3], [0, 0, -1]).point.z).toBeCloseTo(TENT_SIZE.depth / 2 - 0.32, 5);
    geometry.dispose(); material.dispose();
  });

  it("embeds the lower canvas in the existing terrain and uses opaque shared materials", () => {
    const { x, z, yaw } = CAMP.tent;
    const ground = (lx: number, lz: number) => groundY(x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z - lx * Math.sin(yaw) + lz * Math.cos(yaw)) - groundY(x, z);
    const geometry = tentGeometry(ground);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.max.y).toBeLessThan(2.28);
    for (const lx of [-1.6, 1.6]) for (const lz of [-1.4, 0, 1.4]) {
      expect(ground(lx, lz)).toBeGreaterThan(-0.18);
      expect(ground(lx, lz)).toBeLessThan(0.1);
    }
    expect(flatMat.transparent).toBe(false);
    expect(flatMat.side).toBe(THREE.FrontSide);
    geometry.dispose();
  });

  it("keeps shelter and expedition equipment compact, with finite closed primitive geometry", () => {
    for (const geometry of [tentGeometry(), expeditionEquipmentGeometry()]) {
      const positions = geometry.getAttribute("position"), normals = geometry.getAttribute("normal");
      expect(positions.count / 3).toBeLessThan(3000);
      for (let i = 0; i < positions.count; i++) {
        expect(Number.isFinite(positions.getX(i) + positions.getY(i) + positions.getZ(i))).toBe(true);
        expect(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i))).toBeGreaterThan(0.99);
      }
      geometry.dispose();
    }
  });
});
