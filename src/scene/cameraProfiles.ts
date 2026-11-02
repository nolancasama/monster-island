import { BEACON_ARENA } from "../game/logic/beacon";
import { TUNNEL } from "../game/world/island";
import { CLIFF_ROPE, inLowland, zoneAt } from "../game/world/lowland";
import { CLOUD_ZONES, CLOUD_CHESTS, cloudZoneAt } from "../game/world/cloudisle";

export interface CameraPoint { x: number; y: number; z: number; climbing: boolean; cloud: boolean }
export interface Framing { yaw: number; pitch: number; dist: number; ahead: number }
export interface CameraProfile extends Framing {
  id: string;
  contains: (p: CameraPoint, margin: number) => boolean;
  kind?: "rope" | "tunnel" | "lowland";
  fov?: number;
  viewShift?: number;
  trackYaw?: boolean;
  /** Metres of smoothed look-ahead along world x, from the player's velocity. */
  lead?: number;
  anchor?: { x: number; z: number } | ((p: CameraPoint, frame: Framing) => { x: number; z: number });
  /** Position-dependent authored framing (rope foot / radial arena). */
  resolve?: (p: CameraPoint, previous: Framing) => Framing;
}

export const DEFAULT_CAMERA: Framing = { yaw: 0, pitch: .55, dist: 10, ahead: 3 };
/** The original beach, seen from the sea: +x is screen right and it never turns. */
const BEACH_SIDE: Framing & { lead: number } = { yaw: 0, pitch: .42, dist: 11, ahead: 1.5, lead: 2 };
export const CAMERA_BLEND_SECONDS = 1;
export const CAMERA_HYSTERESIS = .65;
const rect = (p: CameraPoint, m: number, x0: number, x1: number, z0: number, z1: number) =>
  p.x >= x0 - m && p.x <= x1 + m && p.z >= z0 - m && p.z <= z1 + m;
const home = (contains: CameraProfile["contains"]): CameraProfile["contains"] => (p, m) => !p.cloud && !inLowland(p.x, p.z + m) && contains(p, m);
const smooth = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };

/** Priority order, most specific first. All gameplay follow framing lives here.
 * Margins expand a retained zone and contract an entering zone, in world metres.
 * Scripted shots (including the prologue rope) remain owned by their scenes. */
