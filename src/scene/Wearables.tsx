import { useEffect, useMemo } from "react";
import { useGame } from "../game/store";
import type { Wearer } from "../game/data/wearables";
import { outfitGeometry } from "./models/wearables";
import { smoothMat } from "./materials";

/** What a character wears from Ms. Button's shop: one merged mesh, rebuilt only when the outfit changes. */
export function WornItems({ who }: { who: Wearer }) {
  const head = useGame((s) => s.progress.act2.wardrobe.worn[who]?.head);
  const face = useGame((s) => s.progress.act2.wardrobe.worn[who]?.face);
  const geometry = useMemo(() => outfitGeometry(who, { head, face }), [who, head, face]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  return geometry ? <mesh geometry={geometry} material={smoothMat} /> : null;
}
