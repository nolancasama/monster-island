import type { Text, Vec2 } from "../types";
import type { SolidShape } from "./island";
import type { CompanionId } from "../data/combat";
import type { AbilityId } from "../types";
import type { PhraseId } from "../logic/english";
import { nearestOnTrail, type WalkShape } from "./lowland";

/** Cloud Isle is a separate world. North/up-mountain is +z. New slices append
 * zones and routes here; closed route mouths never imply playable ground. */
export type CloudArea = "cloudDock" | "stormbreakCoast" | "hiddenHollow" | "backTunnel" | "windfallJunction" | "skyrootCanopy" | "thunderGrotto" | "observatoryApproach" | "ancientObservatory" | "stormBeacon";
export type CloudAreaId = CloudArea;
export const CLOUD_AREAS: CloudAreaId[] = ["cloudDock", "stormbreakCoast", "hiddenHollow", "backTunnel", "windfallJunction", "skyrootCanopy", "thunderGrotto", "observatoryApproach", "ancientObservatory", "stormBeacon"];
export const CLOUD_STAGES = ["stormbreakCoast", "skyrootCanopy", "thunderGrotto", "ancientObservatory"] as const;
export type CloudStageId = typeof CLOUD_STAGES[number];
export const CLOUD_PUZZLES = ["coastWindmill", "coastCrate", "canopyVine", "canopyGlide", "canopyGust", "grottoRaft", "grottoBoiler", "obsLeafy", "obsBubbo", "obsPuff", "obsEmber"] as const;
export const OBSERVATORY_PUZZLES = ["obsLeafy", "obsBubbo", "obsPuff", "obsEmber"] as const;
export type CloudPuzzleId = typeof CLOUD_PUZZLES[number];
export type CloudEnemyKind = "stormCrab" | "windSprite" | "raiderDrone" | "raiderShooter" | "thunderBeetle";
export interface CloudGates { cleared?: readonly string[]; solved?: readonly string[]; tunnelOpen?: boolean; observatoryLamps?: readonly string[] }
const rect = (x0: number, x1: number, z0: number, z1: number): WalkShape => ({ kind: "rect", x0, x1, z0, z1 });
const disc = (x: number, z: number, r: number): WalkShape => ({ kind: "disc", x, z, r });
const trail = (pts: Array<[number, number]>, w: number): WalkShape => ({ kind: "trail", pts, w });
export const CLOUD_DOCK = { spawn: { x: 0, z: 1 }, gull: { x: -2.2, z: 2.5 }, rest: { x: 1.8, z: 1.5 }, boat: { x: 0, z: -8 } };
export const HOLLOW = {
  entrance: { x: -10, z: 190 }, center: { x: -13, z: 197 },
  tala: { x: -12, z: 194.5 }, bo: { x: -17, z: 198 }, kiko: { x: -10, z: 199 },
  rest: { x: -17, z: 201 }, fire: { x: -16, z: 196 }, tunnel: { x: -15, z: 204 },
};
export const CLOUD_SPAWNS: Record<CloudArea, Vec2> = {
  cloudDock: CLOUD_DOCK.spawn, stormbreakCoast: { x: 4, z: 26 }, hiddenHollow: { x: -13, z: 195 },
  backTunnel: { x: -29, z: 230 }, windfallJunction: { x: 0, z: 269 },
  skyrootCanopy: { x: -30, z: 298 }, thunderGrotto: { x: 24, z: 294 }, observatoryApproach: { x: 0, z: 402 },
  ancientObservatory: { x: 0, z: 408 }, stormBeacon: { x: 0, z: 430 },
};
export const COAST_TRAIL: Array<[number, number]> = [[0, 12], [6, 28], [-12, 46], [-24, 65], [-16, 82], [10, 96], [28, 113], [20, 132], [2, 146], [0, 158]];
export const COAST_SEA_BRIDGE = trail([[-38, 65], [-45, 69]], 1.6);
export const COAST_ROCKS = [[-6, 32], [-14, 52], [-29, 76], [18, 102], [32, 126], [6, 146], [-32, 176], [-24, 188]] as const;
export const HOLLOW_APPROACH: Array<[number, number]> = [[0, 158], [-12, 169], [-27, 177], [-29, 187], [-19, 185], [-10, 190], [-12, 193]];
export const BACK_TUNNEL: Array<[number, number]> = [[-15, 202], [-17, 212], [-32, 223], [-29, 237], [-17, 244], [-20, 253], [-7, 261], [0, 265]];
/** Thunder Grotto. The mouth and exit trails are open air; every other shape
 * is underground, under the mountain (CLOUD_CAVES). */
