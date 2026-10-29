import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { CHEST_HINGE, CHEST_OPEN_ANGLE, chestBaseGeometry, chestLidGeometry } from "./models/chest";

describe("finished treasure chest", () => {
  it("rests on the ground and closes flush at its rear-bottom hinge", () => {
    const base = chestBaseGeometry(), lid = chestLidGeometry();
    base.computeBoundingBox();
    lid.computeBoundingBox();
    const bounds = base.boundingBox!, local = lid.boundingBox!;
    expect(bounds.min.y).toBeCloseTo(0, 6);
    expect(bounds.max.y).toBeCloseTo(CHEST_HINGE[1], 6);
    expect(local.min.y).toBeCloseTo(0, 6);
    expect(local.min.z).toBeCloseTo(0, 6);
    expect(local.min.y + CHEST_HINGE[1]).toBeCloseTo(bounds.max.y, 6);
    expect(CHEST_HINGE[2]).toBeCloseTo(-0.35, 6);
    expect(local.max.y + CHEST_HINGE[1]).toBeGreaterThan(0.83);
    expect(local.max.y + CHEST_HINGE[1]).toBeLessThan(0.86);
    const p = lid.getAttribute("position");
    for (const x of [-0.49, 0.49]) {
      expect(Array.from({ length: p.count }, (_, i) => i).some((i) =>
        Math.abs(p.getX(i) - x) < 1e-6 && Math.abs(p.getY(i)) < 1e-6 && Math.abs(p.getZ(i)) < 1e-6
      ), "hinge is on both ends of the rear bottom edge").toBe(true);
    }
    expect((base.getAttribute("position").count + p.count) / 3).toBeLessThan(600);
    base.dispose();
    lid.dispose();
  });

  it("keeps the lid clear of the base through the entire opening sweep", () => {
    const lid = chestLidGeometry(), p = lid.getAttribute("position");
    const triangle = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (let step = 0; step <= 110; step++) {
      const rotation = new THREE.Matrix4().makeRotationX(CHEST_OPEN_ANGLE * step / 110);
      for (let i = 0; i < p.count; i += 3) {
        triangle.forEach((point, j) => point.fromBufferAttribute(p, i + j).applyMatrix4(rotation));
        for (let edge = 0; edge < 3; edge++) {
          const a = triangle[edge], b = triangle[(edge + 1) % 3];
          // Check the vertices and where each edge crosses the rear plane.
          // Clipping a triangle to z>=0 has only these possible extreme points.
          if (a.z >= -1e-6) expect(a.y, `angle ${step}, vertex ${i + edge}`).toBeGreaterThanOrEqual(-1e-6);
          if (a.z * b.z < 0) {
            const crossingY = THREE.MathUtils.lerp(a.y, b.y, -a.z / (b.z - a.z));
            expect(crossingY, `angle ${step}, edge ${i + edge}`).toBeGreaterThanOrEqual(-1e-6);
          }
        }
      }
    }
    lid.dispose();
  });

  it("has outward-facing lid end caps, a closed underside and a dark inset floor", () => {
    const base = chestBaseGeometry(), lid = chestLidGeometry();
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(lid, material);
    mesh.updateMatrixWorld();
    for (const side of [-1, 1]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(side, 0.1, 0.35), new THREE.Vector3(-side, 0, 0));
      expect(ray.intersectObject(mesh).length, "closed end cap").toBeGreaterThan(0);
    }
    const underside = new THREE.Raycaster(new THREE.Vector3(0, -0.1, 0.35), new THREE.Vector3(0, 1, 0));
    expect(underside.intersectObject(mesh).length).toBeGreaterThan(0);
    mesh.geometry = base;
    const floor = new THREE.Raycaster(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0)).intersectObject(mesh)[0];
    expect(floor.point.y).toBeCloseTo(0.063, 5);
    const color = base.getAttribute("color");
    const vertex = floor.face!.a;
    expect(Math.max(color.getX(vertex), color.getY(vertex), color.getZ(vertex))).toBeLessThan(0.03);
    base.dispose();
    lid.dispose();
    material.dispose();
  });
});
