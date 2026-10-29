export const FAMILY = {
  tala: { name: "Tala", voice: { pitch: 1.05, rate: .88 }, color: "#728659", hair: "#34251e" },
  bo: { name: "Grandpa Bo", voice: { pitch: .7, rate: .8 }, color: "#bd8654", hair: "#ded6bf" },
  kiko: { name: "Kiko", voice: { pitch: 1.4, rate: .95 }, color: "#dfad4b", hair: "#493124" },
};
export type FamilyId = keyof typeof FAMILY;