const GROTTO_MOUTH_TRAIL = trail([[9, 279], [14, 284]], 2.7);
const GROTTO_EXIT_TRAIL = trail([[22, 390], [10, 401], [0, 402]], 2.7);
const GROTTO_CAVE: WalkShape[] = [
  trail([[14, 284], [22, 292], [28, 298]], 2.7), disc(28, 298, 10),
  trail([[28, 298], [40, 306], [48, 312]], 2.6), rect(42, 62, 312, 332),
  trail([[62, 318], [70, 321]], 2.2), disc(73, 322, 6),
  trail([[52, 332], [52, 340], [44, 348]], 2.6), disc(40, 352, 10),
  trail([[40, 352], [36, 364], [30, 374], [28, 384], [22, 390]], 2.8),
];
export const CLOUD_CAVES: readonly WalkShape[] = GROTTO_CAVE;
/** Where the grotto meets the open air (yaw faces out of the cave). */
export const GROTTO_MOUTHS = [{ x: 14, z: 284, yaw: Math.atan2(-5, -5) }, { x: 22, z: 390, yaw: Math.atan2(-12, 11) }];
/** The far-west branch walkway to the gust-lane viewpoint: 16 m above the
 * hillside, drawn as a deck on the giant trees rather than carved ground. */
export const CANOPY_GUST_SPUR: WalkShape[] = [trail([[-50, 332], [-62, 338], [-72, 341]], 2.4), disc(-72, 341, 5)];
export const CLOUD_ZONES: Record<CloudArea, { id: CloudArea; name: Text; hostile: boolean; walk: WalkShape[] }> = {
  cloudDock: { id: "cloudDock", name: { en: "Cloud Isle Dock", ja: "雲の島の船着き場" }, hostile: false, walk: [rect(-10, 10, -3, 14), rect(-1.5, 1.5, -9, 0), disc(8, 5, 5)] },
  stormbreakCoast: { id: "stormbreakCoast", name: { en: "Stormbreak Coast", ja: "嵐の海岸" }, hostile: true,
    walk: [trail(COAST_TRAIL, 3.8), disc(0, 25, 11), disc(-24, 65, 11), disc(27, 113, 11), disc(-8, 44, 8), disc(-10, 86, 9), disc(11, 140, 9), trail([[20, 132], [30, 143], [30, 154]], 2.4), trail([[-32, 65], [-38, 65]], 2.4), COAST_SEA_BRIDGE, disc(-49, 70, 6), trail([[32, 116], [43, 121], [48, 127]], 2.5), disc(48, 129, 6), trail([[-15, 82], [-29, 91], [-34, 100]], 2), disc(-34, 100, 4), trail([[11, 140], [23, 146], [25, 151]], 2), disc(25, 151, 4)] },
  hiddenHollow: { id: "hiddenHollow", name: { en: "Hidden Hollow", ja: "かくれ家の洞窟" }, hostile: false, walk: [trail(HOLLOW_APPROACH, 3.1), disc(-27, 180, 9), disc(-13, 185, 8), rect(-21, -5, 192, 204), disc(-13, 197, 7)] },
  backTunnel: { id: "backTunnel", name: { en: "Family's Back Tunnel", ja: "家族の裏トンネル" }, hostile: false, walk: [trail(BACK_TUNNEL, 2.25)] },
  windfallJunction: { id: "windfallJunction", name: { en: "Windfall Junction", ja: "風の分かれ道" }, hostile: true,
    walk: [disc(0, 273, 14), trail([[-8, 280], [-21, 288]], 3.2), trail([[0, 273], [9, 279]], 2.5),
      trail([[10, 271], [26, 265], [38, 266]], 3), disc(38, 266, 4),
      trail([[-8, 269], [-17, 262], [-23, 268]], 2.5), disc(-23, 268, 4)] },
  skyrootCanopy: { id: "skyrootCanopy", name: { en: "Skyroot Canopy", ja: "空根の樹冠" }, hostile: true,
    // Forest floor, two raised clearings, winding ramps, and a west viewpoint.
    walk: [trail([[-18, 285], [-28, 293], [-30, 300]], 3.2), disc(-30, 298, 9),
      trail([[-30, 301], [-36, 315], [-50, 329]], 3.2), disc(-50, 332, 9.5),
      trail([[-50, 332], [-43, 347], [-38, 354], [-38, 361], [-49, 377]], 3.2), disc(-49, 377, 9.5),
      ...CANOPY_GUST_SPUR,
      trail([[-49, 377], [-42, 389], [-28, 394], [-20, 400], [0, 402]], 3.2)] },
  thunderGrotto: { id: "thunderGrotto", name: { en: "Thunder Grotto", ja: "雷の洞窟" }, hostile: true,
    // Entry mouth, entry chamber, underground lake (raft), crystal side
    // chamber, steam machinery (boiler gate), electric corridor, exit climb.
    walk: [GROTTO_MOUTH_TRAIL, ...GROTTO_CAVE, GROTTO_EXIT_TRAIL] },
  observatoryApproach: { id: "observatoryApproach", name: { en: "Ancient Observatory — Entrance", ja: "古代の天文台・入口" }, hostile: false,
    // A forecourt where both routes arrive, with the rest point.
    walk: [rect(-16, 16, 399, 406)] },
  ancientObservatory: { id: "ancientObservatory", name: { en: "Ancient Observatory", ja: "古代の天文台" }, hostile: true,
    // The central hall and dial, a terrace on each side, and two broken towers
    // reached by walkways; the lift corridor north of the hall rises to the beacon.
    walk: [rect(-2.6, 2.6, 402, 409), rect(-10, 10, 407, 424), rect(-2.6, 2.6, 422, 428),
      rect(-26, -8, 409, 421), rect(8, 26, 409, 421),
      trail([[-20, 421], [-24, 426]], 1.8), disc(-24, 428, 6.5), trail([[20, 421], [24, 426]], 1.8), disc(24, 428, 6.5)] },
  stormBeacon: { id: "stormBeacon", name: { en: "Storm Beacon", ja: "嵐の灯台" }, hostile: true,
    walk: [rect(-2.6, 2.6, 425, 431), disc(0, 439, 12)] },
};
/** All search, map and terrain extents are derived from the authored shapes. */
export function cloudShapeBounds(s: WalkShape) {
  return s.kind === "rect" ? { x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1 }
    : s.kind === "disc" ? { x0: s.x - s.r, x1: s.x + s.r, z0: s.z - s.r, z1: s.z + s.r }
    : { x0: Math.min(...s.pts.map(p => p[0])) - s.w, x1: Math.max(...s.pts.map(p => p[0])) + s.w,
      z0: Math.min(...s.pts.map(p => p[1])) - s.w, z1: Math.max(...s.pts.map(p => p[1])) + s.w };
}
export function cloudAreaBounds(id: CloudArea) {
  const b = CLOUD_ZONES[id].walk.map(cloudShapeBounds);
  return { x0: Math.min(...b.map(b => b.x0)), x1: Math.max(...b.map(b => b.x1)), z0: Math.min(...b.map(b => b.z0)), z1: Math.max(...b.map(b => b.z1)) };
}
const zoneBounds = CLOUD_AREAS.map(cloudAreaBounds);
export const CLOUD_BOUNDS = { x0: Math.floor(Math.min(...zoneBounds.map(b => b.x0))) - 1,
  x1: Math.ceil(Math.max(...zoneBounds.map(b => b.x1))) + 1,
  z0: Math.floor(Math.min(...zoneBounds.map(b => b.z0))) - 1, z1: Math.ceil(Math.max(...zoneBounds.map(b => b.z1))) + 1 };
