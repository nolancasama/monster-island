import { useState } from "react";
import { saveSettings, setGame, useGame } from "../game/store";
import { continueGame, keepExploring, newGame, toTitle } from "../game/flow/story";
import { MONSTERS, MONSTER_ORDER } from "../game/data/monsters";
import { PHRASES } from "../game/logic/english";
import { Icon } from "./icons";
import { Portrait } from "./Portraits";
import { Ja } from "./Talk";

export function TitleScreen() {
  const screen = useGame((s) => s.screen);
  const hasSave = useGame((s) => s.hasSave);
  const settings = useGame((s) => s.settings);
  const [confirm, setConfirm] = useState(false);
  if (screen !== "title") return null;
  const setMic = (mic: boolean) => {
    const s = { ...settings, mic };
    saveSettings(s);
    setGame({ settings: s });
  };
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
        <div className="mode-switch" role="radiogroup" aria-label="How to answer">
          <button className={settings.mic ? "on" : ""} onClick={() => setMic(true)} aria-pressed={settings.mic} data-testid="mode-speak">
            <Icon id="mic" size={22} /> Speak <Ja>はなす</Ja>
          </button>
          <button className={!settings.mic ? "on" : ""} onClick={() => setMic(false)} aria-pressed={!settings.mic} data-testid="mode-tap">
            <Icon id="hand" size={22} /> Tap <Ja>タップ</Ja>
          </button>
        </div>
        {hasSave ? (
          <div className="title-buttons">
            <button className="primary big" onClick={() => void continueGame()} data-testid="btn-continue">
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

export function ResultsScreen() {
  const screen = useGame((s) => s.screen);
  const progress = useGame((s) => s.progress);
  const seconds = useGame((s) => s.seconds);
  if (screen !== "results") return null;
  const friends = MONSTER_ORDER.filter((id) => progress.monsters[id].friend);
  return (
    <div className="results ui" data-testid="results">
      <div className="results-card panel">
        {progress.endings >= 2 ? (
          <h1>
            Forest Adventure: Clear! <Ja>もりの ぼうけん クリア!</Ja>
          </h1>
        ) : (
          <h1>
            Beach Adventure: Clear! <Ja>はまべの ぼうけん クリア!</Ja>
          </h1>
        )}
        <div className="results-friends">
          {MONSTER_ORDER.map((id) => {
            const f = friends.includes(id);
            return (
              <div key={id} className={`r-friend ${f ? "on" : ""}`}>
                <Portrait id={id} size={84} silhouette={!f} />
                <span>{f ? MONSTERS[id].name : "???"}</span>
                {f && <Icon id="heart" size={20} />}
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
