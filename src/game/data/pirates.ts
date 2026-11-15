import type { KeeperLook } from "./town";

/**
 * The pirate crew of the voyage (docs/PIRATE_VOYAGE.md §1): funny, never scary.
 * They share the keepers' body and portrait; pirate hats, beards and patches are theirs.
 */
export type PirateId = "redbeard" | "pepper" | "bill" | "finn" | "tom" | "sam" | "max";
export const PIRATE_IDS: PirateId[] = ["redbeard", "pepper", "bill", "finn", "tom", "sam", "max"];

export interface PirateDef extends KeeperLook { id: PirateId }

const def = (id: PirateId, look: Omit<PirateDef, "id">): PirateDef => ({ id, ...look });

export const PIRATES: Record<PirateId, PirateDef> = {
  redbeard: def("redbeard", { name: "Captain Redbeard", skin: "#e2a77e", hair: "#b8452a", beard: "#c5502e", shirt: "#b8322a", apron: "#f2d36b", hat: "tricorn", hatColor: "#2a2a33", patch: true, voice: { pitch: 0.7, rate: 0.86 } }),
  pepper: def("pepper", { name: "Cook Pepper", skin: "#c88d62", hair: "#2a1c14", shirt: "#ffffff", apron: "#e8553f", hat: "chef", hatColor: "#ffffff", voice: { pitch: 1.15, rate: 0.95 } }),
  bill: def("bill", { name: "Bosun Bill", skin: "#a8724e", hair: "#1e1612", beard: "#2a1c14", shirt: "#3c5a8a", hat: "bandana", hatColor: "#2f6fc0", voice: { pitch: 0.8, rate: 0.88 } }),
  finn: def("finn", { name: "Fisher Finn", skin: "#f0c7a0", hair: "#d8a040", shirt: "#ffd23f", hat: "scarf", hatColor: "#3f9a52", voice: { pitch: 1.05, rate: 0.92 } }),
  tom: def("tom", { name: "Tom", skin: "#e9b58c", hair: "#5a3a22", shirt: "#e8e8f0", apron: "#d94b4b", hat: "bandana", hatColor: "#d94b4b", voice: { pitch: 0.95, rate: 0.95 } }),
  sam: def("sam", { name: "Sam", skin: "#c58b5c", hair: "#1e1612", shirt: "#f0e6d0", apron: "#3c7fb8", hat: "bandana", hatColor: "#ffd23f", patch: true, voice: { pitch: 1.1, rate: 0.95 } }),
  max: def("max", { name: "Max", skin: "#f3cfb0", hair: "#9a5a2a", shirt: "#e8f0e0", apron: "#8d5cc9", hat: "bandana", hatColor: "#8d5cc9", voice: { pitch: 0.9, rate: 0.9 } }),
};