export const CLOUD_LAYOUT = 2;
export const CLOUD_MOUNTAIN_OFFSET = 180;
export const HOLLOW_OFFSET = 140;
const ORDER: CloudArea[] = ["hiddenHollow", "backTunnel", "cloudDock", "windfallJunction", "observatoryApproach", "stormBeacon", "ancientObservatory", "skyrootCanopy", "thunderGrotto", "stormbreakCoast"];
function inside(s: WalkShape, x: number, z: number, m: number): boolean {
  if (s.kind === "rect") return x >= s.x0 + m && x <= s.x1 - m && z >= s.z0 + m && z <= s.z1 - m;
  if (s.kind === "disc") return Math.hypot(x - s.x, z - s.z) <= s.r - m;
  return nearestOnTrail(s.pts, x, z).d <= s.w - m;
}
export function cloudZoneAt(x: number, z: number): CloudArea | null {
  return ORDER.find(id => CLOUD_ZONES[id].walk.some(s => inside(s, x, z, 0))) ?? null;
}
export const COAST_GATE = { x: 0, z: 158, half: 5, required: 6 };
export const RAIDER_BARRICADE = { x: 30, z: 151, half: 3.1 };
export const ROUTE_MOUTHS = [{ x: -18, z: 285, yaw: -.65 }, { x: 10, z: 280, yaw: .65 }];
export const OBSERVATORY = { x: 0, z: 407, y: 22, entrance: { x: 0, z: 402 }, rest: { x: 3.8, z: 402 }, dial: { x: 0, z: 415.5 }, lift: { x: 0, z: 425 } };
export const BEACON = { x: 0, z: 439, y: 37 };
export const CLOUD_ROUTE_GATES = [
  { zone: "skyrootCanopy", x: -22, z: 398, half: 15, required: 6 },
  { zone: "thunderGrotto", x: 13, z: 398, half: 7, required: 6 },
] as const;
export const CLOUD_ROUTE_REQUIRED = { skyrootCanopy: ["canopyVine", "canopyGlide"], thunderGrotto: ["grottoRaft", "grottoBoiler"] } as const;
export const CLOUD_PUZZLE_BARRIERS = [
  { puzzle: "canopyVine", x0: -48, x1: -20, z0: 311, z1: 313 },
  { puzzle: "canopyGlide", x0: -50, x1: -26, z0: 355, z1: 357 },
  { puzzle: "grottoRaft", x0: 42, x1: 62, z0: 321, z1: 323 },
  { puzzle: "grottoBoiler", x0: 30, x1: 44, z0: 361, z1: 363 },
  { puzzle: "canopyGust", x0: -62, x1: -60, z0: 331, z1: 348 },
] as const;
export const CANOPY_GLIDE = { from: { x: -38, z: 353.9 }, to: { x: -38, z: 358.1 } };
/** Walk shapes drawn as timber/branch walkways: the terrain is not carved
 * to them and stays well below. */
