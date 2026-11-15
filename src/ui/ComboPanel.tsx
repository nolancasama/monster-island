import { setGame, useGame } from "../game/store";
import { COMPANION_IDS } from "../game/data/combat";
import { COMBOS } from "../game/data/combos";
import { learnComboScene } from "../game/flow/trainer";
import { Icon } from "./icons";
import { Portrait } from "./Portraits";
import { Ja } from "./Talk";
import "./Clothes.css";

/** Coach Rex's combos: one row per friend, Learn (1 amber) or Learned! (docs/PORT_TOWN_REVAMP.md §4.3). */
export function ComboPanel() {
  const panel = useGame((s) => s.panel);
  const progress = useGame((s) => s.progress);
  if (panel !== "combos") return null;
  const amber = progress.act2.items.amber ?? 0;
  const friends = COMPANION_IDS.filter((id) => progress.monsters[id].friend);
  return (
    <div className="modal-back ui" data-testid="combos">
      <div className="modal panel trainer-panel combo-panel">
        <h2>
          Monster Combos <Ja>モンスターの コンボ</Ja>
        </h2>
        <p className="shop-coins" title="amber">
          <Icon id="amber" size={24} /> {amber}
        </p>
        <div className="trainer-rows">
          {friends.map((id) => {
            const c = COMBOS[id];
            const known = progress.act2.upgrades.includes(id);
            return (
              <div key={id} className={`trainer-row combo-row${known ? " known" : ""}`} style={{ borderColor: c.color }} data-testid={`combo-${id}`}>
                <Portrait id={id} size={54} />
                <div className="combo-text">
                  <b>
                    {c.name.en} <Ja>{c.name.ja}</Ja>
                  </b>
                  <span>{c.rule.en.replace(/^\S+ combo! /, "")}</span>
                  <Ja>{(c.rule.ja ?? "").replace(/^.+?コンボ! /, "")}</Ja>
                  <span className="combo-extra">
                    {c.extra.en} <Ja>{c.extra.ja}</Ja>
                  </span>
                </div>
                {known ? (
                  <span className="combo-learned" data-testid={`combo-learned-${id}`}>
                    Learned! <Ja>おぼえた!</Ja>
                  </span>
                ) : (
                  <button className="primary combo-learn" onClick={() => void learnComboScene(id)} data-testid={`learn-${id}`}>
                    Learn
                    <span className="combo-cost">
                      {c.amber} <Icon id="amber" size={18} />
                    </span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <button className="secondary" onClick={() => setGame({ panel: null })} data-testid="combos-close">
          Thank you! <Ja>おわる</Ja>
        </button>
      </div>
    </div>
  );
}
