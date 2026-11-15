import { useEffect, useState } from "react";
import { setGame, useGame } from "../game/store";
import { MONSTERS } from "../game/data/monsters";
import { STAT_BLURB, WEARABLES, WEARABLE_IDS, WEARERS, type WearableId, type Wearer } from "../game/data/wearables";
import { canWear, wornBy } from "../game/logic/wardrobe";
import { askWhoWears, buyClothes, sayItem, takeOffClothes, wearClothes } from "../game/flow/clothes";
import { Icon } from "./icons";
import { Portrait, SelfPortrait } from "./Portraits";
import { Ja } from "./Talk";
import { WearIcon } from "./wearIcons";
import "./Clothes.css";

function Face({ who, size }: { who: Wearer; size: number }) {
  return who === "player" ? <SelfPortrait size={size} /> : <Portrait id={who} size={size} />;
}

const ONLY: Record<"player" | "friends", { en: string; ja: string }> = {
  player: { en: "Only for you", ja: "きみ だけ" },
  friends: { en: "Only for friends", ja: "ともだち だけ" },
};

/** Ms. Button's shop: every item as a card; buying asks who will wear it (docs/PORT_TOWN_REVAMP.md §3.4). */
export function ClothesPanel() {
  const panel = useGame((s) => s.panel);
  const progress = useGame((s) => s.progress);
  const [picking, setPicking] = useState<WearableId | null>(null);
  useEffect(() => {
    if (panel !== "clothes") setPicking(null);
  }, [panel]);
  if (panel !== "clothes") return null;
  const owned = progress.act2.wardrobe.owned;
  return (
    <div className="modal-back ui" data-testid="clothes">
      <div className="modal panel clothes-panel">
        <header className="clothes-head">
          <h2>
            Clothes Shop <Ja>ふくの おみせ</Ja>
          </h2>
          <span className="shop-coins">
            <Icon id="coin" size={24} /> {progress.act2.coins}
          </span>
          <button className="secondary clothes-close" onClick={() => setGame({ panel: null })} data-testid="clothes-close">
            Thank you! Bye! <Ja>おわる</Ja>
          </button>
        </header>
        <div className="wear-grid">
          {WEARABLE_IDS.map((id) => {
            const d = WEARABLES[id];
            const has = owned.includes(id);
            const who = has ? wornBy(progress, id) : null;
            const blurb = STAT_BLURB[d.stat ?? "none"];
            return (
              <div key={id} className={`wear-card${has ? " owned" : ""}${who ? " worn" : ""}`} data-testid={`wear-${id}`}>
                <button className="wear-look" onClick={() => sayItem(id)} aria-label={`${d.name.en}. ${d.line}`} data-testid={`wear-look-${id}`}>
                  <WearIcon id={id} size={46} />
                  {who && (
                    <span className="wear-by" title={who === "player" ? "You" : MONSTERS[who].name} data-testid={`wear-by-${id}`}>
                      <Face who={who} size={28} />
                    </span>
                  )}
                </button>
                <b className="wear-name">{d.name.en}</b>
                <Ja>{d.name.ja}</Ja>
                <span className={`wear-blurb${d.stat ? " stat" : ""}`}>
                  {blurb.en} <Ja>{blurb.ja}</Ja>
                </span>
                {d.who !== "everyone" && (
                  <span className="wear-only" title={ONLY[d.who].ja}>
                    {ONLY[d.who].en}
                  </span>
                )}
                {!has ? (
                  <button className="primary wear-buy" onClick={() => { if (buyClothes(id)) setPicking(id); }} data-testid={`wear-buy-${id}`}>
                    Buy {d.price} <Icon id="coin" size={18} />
                  </button>
                ) : (
                  <div className="wear-actions">
                    <button className="primary" onClick={() => { askWhoWears(); setPicking(id); }} data-testid={`wear-put-${id}`}>
                      Wear
                    </button>
                    {who && (
                      <button className="secondary" onClick={() => takeOffClothes(id)} data-testid={`wear-off-${id}`}>
                        Take off
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {picking && (
          <div className="wear-picker" data-testid="wear-picker">
            <div className="wear-picker-card panel">
              <WearIcon id={picking} size={64} />
              <b className="wear-picker-q">
                Who will wear it? <Ja>だれが つける?</Ja>
              </b>
              <div className="wear-who">
                {WEARERS.filter((w) => canWear(progress, picking, w)).map((w) => (
                  <button key={w} className={wornBy(progress, picking) === w ? "on" : ""} onClick={() => { wearClothes(picking, w); setPicking(null); }} data-testid={`wear-who-${w}`}>
                    <Face who={w} size={56} />
                    <span>{w === "player" ? "Me!" : MONSTERS[w].name}</span>
                  </button>
                ))}
              </div>
              <button className="secondary" onClick={() => setPicking(null)} data-testid="wear-not-now">
                Not now <Ja>あとで</Ja>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