export const CLOUD_DECKS: readonly WalkShape[] = CANOPY_GUST_SPUR;
/** Gaps a puzzle spans (a bridge, a scripted glide): the terrain drops away
 * beneath them so they read as gaps, never as level ground. */
export const CLOUD_CHASMS = CLOUD_PUZZLE_BARRIERS.filter(b => b.puzzle === "canopyVine" || b.puzzle === "canopyGlide")
  .map(b => b.puzzle === "canopyGlide"
    ? { x0: b.x0, x1: b.x1, z0: CANOPY_GLIDE.from.z + 1.1, z1: CANOPY_GLIDE.to.z - 1.1 }
    : { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 });
export const CLOUD_ELECTRIC_PANELS = [
  { x: 32.5, z: 370, w: 3, d: 2, phase: 0 },
  { x: 29, z: 379, w: 3, d: 2, phase: 1.2 },
];
/** First 1.8 seconds are dark/safe, then .6 seconds of visible warning.
 * The entire 2.4 second safe window precedes a light 1.6 second pulse. */
export const electricPanelPhase = (time: number, phase = 0) => ((time + phase) % 4 + 4) % 4;
export const electricPanelActive = (time: number, phase = 0) => electricPanelPhase(time, phase) >= 2.4;
const nearCut = (x: number, z: number, x0: number, x1: number, z0: number, z1: number, r: number) => x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r;
/** Includes all static collision. Radius-grown cuts close the whole gate,
 * including the edge approach on a mounted friend. */
