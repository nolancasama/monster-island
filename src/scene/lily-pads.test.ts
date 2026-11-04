import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ISLET, LILY_PAD_R, LILY_PADS, POND_Y } from "../game/world/lowland";
import { lilyPadGeometry, updateLilyPadMatrices } from "./models/lowland";

describe("the Grove's pad-only animated draw", () => {
  it("contains exactly one local pad and no island mound or terrain", () => {
    const geometry = lilyPadGeometry();
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    expect(bounds.min.x).toBeGreaterThanOrEqual(-LILY_PAD_R - .001);
    expect(bounds.max.x).toBeLessThanOrEqual(LILY_PAD_R + .001);
    expect(bounds.min.z).toBeGreaterThanOrEqual(-LILY_PAD_R - .001);
    expect(bounds.max.z).toBeLessThanOrEqual(LILY_PAD_R + .001);
    expect(bounds.min.y).toBeGreaterThanOrEqual(-.041);
    expect(bounds.max.y).toBeLessThan(.2);
    expect(bounds.containsPoint(new THREE.Vector3(ISLET.x, POND_Y, ISLET.z))).toBe(false);
    expect(bounds.getSize(new THREE.Vector3()).x).toBeLessThan(ISLET.r * 2);
    geometry.dispose();
  });

  it("updates one matrix per pad, sequentially, and stops writing at stable values", () => {
    const geometry = lilyPadGeometry(), material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.InstancedMesh(geometry, material, LILY_PADS.length);
    const values = new Float64Array(LILY_PADS.length).fill(-1), scratch = new THREE.Matrix4();
    const read = new THREE.Matrix4(), position = new THREE.Vector3();
    expect(mesh.count).toBe(LILY_PADS.length);
    expect(updateLilyPadMatrices(mesh, 0, values, scratch)).toBe(true);
    const before = mesh.instanceMatrix.array.slice();
    const version = mesh.instanceMatrix.version;
    expect(updateLilyPadMatrices(mesh, 0, values, scratch)).toBe(false);
    expect(mesh.instanceMatrix.version).toBe(version);
    expect(updateLilyPadMatrices(mesh, .1, values, scratch)).toBe(true);
    expect(Array.from(mesh.instanceMatrix.array.slice(16))).toEqual(Array.from(before.slice(16)));
    expect(mesh.instanceMatrix.array[13]).toBeGreaterThan(before[13]);
    expect(updateLilyPadMatrices(mesh, 1, values, scratch)).toBe(true);
    for (let i = 0; i < LILY_PADS.length; i++) {
      mesh.getMatrixAt(i, read); position.setFromMatrixPosition(read);
      expect(position.x).toBeCloseTo(LILY_PADS[i].x);
      expect(position.z).toBeCloseTo(LILY_PADS[i].z);
      expect(position.y).toBeCloseTo(POND_Y + .06);
      expect(read.elements[0]).toBeCloseTo(Math.cos(i * 1.73 + .4) * (1 - i * .025));
      expect(read.elements[5]).toBeCloseTo(1 + i * .08);
    }
    const settledVersion = mesh.instanceMatrix.version;
    expect(updateLilyPadMatrices(mesh, 1, values, scratch)).toBe(false);
    expect(mesh.instanceMatrix.version).toBe(settledVersion);
    geometry.dispose(); material.dispose(); mesh.dispose();
  });
});
