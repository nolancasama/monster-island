import { cloudY, BACK_TUNNEL, ROUTE_MOUTHS, COAST_ROCKS } from "../game/world/cloudisle";
import { cloudGroundY, cloudLandMask } from "../game/world/cloudTerrain";
import { caveMouth, cliffSegment, giantTree, mountainConifer, rockFormation, ruinedArch, ruinedWall, shelterFrame, shelterShelf, waterfallSurround, type KitComposite, type KitPoint } from "./models/cloudKit";

export interface GroundedPlacement { id: string; position: KitPoint; kit: KitComposite; yaw: number }
/** Shared by rendered instances, terrain support footprints and grounding tests. */
export const cloudTreePlacements = Array.from({ length: 100 }, (_, i) => {
  const z = 18 + (i * 17.137) % 243;
  // Leave the central summit sightline open, and shelter approach concealed
  // behind its west shoulder rather than behind a wall across the lens.
  const x = (i % 2 ? -1 : 1) * (35 + (i * 3.731) % 10);
  return { x, z, s: .85 + (i % 5) * .15 };
// Only on dry land above the beach, clear of the crane bridge's open water.
}).filter(p => cloudLandMask(p.x, p.z) && cloudGroundY(p.x, p.z) > 1.6 && !(p.x > -46 && p.x < -37 && p.z > 56 && p.z < 82));
export function canopyTreeKits(): GroundedPlacement[] {
  // Gentle terrain shoulders outside the carved paths and clearings keep the
  // complete root footprints grounded, with trunks clear of the walking lane.
  const sites = [
    { x: -44, z: 300, target: [-35, 298] },
    { x: -38, z: 306, target: [-33, 303] },
    { x: -39, z: 336, target: [-44, 334] },
    // East of the high path, out of the follow camera's view ahead.
    { x: -28, z: 372, target: [-45, 374] },
    { x: -27, z: 380, target: [-45, 380] },
  ];
  return sites.map(({ x, z, target: [tx, tz] }, i) => {
    // Use the same high-rest rule as landscapeKits. The integral rock pad
    // spans the slope; its top sits at the highest ground, its foot below all
    // footprint samples. A provisional kit gives the actual kit footprint.
    const footprint = giantTree();
    let low = cloudGroundY(x, z), high = low;
    for (const part of footprint.parts.filter(p => p.ground)) {
      for (const dx of [part.bounds.min.x, part.bounds.max.x]) for (const dz of [part.bounds.min.z, part.bounds.max.z]) {
        const y = cloudGroundY(x + dx, z + dz);
        low = Math.min(low, y); high = Math.max(high, y);
      }
    }
    footprint.geometry.dispose();
    const walk = cloudY(tx, tz), padHeight = high - low + 1;
    const options = { height: Math.max(25, walk - high + padHeight + 12), crownRadius: 4.8,
      padHeight, platformHeight: 14, platformReach: [tx - x, 0, tz - z] as KitPoint };
    // padHeight changes the trunk's sockets. Measure the public anchor rather
    // than assuming that platformHeight is measured from the ground plane.
    const probe = giantTree(options);
    const platformHeight = options.platformHeight + walk - high - .08 - probe.anchors["walkwayBranch.platform"].point[1];
    probe.geometry.dispose();
    return { id: `skyroot-tree-${i}`, yaw: 0, position: [x, high, z],
      kit: giantTree({ ...options, platformHeight }) };
  });
}
/** Junction props are rendered with the route mouths, not the coast scenery. */
export function junctionKits(): GroundedPlacement[] {
  return ROUTE_MOUTHS.map(m => {
    const kit = ruinedArch(5.2, 5, 1.4), c = Math.cos(m.yaw), s = Math.sin(m.yaw);
    let y = cloudGroundY(m.x, m.z);
    for (const part of kit.parts.filter(p => p.ground)) {
      for (const dx of [part.bounds.min.x, part.bounds.max.x]) for (const dz of [part.bounds.min.z, part.bounds.max.z]) {
        y = Math.min(y, cloudGroundY(m.x + dx * c + dz * s, m.z - dx * s + dz * c));
      }
    }
    return { id: `route-arch-${m.x}`, kit, position: [m.x, y, m.z], yaw: m.yaw };
  });
}
export function landscapeKits(): GroundedPlacement[] {
  const out: GroundedPlacement[] = [];
  // On the drawn island surface (equal to the walking floor on paths): slabs sit
  // at the lowest ground under their footprint; a deep pad ("high") tops out at
  // the highest and reaches down a slope.
  const put = (id: string, kit: KitComposite, x: number, z: number, yaw = 0, rest: "low" | "high" = "low") => {
    const c = Math.cos(yaw), s = Math.sin(yaw), pick = rest === "low" ? Math.min : Math.max;
    let y = cloudGroundY(x,z);
    for (const part of kit.parts.filter(p => p.ground)) for (const dx of [part.bounds.min.x,part.bounds.max.x]) for (const dz of [part.bounds.min.z,part.bounds.max.z]) {
      y = pick(y, cloudGroundY(x + dx*c + dz*s, z - dx*s + dz*c));
    }
    out.push({ id, kit, position: [x, y, z], yaw });
  };
  put("waterfall", waterfallSurround(11, 10.6), -10.5, 189.8);
  // On the hillside above the shelter, gripping a rock outcrop.
  put("shelter-tree", giantTree({ height: 24, platformHeight: 14, crownRadius: 6, padHeight: 3 }), -34, 204, 0, "high");
  put("supply-camp", shelterFrame(5, 2.4, 3), 32, 104);
  for (const [x, z] of [[-49, 70], [48, 129]]) put(`sea-mouth-${x}`, caveMouth(9, 5, 7), x, z);
  for (const [x, z] of COAST_ROCKS) {
    put(`rock-${z}`, rockFormation(), x, z);
  }
  for (const [x, z] of [[-36, 96], [27, 149]]) put(`overlook-${z}`, ruinedWall(), x, z);
  for (let i = 1; i < BACK_TUNNEL.length; i++) {
    const [ax, az] = BACK_TUNNEL[i - 1], [bx, bz] = BACK_TUNNEL[i];
    const len = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    for (const side of [-1, 1]) put(`tunnel-${i}-${side}`, cliffSegment(1.2, 4.9, len + 1),
      mx + Math.cos(yaw) * side * 3, mz - Math.sin(yaw) * side * 3, yaw);
    for (const p of out.slice(-2)) p.position[1] = Math.min(cloudGroundY(ax, az), cloudGroundY(bx, bz)) - .1; // seated below the 2 m grid's chord
  }
  return out;
}
/** A conifer seated at the lowest ground around its trunk, so it never floats on a slope. */
export function coniferY(p: { x: number; z: number; s: number }): number {
  let y = cloudGroundY(p.x, p.z);
  for (let a = 0; a < 6; a++) y = Math.min(y, cloudGroundY(p.x + Math.cos(a) * p.s, p.z + Math.sin(a) * p.s));
  return y - .1;
}
export function coniferKits(): GroundedPlacement[] {
  return cloudTreePlacements.map((p, i) => {
    const kit = mountainConifer();
    kit.geometry.scale(p.s, p.s, p.s);
    kit.parts.forEach(part => { part.bounds.min.multiplyScalar(p.s); part.bounds.max.multiplyScalar(p.s); });
    return { id: `conifer-${i}`, kit, position: [p.x, coniferY(p), p.z], yaw: 0 };
  });
}
export function shelterKits(upgrade: string): GroundedPlacement[] {
  return upgrade === "base" ? [
    { id: "shelter-map-frame", kit: shelterFrame(2.2, 2.1, .12), position: [-9, 4, 203.8], yaw: 0 },
    { id: "shelter-patch-frame", kit: shelterFrame(1.6, 1.6, .12), position: [-21.3, 4, 196], yaw: 0 },
  ] : upgrade === "bag" ? [{ id: "shelter-shelf", kit: shelterShelf(), position: [-7, 4, 201.5], yaw: 0 }] : [];
}
