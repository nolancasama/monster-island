import type { ServiceId } from "../world/lowland";

/** Port Town's keepers: one per service, each with a look (3D model and portrait) and a voice. */
export type NpcId = "shopkeeper" | "tailor" | "trainer" | "innkeeper" | "harbor";

/** How a person looks and sounds: shared by the town's keepers and the pirates. */
export interface KeeperLook {
  name: string;
  skin: string;
  hair: string;
  shirt: string;
  apron?: string;
  hat: "none" | "tophat" | "band" | "captain" | "scarf" | "tricorn" | "bandana" | "chef";
  hatColor: string;
  /** A big beard (pirates). */
  beard?: string;
  /** An eye patch (pirates). */
  patch?: boolean;
  voice: { pitch: number; rate: number };
}

export interface NpcDef extends KeeperLook {
  id: NpcId;
  service: ServiceId;
}

export const NPCS: Record<NpcId, NpcDef> = {
  shopkeeper: { id: "shopkeeper", name: "Mr. Bean", service: "market", skin: "#e9b58c", hair: "#5a3a22", shirt: "#e8553f", apron: "#f6e9c8", hat: "scarf", hatColor: "#3f9a52", voice: { pitch: 0.95, rate: 0.9 } },
  tailor: { id: "tailor", name: "Ms. Button", service: "clothes", skin: "#f6d2b8", hair: "#6b3fa0", shirt: "#ff7eb6", apron: "#fff1f8", hat: "tophat", hatColor: "#7b4fc9", voice: { pitch: 1.2, rate: 0.92 } },
  trainer: { id: "trainer", name: "Coach Rex", service: "trainer", skin: "#f0c7a0", hair: "#c2502c", shirt: "#3f7fd0", hat: "band", hatColor: "#ffd23f", voice: { pitch: 0.85, rate: 0.95 } },
  innkeeper: { id: "innkeeper", name: "Mrs. Shell", service: "inn", skin: "#f3cfb0", hair: "#9a9a9a", shirt: "#8f6ad0", apron: "#f3e3ff", hat: "none", hatColor: "#000000", voice: { pitch: 1.15, rate: 0.85 } },
  harbor: { id: "harbor", name: "Captain Gull", service: "harbor", skin: "#d9a27c", hair: "#efefef", shirt: "#26467a", hat: "captain", hatColor: "#ffffff", voice: { pitch: 0.75, rate: 0.85 } }
};

export const NPC_OF: Record<ServiceId, NpcId> = { market: "shopkeeper", clothes: "tailor", trainer: "trainer", inn: "innkeeper", harbor: "harbor" };
