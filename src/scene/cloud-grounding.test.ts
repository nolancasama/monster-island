import { expect, it } from "vitest";
import * as THREE from "three";
import { cloudGeometry } from "./CloudIsle";
import { canopyBridgeKit, canopyBridgePlacement, canopyDeckSupports, canopyFoundationGeometry, cloudRouteGeometry } from "./CloudRoutes";
import { canopyTreeKits, coniferKits, junctionKits, landscapeKits, shelterKits } from "./cloudScenery";
import { bridge } from "./models/cloudKit";
import { CANOPY_GLIDE, CLOUD_CHASMS, CLOUD_DECKS, CLOUD_PUZZLE_BARRIERS, CLOUD_ZONES, cloudY, cloudZoneAt } from "../game/world/cloudisle";

it("draws terrain or rock under every grounded kit footprint, including the canopy roots", () => {
  // Only supporting surfaces are in the ray scene. The kit under test cannot
  // pass by hitting its own root, post, plinth or small integral contact rock.
  const surfaces = [...cloudGeometry.terrainTiles(), canopyFoundationGeometry()];
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const terrain = new THREE.Group();
  surfaces.forEach(g => terrain.add(new THREE.Mesh(g, material)));
  terrain.updateMatrixWorld(true);
  const crane = bridge({ length: Math.hypot(7, 4), width: 3.2,
    deckAt: t => cloudY(-38-7*t,65+4*t)-cloudY(-38,65) });
  const vine = canopyBridgePlacement;
  const placements = [...landscapeKits(), ...coniferKits(), ...canopyTreeKits(), ...junctionKits(), ...shelterKits("base"), ...shelterKits("bag"),
    { id: "vine-bridge", kit: canopyBridgeKit(), position: [vine.x, cloudY(vine.x, vine.z), vine.z] as [number,number,number], yaw: 0 },
    { id: "sea-bridge", kit: crane, position: [-38,cloudY(-38,65),65] as [number,number,number], yaw: Math.atan2(-7,4) }];
  for (const p of placements) for (const part of p.kit.parts.filter(part => part.ground)) {
    const b = part.bounds, matrix = new THREE.Matrix4().makeRotationY(p.yaw).setPosition(...p.position);
    // Centre and four near-corners cover the complete support footprint.
    for (const [u,v] of [[.5,.5],[.15,.15],[.85,.15],[.15,.85],[.85,.85]]) {
      const point = new THREE.Vector3(THREE.MathUtils.lerp(b.min.x,b.max.x,u), b.min.y, THREE.MathUtils.lerp(b.min.z,b.max.z,v)).applyMatrix4(matrix);
      const startY = Math.max(p.position[1],cloudY(point.x,point.z),point.y)+25;
      const ray = new THREE.Raycaster(new THREE.Vector3(point.x, startY, point.z), new THREE.Vector3(0,-1,0), 0, 60);
      const hit = ray.intersectObject(terrain,true)[0];
      const label = `${p.id}/${part.id} at ${point.x.toFixed(2)},${point.z.toFixed(2)}`;
      expect(hit, label + " has drawn support").toBeDefined();
      expect(hit.point.y, label + " feet meet that support").toBeGreaterThanOrEqual(point.y - .05);
      // On walkable ground the drawn terrain is the collision floor; off it the
      // island heightfield may rise around a footing, which then sits embedded
      // but never swallowed: the ground stays below the footing's top, allowing
      // 15 cm of grass over the edge of a thin slab laid on gently uneven ground.
      // 15 cm: the 2 m terrain grid chords the walking floor's tightest hill crowns.
      if (cloudZoneAt(point.x, point.z)) expect(Math.abs(hit.point.y-cloudY(point.x,point.z)), label + " terrain follows collision height").toBeLessThan(.15);
      else expect(hit.point.y, label + " is not swallowed").toBeLessThan(point.y + (b.max.y - b.min.y) + .15);
    }
  }
  placements.forEach(p => p.kit.geometry.dispose());
  surfaces.forEach(g => g.dispose()); material.dispose();
}, 30000);

it("covers the diagonal vine crossing when solved and leaves both puzzle gaps open otherwise", () => {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const geometry = cloudRouteGeometry.bridgeGeometry(), p = canopyBridgePlacement;
  const bridge = new THREE.Mesh(geometry, material);
  bridge.position.set(p.x, cloudY(p.x, p.z), p.z);
  bridge.updateMatrixWorld(true);
  const barrier = CLOUD_PUZZLE_BARRIERS.find(b => b.puzzle === "canopyVine")!;
  const trails = CLOUD_ZONES.skyrootCanopy.walk.filter(s => s.kind === "trail");
  let samples = 0;
  for (let z = barrier.z0 + .1; z < barrier.z1; z += .25) for (let x = barrier.x0; x <= barrier.x1; x += .25) {
    const onPath = trails.some(trail => trail.pts.some(([bx, bz], i) => {
      if (!i) return false;
      const [ax, az] = trail.pts[i - 1], dx = bx - ax, dz = bz - az;
      const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
      return Math.hypot(x - ax - dx * t, z - az - dz * t) <= trail.w;
    }));
    if (!onPath) continue;
    const y = cloudY(x, z), hit = new THREE.Raycaster(new THREE.Vector3(x, y + .15, z), new THREE.Vector3(0, -1, 0), 0, .3).intersectObject(bridge)[0];
    expect(hit, `solved vine bridge carries ${x},${z}`).toBeDefined();
    samples++;
  }
  expect(samples).toBeGreaterThan(100);
  bridge.rotation.x = 1.25; bridge.updateMatrixWorld(true);
  const centreZ = (barrier.z0 + barrier.z1) / 2;
  const ray = new THREE.Raycaster(new THREE.Vector3(p.x, cloudY(p.x, centreZ) + .15, centreZ), new THREE.Vector3(0, -1, 0), 0, .3);
  expect(ray.intersectObject(bridge)).toHaveLength(0);
  const canopy = cloudRouteGeometry.canopyGeometry(), mesh = new THREE.Mesh(canopy, material);
  mesh.updateMatrixWorld(true);
  const glide = CLOUD_CHASMS.find(c => c.z0 > CANOPY_GLIDE.from.z && c.z1 < CANOPY_GLIDE.to.z)!;
  for (let z = glide.z0 + .05; z < glide.z1; z += .25) {
    const x = CANOPY_GLIDE.from.x;
    expect(new THREE.Raycaster(new THREE.Vector3(x, cloudY(x, z) + .2, z), new THREE.Vector3(0, -1, 0), 0, .5).intersectObject(mesh)).toHaveLength(0);
  }
  geometry.dispose(); canopy.dispose(); material.dispose();
});

