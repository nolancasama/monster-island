import { PIRATE_IDS, type PirateId } from "./data/pirates";
import type { FoodId } from "./types";
import type { CargoItem, CargoState } from "./logic/voyage";
import type { CompanionId } from "./data/combat";
import type { Focus } from "./store";
import { SHIP, SPOT, holdLayerAt, setShipHoldOccupancy } from "./world/pirateShip";
import type { Grapple } from "./flow/voyageGrapple";

export type Candidate = { focus: Focus; reach: number };
/** The running free-play step (a job, a storm emergency, a raft step): it owns E, J and a tick. */
export interface Phase {
  name: string;
  candidates?(): Candidate[];
  interact?(f: Focus): void;
  /** J pressed with this friend active; true when the phase used it. */
  tool?(friend: CompanionId): boolean;
  tick?(dt: number): void;
}

/**
 * The pirate voyage's live state (docs/PIRATE_VOYAGE.md): what the scene draws and
 * the flows drive. Never saved; flows rebuild it from `act3.voyage` on load.
 * Crew, fish, cargo, fires and barrels are LOCAL to the ship (they ride with it
 * while it approaches); effects are in world coordinates.
 */
export type CrewId = PirateId | "gull";
export interface CrewSpot { x: number; z: number; yaw: number; visible: boolean; cheer: number; air: number; hold: FoodId | "fish3" | null; menace: boolean }
export type CaptureBeat = "turn" | "order" | "step" | "throw" | "landed" | "haul" | "alongside"
  | "reveal" | "encircle" | "interrogation-wide" | "monsters-wide" | "pepper-in" | "pepper-out";

export type FxKind = "bubble" | "flame" | "vine" | "gust" | "steam" | "splash" | "sparkle" | "rope";
export interface VoyageFx { id: number; kind: FxKind; x: number; y: number; z: number; tx: number; ty: number; tz: number; t0: number; life: number }

export interface Fish { id: number; boot: boolean; pool: number; speed: number; phase: number; state: "swim" | "caught" | "bucket"; t0: number; x: number; y: number; z: number; yaw: number; ax: number; ay: number; az: number }
export type Carry = { kind: "cargo"; item: CargoItem } | { kind: "food"; food: FoodId } | { kind: "dish"; food: FoodId } | null;
export interface Obstacle { id: number; kind: "rock" | "barrel"; lane: -1 | 0 | 1; z: number; hit: number }
export interface Barrel { x: number; z: number; vx: number; tied: boolean; t0: number }
export interface Fire { x: number; z: number; out: boolean; t0: number }
export interface Plank { x: number; z: number; yaw: number; state: "float" | "pulled" | "placed"; t0: number; slot: number }

/** A small on-screen meter or counter for the running job (ui/VoyageHud). */
export interface VoyageHudState { title: string; ja: string; value?: number; band?: [number, number]; count?: [number, number]; hint?: string }

const home = (): Record<CrewId, CrewSpot> => {
  const s = (p: { x: number; z: number }, yaw: number): CrewSpot => ({ x: p.x, z: p.z, yaw, visible: true, cheer: -10, air: 0, hold: null, menace: false });
  return {
    redbeard: s(SPOT.captain, 0), gull: s(SPOT.gull, 0.3), pepper: s(SPOT.cook, 0), bill: s(SPOT.bill, 0), finn: s(SPOT.finn, 0.4),
    tom: s(SPOT.crew[0], -Math.PI / 2), sam: s(SPOT.crew[1], -Math.PI / 2), max: s(SPOT.crew[2], Math.PI),
  };
};