export function cloudWalkable(x: number, z: number, g: CloudGates = {}, r = 0): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (!ORDER.some(id => CLOUD_ZONES[id].walk.some(s => inside(s, x, z, r)))) return false;
  // The four persistent lamps raise the only route onto the summit platform.
  if (z > OBSERVATORY.lift.z - .5 - r && Math.abs(x) < 8 && (!g.cleared?.includes("ancientObservatory")
    || !["leafy", "bubbo", "puff", "ember"].every(id => g.observatoryLamps?.includes(id)))) return false;
  if (!(g.cleared?.includes("stormbreakCoast") || g.cleared?.includes("coast")) && nearCut(x, z, -12, 12, 157.6, 158.4, r)) return false;
  if (!g.tunnelOpen && nearCut(x, z, -23, -7, 204, 205, r)) return false;
  if (nearCut(x, z, 26, 34, 150.5, 151.5, r)) return false;
  if (nearCut(x, z, -43, -40, 60, 79, r)
    && (!g.solved?.includes("coastWindmill") || !inside(COAST_SEA_BRIDGE, x, z, r))) return false;
  if (!g.solved?.includes("coastCrate") && nearCut(x, z, 40, 43, 115, 138, r)) return false;
  for (const b of CLOUD_PUZZLE_BARRIERS) if (!g.solved?.includes(b.puzzle) && nearCut(x, z, b.x0, b.x1, b.z0, b.z1, r)) return false;
  // Only the marked glide corridor crosses this gap after Puff helps. Normal
  // gameplay starts its scripted hop at the lip; there is no aerial steering.
  if (z > CANOPY_GLIDE.from.z + 1.1 - r && z < CANOPY_GLIDE.to.z - 1.1 + r && x < -26 && Math.abs(x - CANOPY_GLIDE.from.x) > 1.5 - r) return false;
  for (const gate of CLOUD_ROUTE_GATES) if (!g.cleared?.includes(gate.zone)
    && nearCut(x, z, gate.x - gate.half, gate.x + gate.half, gate.z - .3, gate.z + .3, r)) return false;
  for (const s of CLOUD_SOLIDS) {
    if (s.kind === "circle" && Math.hypot(x - s.x, z - s.z) < s.r + r) return false;
    if (s.kind === "box") {
      const dx = x - s.x, dz = z - s.z, c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
      if (Math.abs(dx * c - dz * sn) < s.hx + r && Math.abs(dx * sn + dz * c) < s.hz + r) return false;
    }
  }
  return true;
}
const smooth = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };
export function cloudY(x: number, z: number): number {
  // The lift corridor and the beacon summit rise; the towers beside them do not.
  const summit = Math.abs(x) < 14;
  if (summit && z >= OBSERVATORY.lift.z + 5) return BEACON.y;
  if (summit && z >= OBSERVATORY.lift.z - 1) return OBSERVATORY.y + smooth((z - (OBSERVATORY.lift.z - 1)) / 6) * 15;
  if (z < 14) return .8;
  const coast = .8 + smooth((z - 14) / 144) * 3.2
    + smooth(1 - Math.hypot(x + 34, z - 100) / 15) * 5
    + smooth(1 - Math.hypot(x - 25, z - 151) / 12) * 5;
  if (z <= 204) return coast;
  if (z <= 279) return 4 + smooth((z - 204) / 62) * 7;
  if (z >= 400) return OBSERVATORY.y;
  // The forest floor rises onto two levels via long, gentle ramps. The final
  // eastbound walkway descends two metres to the shared approach.
  if (x < 0) return 11 + smooth((z - 289) / 12) * 2 + smooth((z - 314) / 22) * 5
    + smooth((z - 340) / 12) * 6 - smooth((z - 380) / 20) * 2;
  // The grotto floor dips 1.5 m below the plateau through the chambers, then
  // the exit passage climbs to observatory height.
  const climb = smooth((z - 384) / 16);
  return 11 - smooth((z - 279) / 8) * 1.5 * (1 - climb) + climb * 11;
}
export const CLOUD_SOLIDS: readonly SolidShape[] = [
  ...COAST_ROCKS.flatMap(([x,z]) => [{ kind: "circle" as const, x, z, r: 2.2 }, { kind: "circle" as const, x: x + 1.8, z: z + .2, r: 1.3 }]),
  { kind: "circle", x: HOLLOW.fire.x, z: HOLLOW.fire.z, r: .65 },
  { kind: "box", x: -25, z: 61, hx: 1, hz: 4.5, yaw: -.4 },
  { kind: "box", x: -19, z: 194, hx: 1.1, hz: .45, yaw: 0 },
  { kind: "box", x: -7, z: 201.5, hx: .7, hz: .5, yaw: 0 },
];
export const cloudSolids = () => CLOUD_SOLIDS;
export const CLOUD_OBSTACLE_PLACE = {
  coastWindmill: { x: -35, z: 65, face: { x: -38, z: 65 } },
  coastCrate: { x: 37, z: 118, face: { x: 40, z: 120 } },
  canopyVine: { x: -34, z: 309, face: { x: -35, z: 312 } },
  canopyGlide: { ...CANOPY_GLIDE.from, face: { ...CANOPY_GLIDE.to } },
  canopyGust: { x: -58, z: 336, face: { x: -61, z: 337.5 } },
  grottoRaft: { x: 52, z: 318.5, face: { x: 52, z: 321 } },
  grottoBoiler: { x: 40, z: 357, face: { x: 37.5, z: 360 } },
  obsLeafy: { x: -20, z: 413, face: { x: -23, z: 413 } },
  obsBubbo: { x: 20, z: 413, face: { x: 23, z: 413 } },
  obsPuff: { x: -24, z: 427, face: { x: -24, z: 431 } },
  obsEmber: { x: 24, z: 427, face: { x: 24, z: 431 } },
};
export const CLOUD_PUZZLE_RULES: Record<CloudPuzzleId, { friend: CompanionId; need: AbilityId; command: PhraseId; noun: string; result: Text }> = {
  coastWindmill: { friend: "puff", need: "fly", command: "cmdBlow", noun: "the windmill crane", result: { en: "The windmill turns! The crane lowers a plank to the sea cave.", ja: "風車が回って、洞窟への橋が下りた！" } },
  coastCrate: { friend: "leafy", need: "grow", command: "cmdPull", noun: "the crate", result: { en: "The crate holds the plate! The side cove is open.", ja: "箱がスイッチに乗って、入り江が開いた！" } },
  canopyVine: { friend: "leafy", need: "grow", command: "cmdPull", noun: "the vine bridge", result: { en: "The vines swing the bridge into place!", ja: "つるが橋を引き寄せた！" } },
  canopyGlide: { friend: "puff", need: "fly", command: "cmdFly", noun: "the glide pad", result: { en: "Puff carries you to the other marked pad!", ja: "パフが向こうの目印まで運んでくれた！" } },
  canopyGust: { friend: "puff", need: "fly", command: "cmdBlow", noun: "the gust lane", result: { en: "The gust stops! The branch chest is within reach.", ja: "強い風が止まった！枝の宝箱へ進めるよ。" } },
  grottoRaft: { friend: "bubbo", need: "swim", command: "cmdSplash", noun: "the raft basin", result: { en: "The basin fills! The raft floats across the pool.", ja: "水がたまって、いかだが浮かんだ！" } },
  grottoBoiler: { friend: "ember", need: "fire", command: "cmdBurn", noun: "the old boiler", result: { en: "Steam lifts the gate! The upper tunnel is open.", ja: "蒸気で門が上がった！奥の道へ進もう。" } },
  obsLeafy: { friend: "leafy", need: "grow", command: "cmdPull", noun: "the observatory lever", result: { en: "The lever turns the gears! Leafy's dial lamp lights up.", ja: "レバーで歯車が動いた！リーフィのランプがついた。" } },
  obsBubbo: { friend: "bubbo", need: "swim", command: "cmdSplash", noun: "the observatory water wheel", result: { en: "The water wheel spins! Bubbo's dial lamp lights up.", ja: "水車が回った！バボのランプがついた。" } },
  obsPuff: { friend: "puff", need: "fly", command: "cmdBlow", noun: "the observatory turbine", result: { en: "The turbine spins! Puff's dial lamp lights up.", ja: "風車が回った！パフのランプがついた。" } },
  obsEmber: { friend: "ember", need: "fire", command: "cmdBurn", noun: "the observatory steam valve", result: { en: "Steam opens the valve! Ember's dial lamp lights up.", ja: "蒸気で弁が開いた！エンバーのランプがついた。" } },
};
export const CLOUD_ENEMY_SPAWNS: Array<Vec2 & { zone: CloudArea; kind: CloudEnemyKind; replaces?: "stormCrab" | "raiderDrone" }> = [
  { zone: "stormbreakCoast", kind: "stormCrab", x: 3, z: 27 },
  { zone: "stormbreakCoast", kind: "windSprite", x: 5, z: 30 },
  { zone: "stormbreakCoast", kind: "raiderShooter", replaces: "stormCrab", x: -30, z: 67 },
  { zone: "stormbreakCoast", kind: "windSprite", x: -21, z: 69 },
  { zone: "stormbreakCoast", kind: "stormCrab", x: 24, z: 110 },
  { zone: "stormbreakCoast", kind: "windSprite", x: 31, z: 116 },
  { zone: "windfallJunction", kind: "windSprite", x: -3, z: 268 },
  { zone: "windfallJunction", kind: "windSprite", x: 4, z: 271 },
  { zone: "windfallJunction", kind: "windSprite", x: 0, z: 275 },
  ...([-1, 1] as const).flatMap(side => [286, 294, 303].flatMap((z, i) => [
    { zone: side < 0 ? "skyrootCanopy" as const : "thunderGrotto" as const, kind: side < 0 ? "windSprite" as const : "stormCrab" as const, x: side * 17, z },
    { zone: side < 0 ? "skyrootCanopy" as const : "thunderGrotto" as const, kind: side < 0 ? (i === 1 ? "raiderShooter" as const : "raiderDrone" as const) : "thunderBeetle" as const, replaces: side < 0 && i === 1 ? "raiderDrone" as const : undefined, x: side * 24, z: z + (i === 2 ? 1 : .5) },
  ].map((enemy, n) => side < 0 ? { ...enemy, x: [-28, -33, -47, -53, -46, -52][i * 2 + n], z: [296, 300, 330, 334, 375, 379][i * 2 + n] }
    // Grotto pairs: entry chamber, lake (south shore), machinery chamber.
    : { ...enemy, x: [25, 32, 47, 57, 36, 45][i * 2 + n], z: [296, 301, 315, 317, 349, 354][i * 2 + n] }))),
  { zone: "ancientObservatory", kind: "windSprite", x: -18, z: 417 },
  { zone: "ancientObservatory", kind: "raiderShooter", replaces: "raiderDrone", x: 18, z: 411 },
  { zone: "ancientObservatory", kind: "thunderBeetle", x: -4, z: 418 },
  { zone: "ancientObservatory", kind: "windSprite", x: 5, z: 421 },
];
export const CLOUD_CHESTS = [
  { id: "cloudSeaChest", x: -50, z: 71, yaw: .5, coins: 20, amber: 0, puzzle: "coastWindmill" as const },
  { id: "cloudCoveChest", x: 48, z: 130, yaw: -.5, coins: 20, amber: 1, puzzle: "coastCrate" as const },
  { id: "cloudJunctionChest", x: -23, z: 268, yaw: -.4, coins: 20, amber: 0 },
  { id: "cloudCanopyChest", x: -73, z: 341, yaw: .4, coins: 30, amber: 1, puzzle: "canopyGust" as const },
  { id: "cloudCrystalChest", x: 75, z: 322, yaw: -1.2, coins: 30, amber: 1 },
];
export const CLOUD_PICKUPS = [
  { id: "kikoBag", kind: "bag" as const, x: -48, z: 70 },
  { id: "junctionWood1", kind: "firewood" as const, x: -5, z: 268 },
  { id: "junctionWood2", kind: "firewood" as const, x: -7, z: 275 },
  { id: "junctionWood3", kind: "firewood" as const, x: 6, z: 276 },
  { id: "canopyMouthMoss", kind: "moss" as const, x: -18, z: 285 },
  { id: "canopyMoss", kind: "moss" as const, x: -49, z: 333 },
  { id: "grottoMoss", kind: "moss" as const, x: 45, z: 314 },
  { id: "canopyWood", kind: "firewood" as const, x: -34, z: 299 },
  { id: "grottoWood", kind: "firewood" as const, x: 44, z: 349 },
];
export const CLOUD_GUSTS = [{ x: 6, z: 30, w: 18, d: 3, dx: 1, dz: .2 }, { x: -24, z: 65, w: 18, d: 3, dx: -1, dz: .12 }];
export function cloudWindAt(x: number, z: number, solved: readonly string[] = []): Vec2 {
  if (!solved.includes("canopyGust") && x > -64 && x < -58 && z > 334 && z < 342) return { x: 2.4, z: 0 };
  const g = CLOUD_GUSTS.find(g => Math.abs(x - g.x) < g.w / 2 && Math.abs(z - g.z) < g.d / 2);
  return g ? { x: g.dx * 1.8, z: g.dz * 1.8 } : { x: 0, z: 0 };
}
/** Save projection never places the player beyond a closed story gate. */
export function projectCloudPosition(p: Vec2, g: CloudGates): Vec2 {
  return cloudNearestWalkable(p.x, p.z, .35, g);
}

