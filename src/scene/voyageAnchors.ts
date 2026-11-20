import { Vector3 } from "three";
import type { CompanionId } from "../game/data/combat";
import { anchors } from "./anchors";

// The smile in bubboParts, just in front of the body.
export const BUBBO_MOUTH: [number, number, number] = [0, .42, .52];
export const bubboEmitter = { mouth: new Vector3(), valid: false };

/** Sampled after the rig and its animated parts have been posed. */
export function voyageEmitter(friend: CompanionId): Vector3 | null {
  switch (friend) {
    case "ember": return anchors.emberMouthValid ? anchors.emberMouth : null;
    case "leafy": return anchors.leafyHandRValid ? anchors.leafyHandR : null;
    case "bubbo": return bubboEmitter.valid ? bubboEmitter.mouth : null;
    case "puff": return anchors.puffBeakValid ? anchors.puffBeak : null;
  }
}
