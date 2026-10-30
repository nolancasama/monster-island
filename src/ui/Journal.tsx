import { setGame, useGame } from "../game/store";
import { cloudIsleOpen, CLOUD_ISLE_SOON } from "../game/release";
import { useDebug } from "../game/debugState";
import { COLOR_HEX, MONSTERS, MONSTER_ORDER, LIVE_MONSTERS } from "../game/data/monsters";
import { FOODS, islandFoods } from "../game/data/foods";
import { favoriteKnown, optionalLines } from "../game/logic/progress";
import { PHRASES } from "../game/logic/english";
import { linePhrase, writeLine } from "../game/flow/encounter";
import { openJournal } from "../game/flow/input";
import { switchTo } from "../game/flow/companion";
import { speak } from "../game/flow/ask";
import { tts } from "../audio/tts";
import { Icon } from "./icons";
import { Portrait } from "./Portraits";
import { Ja } from "./Talk";
import type { AbilityId, MonsterId } from "../game/types";

const ABILITIES: AbilityId[] = ["swim", "fly", "jump"];

function hear(id: MonsterId, text: string) {
  tts.cancel();
  void speak(text, id);
}

function Page({ id }: { id: MonsterId }) {
  useDebug(s => s.cloudIsleShipOpen);
  const progress = useGame((s) => s.progress);
  const def = MONSTERS[id];
  const r = progress.monsters[id];
  const shipLocked = progress.act2.harbor && progress.act3.world === "home" && !cloudIsleOpen();
  const live = LIVE_MONSTERS.includes(id);
  if (!r.discovered) {
    return (
      <div className="j-page unknown" data-testid="journal-page" data-id={id}>
        <Portrait id={id} size={150} silhouette />
        <h2>???</h2>
        <p className="j-hint">
          {live ? `Find this monster! (${def.habitat.en})` : "Not found yet."}
          <Ja>{live ? `${def.habitat.ja}で さがそう!` : "まだ みつけていない。この しまの どこかに いるよ"}</Ja>
        </p>
      </div>
    );
  }
  const fav = favoriteKnown(progress, id);
  const likeLine = fav ? `I like ${FOODS[def.favorite].word}!` : null;
  return (
    <div className="j-page" data-testid="journal-page" data-id={id}>
      <div className="j-head">
        <Portrait id={id} size={150} />
        <div>
          <h2>
            {id === "lumo" && !r.described.name ? "???" : def.name} {r.friend && <Icon id="heart" size={28} />}
          </h2>
          {id === "lumo" && r.described.name && (
            <button className="j-line" onClick={() => hear(id, "I'm Lumo!")} data-testid="j-line-name">
              <Icon id="speaker" size={18} /> I'm Lumo!
            </button>
          )}
          <button className="j-line" onClick={() => hear(id, `It's ${def.color}.`)} style={{ borderColor: COLOR_HEX[def.color] }}>
            <Icon id="speaker" size={18} /> It's {def.color}.
          </button>
          {(["size", "part"] as const).map((line) => {
            if (line === "part" && !def.part) return null;
            const en = PHRASES[linePhrase(id, line)].en;
            if (r.described[line])
              return (
                <button key={line} className="j-line" onClick={() => hear(id, en)} data-testid={`j-line-${line}`}>
                  <Icon id="speaker" size={18} /> {en}
                </button>
              );
            // Phase 1 pages get an optional size line once the forest is open.
            if (!optionalLines(progress, id).includes(line)) return null;
            return (
              <button
                key={line}
                className="j-line j-line-empty"
                onClick={() => {
                  openJournal(false);
                  void writeLine(id, line);
                }}
                data-testid={`j-write-${line}`}
              >
                <Icon id="mic" size={18} /> Big or small?
                <Ja>おおきい? ちいさい? いって かこう</Ja>
              </button>
            );
          })}
          <p className="j-habitat">
            <b>Home:</b> {def.habitat.en} <Ja>{def.habitat.ja}</Ja>
          </p>
          <p className={`j-status ${r.friend ? "friend" : ""}`} data-testid="journal-status">
            {r.friend ? "Friend!" : "Not friends yet"}
            <Ja>{r.friend ? "ともだち!" : "まだ ともだちじゃない"}</Ja>
          </p>
        </div>
      </div>
      {id !== "lumo" && <section>
        <h3>
          Food <Ja>たべもの</Ja>
        </h3>
        <div className="j-foods">
          {islandFoods(progress).map((f) => {
            const a = r.asked[f];
            return (
              <span key={f} className={`j-food ${a === true ? "yes" : a === false ? "no" : "unknown"}`} data-testid={`j-food-${f}`}>
                <Icon id={f} size={34} />
                <span>{FOODS[f].word}</span>
                {a === true && <Icon id="heart" size={18} />}
                {a === false && <Icon id="cross" size={16} />}
                {a === undefined && <b>?</b>}
              </span>
            );
          })}
        </div>
        {likeLine && (
          <button className="j-line" onClick={() => hear(id, likeLine)}>
            <Icon id="speaker" size={18} /> {likeLine}
          </button>
        )}
      </section>}
      {id !== "lumo" && <section>
        <h3>
          Can <Ja>できること</Ja>
        </h3>
        <div className="j-foods">
          {[...(def.power ? [def.power] : []), ...[...ABILITIES, ...(progress.endings >= 2 ? ["fire" as const] : [])].filter((a) => a !== def.power)].map((a) => {
            const k = r.canKnown[a];
            const label = a === "grow" ? "grow plants" : a === "fire" ? "make fire" : a;
            return (
              <span key={a} className={`j-food ${k === true ? "yes" : k === false ? "no" : "unknown"}`} data-testid={`j-can-${a}`}>
                <Icon id={a} size={30} />
                <span>{label}</span>
                {k === true && <Icon id="check" size={16} />}
                {k === false && <Icon id="cross" size={16} />}
                {k === undefined && <b>?</b>}
              </span>
            );
          })}
        </div>
        {r.friend && (
          <button className="j-line" onClick={() => hear(id, def.powerLine.en)}>
            <Icon id="speaker" size={18} /> {def.powerLine.en}
          </button>
        )}
      </section>}
      {id === "lumo" && r.friend && (
        <button className="j-line" onClick={() => hear(id, "I like monsters!")}>
          <Icon id="speaker" size={18} /> I like monsters!
        </button>
      )}
      {id === "lumo" && progress.act2.lumoTaken && (
        <p className="j-taken" data-testid="journal-lumo-taken">
          <b>{shipLocked ? CLOUD_ISLE_SOON.en : progress.act3.skyFortressClue ? "Find the Sky Fortress — Lumo is still in the raiders' cage!" : progress.act3.family.drawingSeen ? "Reach the Ancient Observatory and find Lumo" : progress.act2.harbor ? "Sail with Captain Gull to Cloud Isle!" : "Taken by the sky raiders!"}</b>{" "}
          <Ja>{shipLocked ? CLOUD_ISLE_SOON.ja : progress.act3.skyFortressClue ? "空の とりでを さがそう。ルモは まだ とうぞくの かごの中！" : progress.act3.family.drawingSeen ? "こだいの てんもんだいへ いって ルモを さがそう" : progress.act2.harbor ? "ガルせんちょうと クラウドじまへ!" : "そらの とうぞくに つれて いかれた! たすけに いこう"}</Ja>
        </p>
      )}
      {r.friend && def.companion !== false && (
        <button
          className={`primary j-choose ${progress.active === id ? "chosen" : ""}`}
          disabled={progress.active === id}
          onClick={() => {
            switchTo(id);
            openJournal(false);
          }}
          data-testid="journal-choose"
        >
          {progress.active === id ? `${def.name} is with you` : `Choose ${def.name}`}
          <Ja>{progress.active === id ? "いっしょに いるよ" : "いっしょに いこう"}</Ja>
        </button>
      )}
    </div>
  );
}