it("carries every 1 m deck sample at cloudY in one merged canopy draw below 25k triangles", () => {
  const geometry = cloudRouteGeometry.canopyGeometry(), material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const deck = new THREE.Mesh(geometry, material);
  deck.updateMatrixWorld(true);
  let samples = 0;
  const check = (x: number, z: number) => {
    const y = cloudY(x, z);
    const hit = new THREE.Raycaster(new THREE.Vector3(x, y + .15, z), new THREE.Vector3(0, -1, 0), 0, .3).intersectObject(deck)[0];
    expect(hit, `deck at ${x.toFixed(2)},${z.toFixed(2)}`).toBeDefined();
    expect(Math.abs(hit.point.y - y)).toBeLessThanOrEqual(.15);
    samples++;
  };
  for (const shape of CLOUD_DECKS) {
    if (shape.kind === "trail") {
      for (let i = 1; i < shape.pts.length; i++) {
        const [ax, az] = shape.pts[i - 1], [bx, bz] = shape.pts[i], length = Math.hypot(bx - ax, bz - az);
        // Across the full width, including both edges, and along every metre.
        for (let d = 0; d <= Math.ceil(length); d++) for (let w = -shape.w; w <= shape.w; w = Math.min(w + 1, shape.w)) {
          const t = Math.min(d / length, 1);
          check(ax + (bx - ax) * t + (bz - az) / length * w, az + (bz - az) * t - (bx - ax) / length * w);
          if (w === shape.w) break;
        }
      }
    } else if (shape.kind === "disc") {
      for (let dx = -shape.r; dx <= shape.r; dx++) for (let dz = -shape.r; dz <= shape.r; dz++) {
        if (Math.hypot(dx, dz) <= shape.r) check(shape.x + dx, shape.z + dz);
      }
      for (let i = 0; i < Math.ceil(2 * Math.PI * shape.r); i++) {
        const angle = i / Math.ceil(2 * Math.PI * shape.r) * Math.PI * 2;
        check(shape.x + Math.cos(angle) * shape.r, shape.z + Math.sin(angle) * shape.r);
      }
    } else {
      for (let x = shape.x0; x <= shape.x1; x++) for (let z = shape.z0; z <= shape.z1; z++) check(x, z);
    }
  }
  expect(samples).toBeGreaterThan(200);
  expect(geometry.groups).toHaveLength(0);
  const bridge = cloudRouteGeometry.bridgeGeometry();
  const triangles = [geometry, bridge].reduce((sum, g) => sum + (g.index?.count ?? g.getAttribute("position").count) / 3, 0);
  expect(triangles).toBeLessThan(25000);
  geometry.dispose(); bridge.dispose(); material.dispose();
});

it("renders every deck post continuously from the terrain to the deck underside", () => {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const surfaces = cloudGeometry.terrainTiles(), terrain = new THREE.Group();
  surfaces.forEach(g => terrain.add(new THREE.Mesh(g, material)));
  const geometry = canopyFoundationGeometry(), foundation = new THREE.Mesh(geometry, material);
  terrain.updateMatrixWorld(true); foundation.updateMatrixWorld(true);
  const supports = canopyDeckSupports();
  expect(supports.length).toBeGreaterThan(10);
  for (const p of supports) for (const [dx, dz] of [[0, 0], [-.1, -.1], [.1, .1]]) {
    const x = p.x + dx, z = p.z + dz;
    const ground = new THREE.Raycaster(new THREE.Vector3(x, cloudY(x, z) + 25, z), new THREE.Vector3(0, -1, 0), 0, 80).intersectObject(terrain, true)[0];
    expect(ground, `terrain beneath post ${x},${z}`).toBeDefined();
    // A brace may extend below a short entrance post: identify the actual
    // post cap among the intersections rather than mistaking the brace for it.
    const foot = new THREE.Raycaster(new THREE.Vector3(x, p.bottom - 1, z), new THREE.Vector3(0, 1, 0), 0, p.top - p.bottom + 2)
      .intersectObject(foundation).find(hit => Math.abs(hit.point.y - p.bottom) < .001)!;
    expect(foot, `rendered post foot ${x},${z}`).toBeDefined();
    expect(foot.point.y).toBeCloseTo(p.bottom, 4);
    expect(foot.point.y, JSON.stringify({ post: p, sample: [x,z], ground: ground.point.toArray() })).toBeLessThanOrEqual(ground.point.y + .05);
    const head = new THREE.Raycaster(new THREE.Vector3(x, p.top + .01, z), new THREE.Vector3(0, -1, 0), 0, .02).intersectObject(foundation)[0];
    expect(head, `post reaches deck underside ${x},${z}`).toBeDefined();
  }
  geometry.dispose(); surfaces.forEach(g => g.dispose()); material.dispose();
}, 30000);