/** The nearest walkable point on the island's .5 m lattice. Searches square
 * rings outward from the point (the island is too large to scan whole on a
 * dismount or a knock-out) and breaks ties as a full scan would: lower z,
 * then lower x. */
export function cloudNearestWalkable(x: number, z: number, r: number, g: CloudGates): Vec2 {
  if (cloudWalkable(x, z, g, r)) return { x, z };
  if (!Number.isFinite(x) || !Number.isFinite(z)) return { ...CLOUD_DOCK.spawn };
  const b = CLOUD_BOUNDS, clampTo = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const cx = clampTo(Math.round(x * 2) / 2, b.x0, b.x1), cz = clampTo(Math.round(z * 2) / 2, b.z0, b.z1);
  const span = Math.ceil(Math.max(b.x1 - b.x0, b.z1 - b.z0) * 2);
  let best: Vec2 | null = null, distance = Infinity;
  const consider = (px: number, pz: number) => {
    if (px < b.x0 || px > b.x1 || pz < b.z0 || pz > b.z1 || !cloudWalkable(px, pz, g, r)) return;
    const d = Math.hypot(px - x, pz - z);
    if (d < distance - 1e-9 || (Math.abs(d - distance) <= 1e-9 && best && (pz < best.z || (pz === best.z && px < best.x)))) {
      best = { x: px, z: pz }; distance = d;
    }
  };
  for (let k = 0; k <= span; k++) {
    // Nothing on this ring can be nearer than k lattice steps minus the offset to the centre.
    if (k * .5 - .36 > distance) break;
    if (k === 0) { consider(cx, cz); continue; }
    for (let i = -k; i <= k; i++) {
      consider(cx + i * .5, cz - k * .5); consider(cx + i * .5, cz + k * .5);
      if (i > -k && i < k) { consider(cx - k * .5, cz + i * .5); consider(cx + k * .5, cz + i * .5); }
    }
  }
  return best ?? { ...CLOUD_DOCK.spawn };
}

/** Substeps prevent tunnelling through thin gates; axis sliding matches the
 * home world's movement without importing its collision dispatch. */
export function cloudMove(x0: number, z0: number, x1: number, z1: number, r: number, g: CloudGates, out: Vec2 = { x: x0, z: z0 }): Vec2 {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / .18));
  const dx = (x1 - x0) / n, dz = (z1 - z0) / n;
  let x = x0, z = z0;
  for (let i = 0; i < n; i++) {
    if (cloudWalkable(x + dx, z + dz, g, r)) { x += dx; z += dz; }
    else {
      if (cloudWalkable(x + dx, z, g, r)) x += dx;
      if (cloudWalkable(x, z + dz, g, r)) z += dz;
    }
  }
  out.x = x; out.z = z;
  return out;
}