const fresh = () => ({
  /** The ship and its crew are in the world (from the capture to the break-up). */
  active: false,
  /** Derived room view, rebuilt from the walking floor and local position. */
  inHold: false,
  /** The ship's offset from its mooring while it sails in (world units), and its bob. */
  shipOffset: { x: 0, z: 0 },
  /** The ship's heading while it sails in (scene yaw about its origin; 0 = bow south at its mooring). */
  shipYaw: 0,
  shipBob: 0,
  /** Visual roll and pitch of the whole ship (the storm, the break-up), radians. */
  shipRoll: 0,
  shipPitch: 0,
  shipSink: 0,
  /** The pirate voyage owns the sea and its weather (the old crossing does not). */
  sea: false,
  /** Water speed past the vessel: 0 becalmed, 1 sailing, 2 fast. */
  flow: 0,
  /** Distance the water has travelled (drives the waves and the wake). */
  flowDist: 0,
  /** 0 = fair, 1 = full storm. */
  storm: 0,
  /** rt.time of the last lightning flash. */
  flash: -10,
  /** Gull is on the pirate ship (not on his own boat). */
  gullAboard: false,
  /** Gull's boat is tied alongside the ship (drawn at rt.voyage's x/z). */
  boatMoored: false,
  /** The capture lines are secured (1), or have yet to be thrown (0). */
  ropes: 0,
  grapples: null as Record<"tom" | "sam" | "max", Grapple> | null,
  captureBeat: null as CaptureBeat | null,
  captureProgress: 0,
  /** Rigging between the camera and the player dissolves (off for wide shots). */
  cut: true,
  /** Sail fill 0..1: mizzen, main, fore. */
  sails: [0.12, 0.12, 0.12],
  /** Cutscene cloth opacity target. Independent of sail fill and damage. */
  cutSails: 1,
  /** The mainsail is torn (0) or sewn (1); sewing progress while it is held full. */
  sewn: 1,
  /** The mainmast's fall, 0 standing → 1 down. */
  mastFall: 0,
  /** Lifeboats rowing away, 0..1 (hidden at 0). */
  lifeboats: 0,
  crew: home(),
  /** J is held on the ship (Ember's heat, Puff's sail). */
  hold: false,
  fx: [] as VoyageFx[],
  fish: [] as Fish[],
  bucket: 0,
  cargo: { barrel: null, bag: null, bottle: null } as CargoState,
  carry: null as Carry,
  cook: {
    lit: false, heat: 0, done: 0, pot: null as FoodId | null, dish: null as FoodId | null,
    /** The order being cooked, and every order taken so far. */
    order: null as { who: CrewId; food: FoodId } | null,
    orders: [] as Array<{ who: CrewId; food: FoodId; served: boolean }>,
  },
  /** Steering: the vessel's lane (animated) and the obstacles coming at it. */
  lane: 0,
  laneVis: 0,
  obstacles: [] as Obstacle[],
  barrels: [] as Barrel[],
  fires: [] as Fire[],
  /** The fallen spar pinning a pirate (null when there is none). */
  spar: null as { x: number; z: number; lift: number } | null,
  raft: { on: false, x: 0, z: 0, built: 0, sail: 0, planks: [] as Plank[] },
  hud: null as VoyageHudState | null,
  phase: null as Phase | null,
  /** Authored root heights for friends (boarding arcs, the raft, the tow), by monster id. */
  monY: {} as Partial<Record<string, number>>,
  /** A distant island silhouette (raft stage): shown 0..1, and which side it lies (−1 left … 1 right). */
  island: 0,
  islandSide: 0,
  /** Gull's boat sailing in to Cloud Isle's dock, 0..1 (1 = tied up, the normal state). */
  boatIn: 1,
  /** The spyglass on Gull's boat: 0 lowered … 1 at the eye (narrows the lens, draws its ring). */
  spyglass: 0,
});

export const vy = fresh();

/** Put the player's floor (and view) straight on the hold or the deck, e.g. when a save loads. */
export function restoreHold(below: boolean) {
  vy.inHold = below;
  setShipHoldOccupancy(below);
}

/** Update the occupied floor and view from the two stair thresholds. */
export function updateHoldView(x: number, z: number, aboard: boolean): boolean {
  const next = aboard && holdLayerAt(x - SHIP.x, z - SHIP.z, vy.inHold);
  const changed = next !== vy.inHold;
  vy.inHold = next;
  if (changed) setShipHoldOccupancy(next);
  return changed;
}

let fxId = 1;
export function addFx(kind: FxKind, from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }, life: number, t0: number) {
  vy.fx.push({ id: fxId++, kind, x: from.x, y: from.y, z: from.z, tx: to.x, ty: to.y, tz: to.z, t0, life });
  if (vy.fx.length > 24) vy.fx.shift();
}

/** Bumped by every reset: a voyage flow still waiting from before stops (flow/voyage `until`). */
let epoch = 0;
export const voyageEpoch = () => epoch;

export function resetVoyageRt() {
  epoch++;
  setShipHoldOccupancy(false);
  Object.assign(vy, fresh());
}

export const CREW_IDS: CrewId[] = [...PIRATE_IDS, "gull"];
