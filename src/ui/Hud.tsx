import { useEffect, useRef } from "react";
import * as THREE from "three";
import { getGame, setGame, useGame } from "../game/store";
import { companions, objective } from "../game/logic/progress";
import { islandFoods, FOODS } from "../game/data/foods";
import { COLOR_HEX, MONSTERS } from "../game/data/monsters";
import { interact, switchByIndex } from "../game/flow/actions";
import { openJournal } from "../game/flow/input";
import { cameraRef } from "../scene/CameraRig";
import { standY } from "../game/world/collision";
import { Icon } from "./icons";
import { Portrait } from "./Portraits";
import { Ja } from "./Talk";
import { UI, objectiveText } from "./i18n";
import { rt } from "../game/runtime";
import { eat } from "../game/combat";
import { Act2Hud } from "./Act2Hud";
import type { MonsterId } from "../game/types";
import { eatCloudStew } from "../game/flow/act3";

/** How high a monster floats (a flier up in its tree carries its label with it). */
const rtAir = (id: string) => rt.monsters[id as MonsterId]?.air ?? 0;

/** Shown while exploring: during a scene the next goal would give the story away. */
function ObjectiveCard() {
  const progress = useGame((s) => s.progress);
  const mode = useGame((s) => s.mode);
  if (mode !== "explore") return <div />;
  const o = objective(progress);
  const t = objectiveText(o);
  return (
    <div className="objective panel ui" data-testid="objective" data-id={o.id}>
      <Icon id="star" size={30} />
      <div>
        <span className="obj-en">{t.en}</span>
        <Ja>{t.ja}</Ja>
      </div>
    </div>
  );
}

function Bag() {
  const progress = useGame((s) => s.progress);
  const bag = progress.bag;
  const mode = useGame((s) => s.mode);
  const has = islandFoods(progress).filter((f) => (bag[f] ?? 0) > 0);
  if ((!has.length && !progress.act3.stew) || mode !== "explore") return null;
  // Act 2: tapping a food eats it (HP for the player, MP for the friend who loves it).
  if (progress.act2.started) {
    return (
      <div className="bag panel ui" data-testid="bag" aria-label="Food bag">
        {has.map((f) => (
          <button key={f} className="bag-item eatable" title={`Eat ${FOODS[f].word}`} onClick={() => eat(f)} data-testid={`bag-${f}`}>
            <Icon id={f} size={30} />
            <b>{bag[f]}</b>
          </button>
        ))}
        {progress.act3.stew > 0 && <button className="bag-item eatable" title="Stew: +50 HP, +40 MP to every friend / みんな げんきに" onClick={eatCloudStew} data-testid="bag-stew"><span aria-hidden="true">🥣</span><span>Stew<Ja>シチュー</Ja></span><b>{progress.act3.stew}</b></button>}
      </div>
    );
  }
  return (
    <div className="bag panel ui" data-testid="bag" aria-label="Food bag">
      {has.map((f) => (
        <span key={f} className="bag-item" title={FOODS[f].word} data-testid={`bag-${f}`}>
          <Icon id={f} size={30} />
          <b>{bag[f]}</b>
        </span>
      ))}
    </div>
  );
}

function TopButtons() {
  const pulse = useGame((s) => s.journalPulse);
  const touch = useGame((s) => s.touch);
  return (
    <div className="top-buttons ui">
      <button className={`round journal-btn ${pulse ? "pulse" : ""}`} onClick={() => openJournal(true)} aria-label="Monster Journal" data-testid="btn-journal">
        <Icon id="journal" size={34} />
        {!touch && <kbd>M</kbd>}
      </button>
      <button className="round" onClick={() => setGame({ settingsOpen: true })} aria-label="Settings" data-testid="btn-settings">
        <Icon id="gear" size={28} />
      </button>
    </div>
  );
}

/** The companion and the other friends (tap to switch). */
function Team() {
  const progress = useGame((s) => s.progress);
  const touch = useGame((s) => s.touch);
  const mode = useGame((s) => s.mode);
  const friends = companions(progress);
  if (!friends.length || mode !== "explore") return null;
  return (
    <div className="team ui" data-testid="team">
      {friends.map((id, i) => (
        <button
          key={id}
          className={`team-chip ${progress.active === id ? "active" : ""}`}
          style={{ borderColor: COLOR_HEX[MONSTERS[id].color] }}
          onClick={() => switchByIndex(i)}
          aria-label={MONSTERS[id].name}
          aria-pressed={progress.active === id}
          data-testid={`team-${id}`}
        >
          <Portrait id={id} size={progress.active === id ? 58 : 44} />
          <span>{MONSTERS[id].name}</span>
          {!touch && <kbd>{i + 1}</kbd>}
        </button>
      ))}
    </div>
  );
}

