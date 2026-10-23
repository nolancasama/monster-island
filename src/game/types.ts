export interface Vec2 {
  x: number;
  z: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type MonsterId = "leafy" | "bubbo" | "ember" | "puff" | "lumo";
export type FoodId = "apples" | "bananas" | "fish" | "berries" | "meat";
export type ColorId = "green" | "blue" | "orange" | "purple" | "yellow";
/** Answers to "Can you ___?". `help` is not an ability: it means "the ability this obstacle needs". */
export type AbilityId = "swim" | "fly" | "jump" | "grow" | "fire";
export type ObstacleId = "fallenPalm" | "river" | "bridge" | "cliff" | "lava" | "cave" | "gateLeaf" | "gateDrop" | "gateWing" | "gateFlame";
export type SizeId = "small" | "big";
export type PartId = "wings" | "tail";

export type Bag = Partial<Record<FoodId, number>>;

export interface Text {
  en: string;
  ja?: string;
}