export const CAMERA_PROFILES: readonly CameraProfile[] = [
  { ...DEFAULT_CAMERA, id: "cliff-rope", kind: "rope", yaw: Math.atan2(5, -8), pitch: Math.atan2(2.9, Math.hypot(5, 8)), dist: Math.hypot(5, 8, 2.9), ahead: 0,
    contains: p => !p.cloud && p.climbing && p.z < -140 },
  { ...DEFAULT_CAMERA, id: "beacon-arena", fov: 80, viewShift: -.2, trackYaw: true, contains: (p, m) => p.cloud && p.y > BEACON_ARENA.y - 3 - m && Math.hypot(p.x - BEACON_ARENA.x, p.z - BEACON_ARENA.z) < BEACON_ARENA.radius + 1 + m,
    resolve: (p, previous) => ({ ...DEFAULT_CAMERA, yaw: Math.hypot(p.x - BEACON_ARENA.x, p.z - BEACON_ARENA.z) > 2.5 ? Math.atan2(p.x - BEACON_ARENA.x, p.z - BEACON_ARENA.z) : previous.yaw }) },
  { ...DEFAULT_CAMERA, id: "cloud-back-tunnel", yaw: Math.PI, dist: 7, ahead: 1.5, fov: 80, viewShift: -.2,
    contains: p => p.cloud && cloudZoneAt(p.x, p.z) === "backTunnel" },
  { ...DEFAULT_CAMERA, id: "cloud-sea-cave", yaw: Math.PI, pitch: .4, dist: 6, ahead: 1, fov: 80, viewShift: -.15,
    contains: (p, m) => p.cloud && Math.hypot(p.x - CLOUD_CHESTS[0].x, p.z - CLOUD_CHESTS[0].z) < 6 + m },
  { ...DEFAULT_CAMERA, id: "cloud-hollow", yaw: Math.PI, pitch: .48, dist: 7, ahead: 1.5, fov: 80, viewShift: -.2,
    contains: p => p.cloud && cloudZoneAt(p.x, p.z) === CLOUD_ZONES.hiddenHollow.id },
  { ...DEFAULT_CAMERA, id: "cloud-overlook", yaw: Math.PI, pitch: .65, dist: 12, ahead: 3, fov: 80, viewShift: -.2,
    contains: (p, m) => p.cloud && CLOUD_ZONES.stormbreakCoast.walk.some(s => s.kind === "disc" && s.r === 4 && Math.hypot(p.x-s.x,p.z-s.z) < s.r + m) },
  { ...DEFAULT_CAMERA, id: "cloud-grotto", yaw: Math.PI, pitch: .48, dist: 8, ahead: 2, fov: 80, viewShift: -.2,
    contains: p => p.cloud && cloudZoneAt(p.x, p.z) === "thunderGrotto" },
  { ...DEFAULT_CAMERA, id: "cloud", yaw: Math.PI, fov: 80, viewShift: -.2, contains: p => p.cloud },
  { ...DEFAULT_CAMERA, id: "lowland-rope-foot", kind: "lowland", contains: (p, m) => !p.cloud && inLowland(p.x, p.z - m) && p.z > CLIFF_ROPE.foot.z - 6 - m,
    resolve: p => { const k = smooth((p.z - (CLIFF_ROPE.foot.z - 6)) / 5); return { yaw: 0, pitch: .55 + .6 * k, dist: 10 - 2 * k, ahead: 3 * (1 - k) }; } },
  // Fixed views angled toward the mesa, low enough for its strata to be in frame:
  // the default pitch cuts the frame off below the horizon. The arms are mirrored.
  { ...DEFAULT_CAMERA, id: "forest-left-arm", kind: "lowland", yaw: -.5, pitch: .36, dist: 11, ahead: 2,
    contains: (p, m) => !p.cloud && p.x < 58 + m && p.z > -207 - m && p.z < -158 + m && zoneAt(p.x, p.z) === "forest1" },
  { ...DEFAULT_CAMERA, id: "forest-right-arm", kind: "lowland", yaw: .5, pitch: .36, dist: 11, ahead: 2,
    contains: (p, m) => !p.cloud && p.x > 94 - m && p.z > -207 - m && p.z < -158 + m && zoneAt(p.x, p.z) === "forest1" },
  { ...DEFAULT_CAMERA, id: "forest-base", kind: "lowland", pitch: .36, dist: 11.5, ahead: 2,
    contains: (p, m) => !p.cloud && p.z < -165 + m && p.x > 58 - m && p.x < 94 + m && zoneAt(p.x, p.z) === "forest1" },
  // Sees over the town wall from both sides; the wall also fades on the sight line.
  { ...DEFAULT_CAMERA, id: "port-gate", kind: "lowland", pitch: .85, dist: 11, ahead: 1,
    contains: (p, m) => !p.cloud && p.z < -282 + m && p.z > -298 - m },
  { ...DEFAULT_CAMERA, id: "lowland", kind: "lowland", contains: (p, m) => !p.cloud && inLowland(p.x, p.z - m) },
  { ...DEFAULT_CAMERA, id: "volcano-tunnel", kind: "tunnel", pitch: .24, dist: 3.4, ahead: 0,
    contains: home((p, m) => rect(p, m, TUNNEL.x - 3.6, TUNNEL.x + 3.6, TUNNEL.z0 - 1.2, TUNNEL.z1 + .8)) },
  // The elevated courtyard anchor clears the foreground rim rock, holds
  // the complete pillar row, and looks through the lowered east wall.
  { ...DEFAULT_CAMERA, id: "sanctuary-courtyard", pitch: .65, dist: 16, ahead: 5,
    // The lens stays east of the tunnel roof. A bounded pan fits both the
    // pillar row and the player, including the courtyard's outer shoulders.
    resolve: p => {
      // The far-west player otherwise sits behind the courtyard rim rock.
      // Raise the lens smoothly only beyond the tunnel-side entry.
      const west = smooth((64 - p.x) / 6.5);
      const pitch = .65 + .2 * west, dist = 16 + 4 * west;
      return { yaw: Math.asin((72 - Math.max(66.4, Math.min(73.5, 70 + (p.x - 70) * .35))) / (dist * Math.cos(pitch))), pitch, dist, ahead: 5 };
    },
    anchor: (_p, frame) => ({ x: 72 - (frame.dist * Math.cos(frame.pitch) - frame.ahead) * Math.sin(frame.yaw), z: -128 }),
    contains: home((p, m) => rect(p, m, 57, 83, -134, -125.4)) },
  { ...DEFAULT_CAMERA, id: "sanctuary-garden", contains: home((p, m) => p.z < -134 + m) },
  { ...DEFAULT_CAMERA, id: "ember-slope", yaw: -.35, contains: home((p, m) => p.z < -82 + m) },
  { ...DEFAULT_CAMERA, id: "volcano-trail", yaw: -.35, pitch: .25, ahead: 3.5, contains: home((p, m) => p.z < -52 + m) },
  { ...DEFAULT_CAMERA, id: "cliff-top", dist: 8, ahead: 1, contains: home((p, m) => p.z < -45.6 + m) },
  { ...DEFAULT_CAMERA, id: "forest-hills", contains: home((p, m) => p.z < -29.4 + m) },
  { ...DEFAULT_CAMERA, id: "forest-bridge", dist: 8, ahead: 2, contains: home((p, m) => p.z < -23.4 + m) },
  { ...DEFAULT_CAMERA, id: "forest-glade", contains: home((p, m) => p.z < -17 + m) },
  { ...DEFAULT_CAMERA, id: "forest-path", dist: 7, ahead: 1.5, contains: home((p, m) => p.z < -8 + m && p.x > 29 - m) },
  { ...BEACH_SIDE, id: "river-bridge",
    contains: home((p, m) => rect(p, m, 20, 29, -3, 1)) },
  { ...BEACH_SIDE, id: "pier",
    contains: home((p, m) => rect(p, m, 11, 15, 5, 15)) },
  // Higher here: the seaward rock of the pass would otherwise fill the foreground.
  { ...BEACH_SIDE, id: "palm-pass", pitch: .68, dist: 10, ahead: 2.5,
    contains: home((p, m) => rect(p, m, -5, 3, -2, 4.4)) },
  { ...BEACH_SIDE, id: "far-bank", contains: home((p, m) => p.x > 28 - m) },
  { ...BEACH_SIDE, id: "east-beach", contains: home((p, m) => p.x > 3 - m) },
  { ...BEACH_SIDE, id: "west-beach", contains: p => !p.cloud },
];

/** Schmitt borders: retain until .65m outside, enter higher-priority zones
 * only .65m inside. No timer can alternate views for a stationary player. */
export function cameraProfileAt(p: CameraPoint, current?: CameraProfile): CameraProfile {
  const candidate = CAMERA_PROFILES.find(profile => profile.contains(p, -CAMERA_HYSTERESIS));
  if (current?.contains(p, CAMERA_HYSTERESIS) && (!candidate || CAMERA_PROFILES.indexOf(current) <= CAMERA_PROFILES.indexOf(candidate))) return current;
  return candidate ?? current ?? CAMERA_PROFILES[CAMERA_PROFILES.length - 1];
}
