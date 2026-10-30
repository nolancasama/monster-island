import { getGame } from "./store";
import { rt } from "./runtime";
import { PLAYER_R, nearestWalkable, gatesOf, standY } from "./world/collision";
import { SPAWN, VOLCANO_PATH, BRIDGE, CLIFF_TOP_SPOT, CROSSING, FALLEN_PALM, FOOD_SOURCES, FOREST_SIGN, MONSTER_STONE, ROPE } from "./world/island";
import { LIVE_MONSTERS } from "./data/monsters";
import { ACT2_PLACE, PHASE3_PLACE } from "./flow/obstacles";
import { CLOUD_DOCK, CLOUD_SPAWNS, CLOUD_OBSTACLE_PLACE, CLOUD_PICKUPS, CLOUD_CHESTS, HOLLOW, OBSERVATORY, type CloudAreaId } from "./world/cloudisle";
import { CAMP2, CHESTS, CLIFF_ROPE, FORK_SIGN, ROUTE_MARKERS, SERVICES, SHORTCUT_GATE, type ServiceId, type ZoneId } from "./world/lowland";

/** Placement shared by tester navigation and the stable e2e hook. */
export const placePlayer = (x: number, z: number, faceX: number, faceZ: number) => {
    const p = nearestWalkable(x, z, PLAYER_R, gatesOf(getGame().progress));
    rt.player.x = p.x;
    rt.player.z = p.z;
    rt.player.y = standY(p.x, p.z, getGame().progress.solved);
    rt.player.vx = rt.player.vz = 0;
    rt.player.yaw = Math.atan2(faceX - p.x, faceZ - p.z);
    rt.camera.snap = true;
    return p;
  };
export const travelTarget = (name: string): { x: number; z: number } | null => {
    if (getGame().progress.act3.world === "cloud") {
      if (name.startsWith("cloud:")) return CLOUD_SPAWNS[name.slice(6) as CloudAreaId] ?? null;
      if (name in CLOUD_SPAWNS) return CLOUD_SPAWNS[name as CloudAreaId];
      if (name === "cloudGull") return CLOUD_DOCK.gull;
      if (name === "observatoryRest") return OBSERVATORY.rest;
      if (name === "beaconLift") return OBSERVATORY.lift;
      if (name === "hollowRest") return HOLLOW.rest;
      if (name === "tala" || name === "bo" || name === "kiko") return HOLLOW[name];
      if (name in CLOUD_OBSTACLE_PLACE) return CLOUD_OBSTACLE_PLACE[name as keyof typeof CLOUD_OBSTACLE_PLACE];
      const pickup = [...CLOUD_PICKUPS, ...CLOUD_CHESTS].find(p => p.id === name);
      if (pickup) return pickup;
    }
    if (name === "beach") return SPAWN;
    if (name === "volcanoTrail") { const p = VOLCANO_PATH[0]; return { x: (p.x0 + p.x1) / 2, z: (p.z0 + p.z1) / 2 }; }
    if (name === "maple") return { x: rt.maple.x, z: rt.maple.z };
    if (name === "palm") return { x: FALLEN_PALM.x - 1, z: FALLEN_PALM.z };
    if (name === "river") return CROSSING.west;
    if (name === "stone") return MONSTER_STONE;
    if (name === "sign") return FOREST_SIGN;
    if (name === "bridge") return { x: BRIDGE.x, z: BRIDGE.z1 + 0.6 };
    if (name === "cliff" || name === "rope") return { x: ROPE.x, z: ROPE.z + 0.2 };
    if (name === "cliffTop") return CLIFF_TOP_SPOT;
    if (name in PHASE3_PLACE) return PHASE3_PLACE[name as keyof typeof PHASE3_PLACE];
    // Act 2 places.
    if (name in ACT2_PLACE) return ACT2_PLACE[name as keyof typeof ACT2_PLACE];
    if (name === "cliffDown") return { x: CLIFF_ROPE.top.x, z: CLIFF_ROPE.top.z - 0.5 };
    if (name === "cliffUp") return { x: CLIFF_ROPE.foot.x, z: CLIFF_ROPE.foot.z + 0.6 };
    if (name === "campRest") return CAMP2.rest;
    if (name === "forkSign") return FORK_SIGN;
    if (name === "lockedGate") return { x: SHORTCUT_GATE.x, z: SHORTCUT_GATE.z + 1.2 };
    if (name in SERVICES) return SERVICES[name as ServiceId].keeper;
    if (name.startsWith("zone:")) return ROUTE_MARKERS[name.slice(5) as ZoneId] ?? null;
    const chest = CHESTS.find((c) => c.id === name);
    if (chest) return chest;
    if ((LIVE_MONSTERS as string[]).includes(name)) return rt.monsters[name as keyof typeof rt.monsters];
    const src = FOOD_SOURCES.find((s) => s.id === name || s.food === name);
    return src ?? null;
  };
export function goToTarget(name: string, dist = 1.6) {
      const t = travelTarget(name);
      if (!t) throw new Error(`no target ${name}`);
      const a = Math.atan2(rt.player.x - t.x, rt.player.z - t.z);
      // Obstacles are approached from the side the player arrives on.
      // Act 2: unlocks are asked from their own standing spot; keepers are faced across their counter.
      if (name in ACT2_PLACE) {
        const f = ACT2_PLACE[name as keyof typeof ACT2_PLACE];
        const face = ({ groveLilies: { x: 39, z: -223 }, canopyVines: { x: 106, z: -218 }, canopyRope: { x: 106, z: -227.5 }, causewayGate: SHORTCUT_GATE } as Record<string, { x: number; z: number }>)[name];
        return placePlayer(f.x, f.z, face.x, face.z);
      }
      if (name in SERVICES) {
        const k = SERVICES[name as ServiceId].keeper;
        return placePlayer(k.x + Math.sin(k.yaw) * 1.7, k.z + Math.cos(k.yaw) * 1.7, k.x, k.z);
      }
      const near =
        name === "river"
          ? { x: t.x - 0.2, z: t.z }
          : name === "bridge" || name === "cliff" || name === "rope" || name in PHASE3_PLACE
            ? { x: t.x, z: t.z + dist * 0.6 }
            : { x: t.x + Math.sin(a) * dist, z: t.z + Math.cos(a) * dist };
      return placePlayer(near.x, near.z, name === "river" ? CROSSING.east.x : t.x, name === "river" ? CROSSING.east.z : t.z);
}

