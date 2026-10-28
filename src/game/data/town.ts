import type { ServiceId } from "../world/lowland";

/** Port Town's keepers: one per service, each with a look (3D model and portrait) and a voice. */
export type NpcId = "shopkeeper" | "cook" | "trainer" | "innkeeper" | "harbor";

export interface NpcDef {
  id: NpcId;
  name: string;
  service: ServiceId;
  skin: string;
  hair: string;
  shirt: string;
  apron?: string;
  hat: "none" | "chef" | "band" | "captain" | "scarf";
  hatColor: string;
  voice: { pitch: number; rate: number };
}

export const NPCS: Record<NpcId, NpcDef> = {
  shopkeeper: { id: "shopkeeper", name: "Mr. Bean", service: "market", skin: "#e9b58c", hair: "#5a3a22", shirt: "#e8553f", apron: "#f6e9c8", hat: "scarf", hatColor: "#3f9a52", voice: { pitch: 0.95, rate: 0.9 } },
  cook: { id: "cook", name: "Chef Coco", service: "kitchen", skin: "#c88d62", hair: "#2a1c14", shirt: "#ffffff", apron: "#ff9db8", hat: "chef", hatColor: "#ffffff", voice: { pitch: 1.25, rate: 0.92 } },
  trainer: { id: "trainer", name: "Coach Rex", service: "trainer", skin: "#f0c7a0", hair: "#c2502c", shirt: "#3f7fd0", hat: "band", hatColor: "#ffd23f", voice: { pitch: 0.85, rate: 0.95 } },
  innkeeper: { id: "innkeeper", name: "Mrs. Shell", service: "inn", skin: "#f3cfb0", hair: "#9a9a9a", shirt: "#8f6ad0", apron: "#f3e3ff", hat: "none", hatColor: "#000000", voice: { pitch: 1.15, rate: 0.85 } },
  harbor: { id: "harbor", name: "Captain Gull", service: "harbor", skin: "#d9a27c", hair: "#efefef", shirt: "#26467a", hat: "captain", hatColor: "#ffffff", voice: { pitch: 0.75, rate: 0.85 } }
};

export const NPC_OF: Record<ServiceId, NpcId> = { market: "shopkeeper", kitchen: "cook", trainer: "trainer", inn: "innkeeper", harbor: "harbor" };
