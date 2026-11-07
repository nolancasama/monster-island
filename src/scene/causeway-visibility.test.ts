import { afterAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { groundY } from "../game/world/island";
import { CANOPY_ROPES, STAGES, lowlandSolids, lowlandWalkable as walkShapes, zoneAt } from "../game/world/lowland";
import type { LowlandGates } from "../game/world/lowland";

// A body (0.35 m) must also fit between solid scenery, e.g. the corner boulders.
const ROUND_SOLIDS = lowlandSolids().filter(s => s.kind === "circle") as Array<{ x: number; z: number; r: number }>;
const lowlandWalkable = (x: number, z: number, g: LowlandGates, m: number) =>
  walkShapes(x, z, g, m) && !ROUND_SOLIDS.some(s => Math.hypot(x - s.x, z - s.z) < s.r + .35);
import { cameraProfileAt, CAMERA_PROFILES } from "./cameraProfiles";
import { canopyCutawayAt, canopySolidMat, canopyOccluderMat, causewayOccluderMat, updateOccluderFade } from "./materials";
import { groveDoorFrameGeometry } from "./models/groveDoor";
import { canopyDeckGeometry, canopyRopeGeometry, canopyRopeAnchorsGeometry, lowlandPropsGeometry, lowlandTerrainTiles, spatialGeometry } from "./models/lowland";

const open = { cleared: STAGES, solved: ["groveLilies", "canopyVines", "canopyRope"] as const };
const material = new THREE.MeshBasicMaterial(); // Same FrontSide culling as live Lambert materials.
type Scenery = { name: string; mesh: THREE.Mesh; fade: boolean; deck: boolean };
const scenery: Scenery[] = [];
function add(name: string, geometry: THREE.BufferGeometry, fade = false, deck = false) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.updateMatrixWorld();
  scenery.push({ name, mesh, fade, deck });
}
add("deck solid", canopyDeckGeometry("solid"), false, true);
add("deck north", canopyDeckGeometry("occluder"), true, true);
add("rope anchors", canopyRopeAnchorsGeometry());
for (const [name, rope] of Object.entries(CANOPY_ROPES)) add(`${name} rope`, canopyRopeGeometry(rope), name === "exit");
for (const geometry of spatialGeometry(lowlandPropsGeometry(), 48)) add("props / shrine", geometry, true);
for (const geometry of lowlandTerrainTiles(48)) add("terrain", geometry, false);
add("Grove frame / lintel", groveDoorFrameGeometry(), true);

afterAll(() => {
  for (const { mesh } of scenery) mesh.geometry.dispose();
  material.dispose();
});

const frame = CAMERA_PROFILES.find(p => p.id === "ruined-causeway")!;
function pose(x: number, z: number) {
  const y = groundY(x, z);
  return {
    target: new THREE.Vector3(x, y + 1, z),
    lens: new THREE.Vector3(x, y + 1.1 + frame.dist * Math.sin(frame.pitch), z + frame.dist * Math.cos(frame.pitch) - frame.ahead),
  };
}

// CPU evaluation of occluderMat's zero-visibility discard, including its
// lens sphere and tapered LOS cone. Partial screen-door coverage is retained.
function faded(point: THREE.Vector3, lens: THREE.Vector3, target: THREE.Vector3) {
  const p = point.clone().sub(lens), t = target.clone().sub(lens);
  if (p.length() <= 3.4) return true;
  const along = p.dot(t) / Math.max(t.lengthSq(), .0001);
  const u = THREE.MathUtils.clamp(along, 0, 1);
  return along > -.04 && along < 1.04 && p.distanceTo(t.multiplyScalar(u)) <= 1.55 * (.2 + .8 * u) * .5;
}

function blockers(x: number, z: number, cutaway = true, lift = 1) {
  const { lens, target } = pose(x, z);
  target.y += lift - 1;
  const ray = new THREE.Raycaster(lens, target.clone().sub(lens).normalize(), .0001, lens.distanceTo(target) - .0001);
  const result: string[] = [];
  for (const { name, mesh, fade, deck } of scenery) {
    if (cutaway && deck && canopyCutawayAt(lens, target, true)) continue;
    for (const hit of ray.intersectObject(mesh)) {
      const fadesHere = fade && (cutaway || name !== "terrain" && name !== "exit rope");
      if (fadesHere && faded(hit.point, lens, target)) continue;
      result.push(`${name}: point=${hit.point.toArray().map(n => n.toFixed(3))}, normal=${hit.face!.normal.toArray()}`);
    }
  }
  return result;
}

