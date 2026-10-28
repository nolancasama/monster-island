import { useMemo, useState } from "react";
import { setGame, useGame } from "../game/store";
import { continueGame, keepExploring, newGame, startAct2FromTitle, toTitle } from "../game/flow/story";
import { readSave } from "../game/logic/save";
import { MONSTERS, MONSTER_ORDER } from "../game/data/monsters";
import { PHRASES } from "../game/logic/english";
import { Icon } from "./icons";
import { Portrait } from "./Portraits";
import { Ja } from "./Talk";

export function TitleScreen() {
  const screen = useGame((s) => s.screen);
  const hasSave = useGame((s) => s.hasSave);
  const [confirm, setConfirm] = useState(false);
  // A finished adventure gets a clear way into the new chapter.
  const save = useMemo(() => (screen === "title" && hasSave ? readSave() : null), [screen, hasSave]);
  const act2Ready = Boolean(save && save.progress.endings >= 3 && !save.progress.act2.started);
  if (screen !== "title") return null;
  return (
    <div className="title-screen ui" data-testid="title">
      <div className="title-card">
        <div className="title-monsters" aria-hidden="true">
          <Portrait id="leafy" size={86} />
          <Portrait id="bubbo" size={96} />
          <Portrait id="puff" size={72} silhouette />
          <Portrait id="ember" size={72} silhouette />
        </div>
        <h1 className="logo">
          <span>MONSTER</span> <span>ISLAND</span>
        </h1>
        <p className="tagline">
          Find monsters. Make friends.
          <Ja>モンスターを さがして ともだちに なろう</Ja>
        </p>
        {hasSave ? (
          <div className="title-buttons">
            {act2Ready && (
              <button className="primary big act2" onClick={() => void startAct2FromTitle()} data-testid="btn-act2">
                <span className="new-badge">NEW!</span> Act 2: The Hunt for Lumo <Ja>だい2しょう: ルモを さがせ</Ja>
              </button>
            )}
            <button className={act2Ready ? "secondary" : "primary big"} onClick={() => void continueGame()} data-testid="btn-continue">
              <Icon id="play" size={24} /> Continue <Ja>つづきから</Ja>
            </button>
            {confirm ? (
              <button className="secondary danger" onClick={() => void newGame()} data-testid="btn-new-confirm">
                Start over? <Ja>さいしょから やりなおす?</Ja>
              </button>
            ) : (
              <button className="secondary" onClick={() => setConfirm(true)} data-testid="btn-new">
                New game <Ja>さいしょから</Ja>
              </button>
            )}
          </div>
        ) : (
          <div className="title-buttons">
            <button className="primary big" onClick={() => void newGame()} data-testid="btn-start">
              <Icon id="play" size={24} /> Start <Ja>はじめる</Ja>
            </button>
          </div>
        )}
        <button className="link" onClick={() => setGame({ settingsOpen: true })} data-testid="title-settings">
          <Icon id="gear" size={18} /> Settings
        </button>
      </div>
    </div>
  );
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** The full results card: shown only at the final Sanctuary ending. */
export function ResultsScreen() {
  const screen = useGame((s) => s.screen);
  const progress = useGame((s) => s.progress);
  const seconds = useGame((s) => s.seconds);
  if (screen !== "results") return null;
  const friends = MONSTER_ORDER.filter((id) => progress.monsters[id].friend);
  return (
    <div className="results ui" data-testid="results">
      <div className="results-card panel results-final">
        <h1>The End <Ja>モンスターの ともだち!</Ja></h1>
        <div className="results-friends">
          {MONSTER_ORDER.map((id) => {
            const f = friends.includes(id);
            const def = MONSTERS[id];
            const record = progress.monsters[id];
            return (
              <div key={id} className={`r-friend ${f ? "on" : ""}`} data-testid={`results-page-${id}`}>
                <Portrait id={id} size={72} silhouette={!f} />
                <span>{f ? def.name : "???"}</span>
                {record.discovered && (
                  <div className="r-page-lines">
                    <span>It's {def.color}.</span>
                    <span>{record.described.size ? `It's ${def.size}.` : "Size: ???"}</span>
                    {def.part && <span>{record.described.part ? `It has ${def.part === "tail" ? "a tail" : "wings"}.` : "It has ???"}</span>}
                  </div>
                )}
                {f && <span className="r-page-friend"><Icon id="heart" size={16} /> Friend!</span>}
              </div>
            );
          })}
        </div>
        <h2>
          English you used <Ja>つかった えいご</Ja>
        </h2>
        <ul className="results-said" data-testid="results-said">
          {progress.said.map((id) => (
            <li key={id}>{PHRASES[id].en}</li>
          ))}
        </ul>
        <p className="results-time">
          Time: {fmt(seconds)} <Ja>じかん</Ja>
        </p>
        <div className="results-buttons">
          <button className="primary big" onClick={() => keepExploring()} data-testid="btn-explore">
            Keep exploring <Ja>たんけんを つづける</Ja>
          </button>
          <button className="secondary" onClick={() => toTitle()} data-testid="btn-title">
            Title <Ja>タイトルへ</Ja>
          </button>
        </div>
      </div>
    </div>
  );
}