function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`} data-testid="toast">
          {t.icon && <Icon id={t.icon} size={28} />}
          <span>{t.en}</span>
          <Ja>{t.ja}</Ja>
        </div>
      ))}
    </div>
  );
}

function HintBar() {
  const hint = useGame((s) => s.hint);
  const touch = useGame((s) => s.touch);
  const mode = useGame((s) => s.mode);
  if (!hint || mode !== "explore") return null;
  const t =
    hint === "move" ? (touch ? UI.moveTouch : UI.move)
    : hint === "micBlocked" ? UI.micBlocked
    : hint === "switch" ? UI.switch
    : hint === "attack" ? (touch ? UI.attackTouch : UI.attack)
    : hint === "coins" ? UI.coins
    : hint === "special" ? (touch ? UI.specialTouch : UI.special)
    : hint === "eat" ? (touch ? UI.eatTouch : UI.eat)
    : hint === "switchAct2" ? UI.switchAct2
    : null;
  if (!t) return null;
  return (
    <div className="hint-bar" data-testid="hint">
      <span>{t.en}</span>
      <Ja>{t.ja}</Ja>
    </div>
  );
}

/** "E Talk to Leafy" floating over whatever E would use. */
function FocusLabel() {
  const focus = useGame((s) => s.focus);
  const mode = useGame((s) => s.mode);
  const touch = useGame((s) => s.touch);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let raf = 0;
    const v = new THREE.Vector3();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const el = ref.current;
      const f = getGame().focus;
      const cam = cameraRef.current;
      if (!el || !f || !cam) return;
      const air = f.kind === "monster" ? rtAir(f.id) : 0;
      const h = (f.kind === "monster" ? 1.7 : f.kind === "maple" ? 2.2 : f.kind === "stone" ? 4.2 : f.kind === "rope" ? 1.9 : 1.3) + air;
      v.set(f.x, standY(f.x, f.z, getGame().progress.solved) + h, f.z).project(cam);
      el.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * window.innerWidth}px, ${((1 - v.y) / 2) * window.innerHeight}px)`;
      el.style.visibility = v.z < 1 ? "visible" : "hidden";
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, []);
  if (!focus || mode !== "explore") return null;
  return (
    <button ref={ref} className="focus-label ui" onClick={() => interact()} data-testid="focus-label" style={{ visibility: "hidden" }}>
      {!touch && <kbd>E</kbd>}
      {touch && <Icon id="hand" size={22} />}
      <span>
        {focus.verb} {focus.noun}
      </span>
    </button>
  );
}

/** "New monster!": a journal page that colours in as it is described. */
function DiscoverCard() {
  const d = useGame((s) => s.discovering);
  if (!d) return null;
  const def = MONSTERS[d.monster];
  return (
    <div className={`discover-card ui ${d.colored ? "colored" : ""}`} data-testid="discover-card">
      <div className="ribbon">New monster!</div>
      <div className="page">
        <Portrait id={d.monster} size={120} silhouette={!d.colored} />
        <div className="page-text">
          <b>{d.colored && (d.monster !== "lumo" || d.lines?.includes("name")) ? def.name : "???"}</b>
          {d.colored && (
            <span className="color-chip" style={{ background: COLOR_HEX[def.color] }}>
              It's {def.color}.
            </span>
          )}
          {d.lines?.includes("size") && (
            <span className="color-chip line-chip" data-testid="discover-size">
              It's {def.size}.
            </span>
          )}
          {d.lines?.includes("part") && def.part && (
            <span className="color-chip line-chip" data-testid="discover-part">
              {def.part === "wings" ? "It has wings." : "It has a tail."}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function FriendCard() {
  const id = useGame((s) => s.friendCard);
  if (!id) return null;
  return (
    <div className="friend-card ui" data-testid="friend-card">
      <div className="burst" />
      <Portrait id={id} size={150} />
      <div className="friend-text">
        <Icon id="heart" size={30} /> {MONSTERS[id].name} <Icon id="heart" size={30} />
      </div>
    </div>
  );
}

export function Hud() {
  const screen = useGame((s) => s.screen);
  if (screen !== "game") return null;
  return (
    <>
      <div className="hud-top">
        <ObjectiveCard />
        <div className="hud-right">
          <Bag />
          <TopButtons />
        </div>
      </div>
      <Team />
      <Toasts />
      <HintBar />
      <FocusLabel />
      <DiscoverCard />
      <FriendCard />
      <Act2Hud />
    </>
  );
}