describe("fixed Causeway lens visibility", () => {
  it("reproduces the pre-fix rope-foot obstruction with the cutaway disabled", () => {
    const before = blockers(96, -242.8, false);
    expect(before).not.toEqual([]);
    expect(before).toEqual(expect.arrayContaining([expect.stringContaining("deck solid")]));
    expect(before).toContain("deck solid: point=96.000,9.689,-237.100, normal=0,0,1");
    // The same visibility assertion really fails under pre-fix material rules.
    expect(() => expect(before).toEqual([])).toThrow();
    expect(blockers(96, -242.8)).toEqual([]);
  });

  it("clears the real scenery over the entire walkable Causeway at 0.75 m spacing", () => {
    const points: Array<[number, number]> = [[96, -242.8]];
    for (let x = 44; x <= 119; x += .75) for (let z = -265; z <= -241; z += .75)
      if (zoneAt(x, z) === "causeway" && lowlandWalkable(x, z, open, 0)) points.push([x, z]);
    // Independently anchored grids cover the complete rope pocket and the
    // requested north strip, rather than depending on the larger grid's phase.
    for (const [x0, x1, z0, z1] of [[92, 100, -244, -241], [83, 119, -249, -242.5]])
      for (let x = x0; x <= x1; x += .75) for (let z = z0; z <= z1; z += .75)
        if (lowlandWalkable(x, z, open, 0)) points.push([x, z]);
    const failures: string[] = [];
    for (const [x, z] of points) {
      expect(cameraProfileAt({ x, y: groundY(x, z), z, cloud: false, climbing: false }).id).toBe("ruined-causeway");
      // Terrain stays opaque (fading it shows the sky through the bank). At the
      // north-east corner the bank may cover the chest, but never the head.
      const hits = blockers(x, z);
      if (hits.length && hits.every(h => h.startsWith("terrain")) && !blockers(x, z, true, 1.6).length) continue;
      if (hits.length) failures.push(`(${x},${z}): ${hits.join("; ")}`);
    }
    expect(points.length).toBeGreaterThan(2000);
    expect(failures).toEqual([]);
  }, 30000);

  it("the Grove frame/lintel and shrine cannot fully hide the player", () => {
    for (const [name, x0, x1, z0, z1] of [
      ["Grove frame / lintel", 53, 60, -248, -241.5],
      ["props / shrine", 102, 113, -257, -246],
    ] as const) {
      let tested = 0, intersections = 0;
      for (let x = x0; x <= x1; x += .75) for (let z = z0; z <= z1; z += .75) {
        if (!lowlandWalkable(x, z, open, 0) || zoneAt(x, z) !== "causeway") continue;
        tested++;
        const { lens, target: chest } = pose(x, z);
        // The high lens clears the lintel to the chest; the frame overlaps the legs.
        for (const target of [chest, chest.clone().setY(chest.y - .8)]) {
          const ray = new THREE.Raycaster(lens, target.clone().sub(lens).normalize(), 0, lens.distanceTo(target));
          for (const item of scenery.filter(item => item.name === name)) for (const hit of ray.intersectObject(item.mesh)) {
            intersections++;
            expect(faded(hit.point, lens, target), `${name} at (${x},${z})`).toBe(true);
          }
        }
        expect(blockers(x, z)).toEqual([]);
      }
      expect(tested).toBeGreaterThan(0);
      // Causeway-side sight lines pass under the lintel through the opening, so
      // prove instead that the probe can hit this mesh (not an empty fixture).
      if (name === "Grove frame / lintel") {
        const frameMesh = scenery.find(item => item.name === name)!.mesh;
        const y = groundY(56, -241.4);
        const probe = new THREE.Raycaster(new THREE.Vector3(56, y + 3.9, -236), new THREE.Vector3(0, 0, -1), 0, 10);
        expect(probe.intersectObject(frameMesh).length + intersections).toBeGreaterThan(0);
      }
    }
  });

  it("injects discard into both deck batches and gates terrain/rope fading to Causeway", () => {
    const shaders = [canopySolidMat, canopyOccluderMat, causewayOccluderMat].map(material => {
      // The callback uses shader source/uniforms only; renderer program metadata
      // is supplied by WebGLRenderer in production and is irrelevant here.
      const shader = { ...THREE.ShaderLib.lambert, uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.lambert.uniforms) } as Parameters<typeof material.onBeforeCompile>[0];
      material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
      expect(material.transparent).toBe(false);
      return shader;
    });
    for (const shader of shaders.slice(0, 2)) expect(shader.fragmentShader).toContain("if (uCanopyCutaway > 0.5) discard;");
    expect(shaders[1].fragmentShader).toContain("if (visibility <= 0.0) discard;");
    expect(shaders[2].fragmentShader).toContain("if (uLosRadius > 0.0 && uCausewayView > 0.5)");
    const camera = new THREE.PerspectiveCamera();
    const { lens, target } = pose(96, -242.8);
    camera.position.copy(lens);
    updateOccluderFade(camera, target, true, true);
    expect(shaders[0].uniforms.uCanopyCutaway.value).toBe(1);
    expect(shaders[1].uniforms.uCanopyCutaway.value).toBe(1);
    expect(shaders[2].uniforms.uCausewayView.value).toBe(1);
    updateOccluderFade(camera, new THREE.Vector3(96, 13, -239.8), true, false);
    expect(shaders[0].uniforms.uCanopyCutaway.value).toBe(0);
    expect(shaders[2].uniforms.uCausewayView.value).toBe(0);
    updateOccluderFade(camera, target, false, true);
    expect(shaders[1].uniforms.uCanopyCutaway.value).toBe(0);
    expect(shaders[2].uniforms.uCausewayView.value).toBe(0);
  });

  it("keeps the cutaway off for deck walkers and cameras outside the mass", () => {
    expect(canopyCutawayAt(pose(96, -242.8).lens, pose(96, -242.8).target, true)).toBe(true);
    expect(canopyCutawayAt(pose(96, -242.8).lens, new THREE.Vector3(96, 13, -239.8), false)).toBe(false);
    expect(canopyCutawayAt(pose(96, -252).lens, pose(96, -252).target, true)).toBe(false);
    expect(canopySolidMat.transparent || canopyOccluderMat.transparent).toBe(false);
  });
});