export function Journal() {
  const open = useGame((s) => s.journalOpen);
  const page = useGame((s) => s.journalPage);
  const progress = useGame((s) => s.progress);
  if (!open) return null;
  return (
    <div className="modal-back ui" onClick={() => openJournal(false)}>
      <div className="journal modal" onClick={(e) => e.stopPropagation()} data-testid="journal" role="dialog" aria-label="Monster Journal">
        <header>
          <Icon id="journal" size={36} />
          <h1>
            Monster Journal <Ja>モンスターずかん</Ja>
          </h1>
          <button className="round close-btn" onClick={() => openJournal(false)} aria-label="Close" data-testid="journal-close">
            <Icon id="close" size={22} />
          </button>
        </header>
        <nav className="j-tabs">
          {MONSTER_ORDER.map((id) => {
            const r = progress.monsters[id];
            return (
              <button key={id} className={`j-tab ${page === id ? "on" : ""}`} onClick={() => setGame({ journalPage: id })} data-testid={`journal-tab-${id}`}>
                <Portrait id={id} size={54} silhouette={!r.discovered} />
                <span>{r.discovered && (id !== "lumo" || r.described.name) ? MONSTERS[id].name : "???"}</span>
                {r.friend && <Icon id="heart" size={16} />}
                {progress.active === id && <em>with you</em>}
              </button>
            );
          })}
        </nav>
        <Page id={page} />
      </div>
    </div>
  );
}
