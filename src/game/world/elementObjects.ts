import type { Layer } from "./region";
import type { StageId } from "./lowland";
import type { SolidShape } from "./island";

export type ElementTag = "flammable" | "grabbable" | "windy" | "liftable" | "breakable" | "heavy" | "anchored" | "trigger";
export type ElementEvent = "burn" | "grab" | "wind" | "lift" | "bomb";
export interface ElementObject {
  id: string;
  world: "home" | "cloud";
  /** Traversal layer (default ground): only walkers on it can affect the object. */
  layer?: Layer;
  x: number; z: number; r: number;
  tags: ElementTag[];
  on?: Partial<Record<ElementEvent, { becomes: string; secret?: string }>>;
}

export const SECRET_IDS = ["emberThicket", "bubboLedgeKey", "leafyStatues", "puffLeaves", "comboCrateLift", "comboFurnace", "groveDryReeds", "canopyDryReeds"] as const;
export type SecretId = (typeof SECRET_IDS)[number];
/** Secrets on other traversal layers (the cave's root seal): saved with the
 * ground ones, but their blockers live in their layer, not the ground solids. */
export const CAVE_SECRET_IDS = ["caveRootSeal"] as const;
export type CaveSecretId = (typeof CAVE_SECRET_IDS)[number];
export const ALL_SECRET_IDS: readonly (SecretId | CaveSecretId)[] = [...SECRET_IDS, ...CAVE_SECRET_IDS];

/**
 * Treasure hidden under a pile (2026-11-16): one compact, round pile centred on
 * its chest. Leaves burn (Ember) or blow away (Puff); sticks only burn. The pile
 * is both the elemental target and the solid; once cleared the chest is reached.
 */
export type PileKind = "leaves" | "sticks";
export const PILES: Partial<Record<SecretId, PileKind>> = { puffLeaves: "leaves", emberThicket: "sticks", groveDryReeds: "sticks", canopyDryReeds: "sticks" };
/** A pile's radius on the ground (it covers the chest's whole footprint) and its height. */
export const PILE = { r: 1.15, h: 1.05 };
const pileOver = (chest: { x: number; z: number }): SolidShape => ({ kind: "circle", x: chest.x, z: chest.z, r: PILE.r });

/** Optional pockets on existing land. Closed footprints enclose the reward so
 * it cannot be reached by walking around a thin door; a pile covers its chest
 * on all sides. No terrain is added. */
export const SECRET_SITES: Record<SecretId, {
  stage: StageId;
  blocker: SolidShape;
  solidTarget?: boolean;
  chest: { x: number; z: number };
  approach: { x: number; z: number };
}> = {
  emberThicket: { stage: "forest1", blocker: pileOver({ x: 89, z: -176 }), chest: { x: 89, z: -176 }, approach: { x: 89, z: -173.2 } },
  bubboLedgeKey: { stage: "grove", blocker: { kind: "box", x: 60, z: -214, hx: 1.7, hz: 2, yaw: 0 }, chest: { x: 60, z: -214 }, approach: { x: 54.5, z: -218 } },
  leafyStatues: { stage: "causeway", blocker: { kind: "box", x: 69, z: -256, hx: 2, hz: 2, yaw: 0 }, chest: { x: 69, z: -257 }, approach: { x: 66, z: -249.5 } },
  puffLeaves: { stage: "canopy", blocker: pileOver({ x: 112, z: -212.5 }), chest: { x: 112, z: -212.5 }, approach: { x: 111.6, z: -209.7 } },
  comboCrateLift: { stage: "grove", blocker: { kind: "box", x: 42, z: -234, hx: 1.6, hz: 1.8, yaw: 0 }, chest: { x: 42, z: -233.5 }, approach: { x: 43, z: -231 } },
  comboFurnace: { stage: "coast", blocker: { kind: "box", x: 83, z: -276, hx: 1.8, hz: 1.6, yaw: 0 }, chest: { x: 83, z: -276.8 }, approach: { x: 77.4, z: -274 } },
  groveDryReeds: { stage: "grove", blocker: pileOver({ x: 66.2, z: -221 }), chest: { x: 66.2, z: -221 }, approach: { x: 63.4, z: -221 } },
  canopyDryReeds: { stage: "canopy", blocker: pileOver({ x: 116.2, z: -212.6 }), chest: { x: 116.2, z: -212.6 }, approach: { x: 116.2, z: -209.7 } },
};

/** Layer content (world/cave.ts) appends its own objects on import. */
export const ELEMENT_OBJECTS: ElementObject[] = [
  { id: "emberThicket", world: "home", x: 89, z: -176, r: PILE.r + .05, tags: ["flammable"], on: { burn: { becomes: "burning", secret: "emberThicket" } } },
  { id: "bubboLedgeKey", world: "home", x: 56.8, z: -218, r: .6, tags: ["liftable"], on: { lift: { becomes: "slotted", secret: "bubboLedgeKey" } } },
  { id: "leafyStatues", world: "home", x: 66, z: -252, r: .7, tags: ["grabbable", "heavy"], on: { grab: { becomes: "pulled", secret: "leafyStatues" } } },
  { id: "leafyStatuesEast", world: "home", x: 72, z: -252, r: .7, tags: ["grabbable", "heavy"], on: { grab: { becomes: "pulled", secret: "leafyStatues" } } },
  { id: "puffLeaves", world: "home", x: 112, z: -212.5, r: PILE.r + .05, tags: ["windy", "flammable"], on: { wind: { becomes: "cleared", secret: "puffLeaves" }, burn: { becomes: "burning", secret: "puffLeaves" } } },
  { id: "comboCrateLift", world: "home", x: 43, z: -229, r: .7, tags: ["grabbable", "liftable"], on: { grab: { becomes: "onPad" }, lift: { becomes: "raised", secret: "comboCrateLift" } } },
  { id: "comboFurnace", world: "home", x: 79.8, z: -274, r: .8, tags: ["flammable", "windy", "anchored"], on: { burn: { becomes: "lit" }, wind: { becomes: "open", secret: "comboFurnace" } } },
  { id: "groveDryReeds", world: "home", x: 66.2, z: -221, r: PILE.r + .05, tags: ["flammable"], on: { burn: { becomes: "burning", secret: "groveDryReeds" } } },
  { id: "canopyDryReeds", world: "home", x: 116.2, z: -212.6, r: PILE.r + .05, tags: ["flammable"], on: { burn: { becomes: "burning", secret: "canopyDryReeds" } } },
];

export const EVENT_TAG: Record<ElementEvent, ElementTag> = { burn: "flammable", grab: "grabbable", wind: "windy", lift: "liftable", bomb: "breakable" };
export function secretOf(o: ElementObject): SecretId {
  return o.id === "leafyStatuesEast" ? "leafyStatues" : o.id as SecretId;
}

export function secretSolids(secrets: readonly string[] = []): SolidShape[] {
  return SECRET_IDS.flatMap(id => {
    const site = SECRET_SITES[id], o = ELEMENT_OBJECTS.find(o => o.id === id)!;
    if (secrets.includes(id)) return [{ kind: "box", ...site.chest, hx: .5, hz: .36, yaw: 0 } as SolidShape];
    return site.solidTarget ? [site.blocker, { kind: "circle", x: o.x, z: o.z, r: o.r } as SolidShape] : [site.blocker];
  });
}
