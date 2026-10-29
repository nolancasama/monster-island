import { useEffect, useRef, useState } from "react";
import { setGame, useGame } from "../game/store";
import { stageStatus, cb, basicAttack, eat, inHostileZone, specialAttack } from "../game/combat";
import { COMBAT, FOOD_RESTORE, MAX_HP, MAX_MP, PRICES, RECIPES, type CompanionId } from "../game/data/combat";
import { FOODS } from "../game/data/foods";
import { favouriteFood } from "../game/logic/act2";
import { MONSTERS } from "../game/data/monsters";
import { practiseCommand, quickBuy } from "../game/flow/act2";
import { rt } from "../game/runtime";
import type { FoodId } from "../game/types";
import { Icon } from "./icons";
import { Portrait } from "./Portraits";
import { Ja } from "./Talk";

/**
 * Act 2's HUD. HP and MP change every frame in a fight, so the bars are
 * written straight to the DOM from the live values (no React state per frame).
 */

function useLive(fn: () => void) {
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      fn();
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [fn]);
}

/** One continuous HP bar, and the active friend's MP under it. */
function Vitals() {
  const progress = useGame((s) => s.progress);
  const active = progress.active as CompanionId | null;
  const hp = useRef<HTMLDivElement>(null);
  const hpText = useRef<HTMLSpanElement>(null);
  const mp = useRef<HTMLDivElement>(null);
  const mpText = useRef<HTMLSpanElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [fn] = useState(() => () => {
    const v = cb.vitals;
    const h = Math.max(0, v.hp) / MAX_HP;
    if (hp.current) {
      hp.current.style.width = `${h * 100}%`;
      hp.current.style.background =
        h > 0.5 ? "linear-gradient(#7ee36a, #3fb64a)" : h > 0.25 ? "linear-gradient(#ffd96b, #e8a83a)" : "linear-gradient(#ff8a7a, #e8483f)";
    }
    if (hpText.current) hpText.current.textContent = `${Math.ceil(v.hp)} / ${MAX_HP}`;
    if (box.current) box.current.classList.toggle("hurt", rt.time - cb.hurtT < 0.35);
  });
  useLive(fn);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!active) return;
      const m = cb.vitals.mp[active];
      if (mp.current) mp.current.style.width = `${(m / MAX_MP) * 100}%`;
      if (mpText.current) mpText.current.textContent = `${Math.floor(m)} / ${MAX_MP}`;
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return (
    <div className="vitals panel ui" ref={box} data-testid="vitals">
      <div className="vital-row">
        <b className="vital-label">HP</b>
        <div className="vital-bar hp">
          <div ref={hp} className="vital-fill" data-testid="hp-fill" />
          <span ref={hpText} className="vital-num" data-testid="hp-text" />
        </div>
      </div>
      {active && (
        <div className="vital-row">
          <Portrait id={active} size={26} />
          <div className="vital-bar mp">
            <div ref={mp} className="vital-fill mp-fill" data-testid="mp-fill" />
            <span ref={mpText} className="vital-num" data-testid="mp-text" />
          </div>
        </div>
      )}
    </div>
  );
}

/** The moves of the active friend with their English words (keys on a keyboard, big buttons on touch). */
function Moves() {
  const progress = useGame((s) => s.progress);
  const touch = useGame((s) => s.touch);
  const mode = useGame((s) => s.mode);
  const [, force] = useState(0);
  // Re-check the hostile area a few times a second (the buttons show only where fights happen).
  useEffect(() => {
    const t = window.setInterval(() => force((n) => n + 1), 300);
    return () => window.clearInterval(t);
  }, []);
  const active = progress.active as CompanionId | null;
  if (!active || mode !== "explore" || !inHostileZone()) return null;
  const c = COMBAT[active];
  const food = favouriteFood(active);
  if (!food) return null;
  const count = progress.bag[food] ?? 0;
  const restore = FOOD_RESTORE[food];
  const word = FOODS[food].word;
  const Word = `${word[0].toUpperCase()}${word.slice(1)}`;
  const effect = count ? `${Word} ×${count} · +${restore.hp} HP · +${restore.mp} ${MONSTERS[active].name} MP` : `No ${word} · ${MONSTERS[active].name} loves ${word}!`;
  const eatButton = (
    <button
      className={touch ? "move-btn eat" : "eat-key"}
      onPointerDown={touch ? (e) => {
        e.preventDefault();
        eat();
      } : undefined}
      onClick={(e) => { if (!touch || e.detail === 0) eat(); }}
      aria-disabled={count === 0}
      data-testid="btn-eat"
      aria-label={count ? `Eat ${word}` : `No ${word}`}
    >
      {!touch && <kbd>F</kbd>}
      <Icon id={food} size={touch ? 30 : 24} />
      <b className="eat-count">×{count}</b>
      <small>{count ? "Eat" : `No ${word}`}</small>
    </button>
  );
  if (touch) {
    const hold = (on: boolean) => (e: React.PointerEvent) => {
      e.preventDefault();
      cb.touchHold = on;
      if (on) basicAttack();
    };
    return (
      <div className="touch-moves ui">
        <div className="eat-effect">{effect}</div>
        <button
          className="move-btn special"
          onPointerDown={(e) => {
            e.preventDefault();
            specialAttack();
          }}
          data-testid="btn-special"
          aria-label={c.special.word}
        >
          <span className="move-word">{c.special.word}</span>
          <small>{c.special.cost} MP</small>
        </button>
        <button
          className="move-btn basic"
          onPointerDown={hold(true)}
          onPointerUp={hold(false)}
          onPointerCancel={hold(false)}
          onPointerLeave={hold(false)}
          data-testid="btn-basic"
          aria-label={c.basic.word}
        >
          <span className="move-word">{c.basic.word}</span>
        </button>
        {eatButton}
      </div>
    );
  }
  return (
    <div className="moves-legend ui" data-testid="moves">
      <div className="eat-effect">{effect}</div>
      <span>
        <kbd>J</kbd> {c.basic.word}
      </span>
      <span>
        <kbd>K</kbd> {c.special.word} <small>{c.special.cost} MP</small>
      </span>
      {eatButton}
    </div>
  );
}

function Coins() {
  const coins = useGame((s) => s.progress.act2.coins);
  const amber = useGame((s) => s.progress.act2.items.amber ?? 0);
  return (
    <div className="coins panel ui" data-testid="coins" aria-label="Monster Coins">
      <Icon id="coin" size={28} />
      <b data-testid="coin-count">{coins}</b>
      {amber > 0 && (
        <span className="amber-count" title="amber" data-testid="amber-count">
          <Icon id="amber" size={24} />
          <b>{amber}</b>
        </span>
      )}
    </div>
  );
}

/** Act 2's HUD pieces shown while exploring. */
export function Act2Hud() {
  const started = useGame((s) => s.progress.act2.started);
  const mode = useGame((s) => s.mode);
  const screen = useGame((s) => s.screen);
  if (!started || screen !== "game") return null;
  return (
    <>
      {mode === "explore" && <Vitals />}
      {mode === "explore" && <Coins />}
      {mode === "explore" && <StageCounter />}
      <Moves />
      <ShopPanel />
      <TrainerPanel />
    </>
  );
}

/** A big story banner in the middle of the screen. */
export function Banner() {
  const b = useGame((s) => s.banner);
  if (!b) return null;
  return (
    <div className={`story-banner ui ${b.tone}`} data-testid="banner">
      <div className="banner-title">{b.title}</div>
      {b.sub && <div className="banner-sub">{b.sub}</div>}
      {b.ja && <Ja>{b.ja}</Ja>}
    </div>
  );
}

const SHOP: FoodId[] = ["apples", "bananas", "fish", "berries", "meat"];
const NUMBER_WORD = ["", "one", "two", "three"];
/** The shop sentence's noun for one and for more ("one apple", "two apples", "one piece of meat"). */
const ONE: Record<FoodId, string> = { apples: "apple", bananas: "banana", fish: "fish", berries: "berry", meat: "piece of meat" };
const MANY: Record<FoodId, string> = { apples: "apples", bananas: "bananas", fish: "fish", berries: "berries", meat: "pieces of meat" };

/** The market after the first conversation: pick a food and how many; the button says the sentence. */
function ShopPanel() {
  const panel = useGame((s) => s.panel);
  const coins = useGame((s) => s.progress.act2.coins);
  const bag = useGame((s) => s.progress.bag);
  const [n, setN] = useState<Record<string, number>>({});
  if (panel !== "shop") return null;
  return (
    <div className="modal-back ui" data-testid="shop">
      <div className="modal panel shop-panel">
        <h2>
          Food Market <Ja>たべものの おみせ</Ja>
        </h2>
        <p className="shop-coins">
          <Icon id="coin" size={24} /> {coins}
        </p>
        <div className="shop-rows">
          {SHOP.map((f) => {
            const q = n[f] ?? 1;
            const word = (q === 1 ? ONE : MANY)[f];
            return (
              <div key={f} className="shop-row" data-testid={`shop-${f}`}>
                <Icon id={f} size={40} />
                <span className="shop-price">
                  {PRICES[f]} <Icon id="coin" size={18} />
                </span>
                <span className="shop-have">×{bag[f] ?? 0}</span>
                <div className="qty">
                  {[1, 2, 3].map((k) => (
                    <button key={k} className={q === k ? "on" : ""} onClick={() => setN({ ...n, [f]: k })} data-testid={`qty-${f}-${k}`}>
                      {k}
                    </button>
                  ))}
                </div>
                <button className="primary buy" onClick={() => quickBuy(f, q)} data-testid={`buy-${f}`}>
                  I want {NUMBER_WORD[q]} {word}, please.
                </button>
              </div>
            );
          })}
        </div>
        <button className="secondary" onClick={() => setGame({ panel: null })} data-testid="shop-close">
          Thank you! Bye! <Ja>おわる</Ja>
        </button>
      </div>
    </div>
  );
}

/** Coach Rex's list: every friend's moves, the English words, MP costs and upgrades; practise a command aloud. */
function TrainerPanel() {
  const panel = useGame((s) => s.panel);
  const progress = useGame((s) => s.progress);
  if (panel !== "trainer") return null;
  const friends = (["leafy", "bubbo", "puff", "ember"] as CompanionId[]).filter((id) => progress.monsters[id].friend);
  return (
    <div className="modal-back ui" data-testid="trainer">
      <div className="modal panel trainer-panel">
        <h2>
          Monster Moves <Ja>モンスターの わざ</Ja>
        </h2>
        <div className="trainer-rows">
          {friends.map((id) => {
            const c = COMBAT[id];
            const up = progress.act2.upgrades.includes(id);
            return (
              <div key={id} className="trainer-row" data-testid={`trainer-${id}`}>
                <Portrait id={id} size={54} />
                <div className="trainer-moves">
                  <b>{MONSTERS[id].name}</b>
                  <span>
                    <kbd>J</kbd> {c.basic.word} — {c.basic.name.en} <Ja>{c.basic.name.ja}</Ja>
                  </span>
                  <span>
                    <kbd>K</kbd> {c.special.word} — {c.special.name.en} ({c.special.cost} MP) <Ja>{c.special.name.ja}</Ja>
                  </span>
                  <span className={up ? "learned" : "locked"}>
                    {up ? "★ " : "☆ "}
                    {c.upgrade.name.en} {up ? "(learned!)" : `— ${RECIPES[id].treat.en}`} <Ja>{up ? "おぼえた!" : `${RECIPES[id].treat.ja}で おぼえる`}</Ja>
                  </span>
                </div>
                <button className="primary" onClick={() => void practiseCommand(id)} data-testid={`practise-${id}`}>
                  Say "{c.special.word}" {progress.act2.trained.includes(id) ? "✓" : "+10"}
                </button>
              </div>
            );
          })}
        </div>
        <button className="secondary" onClick={() => setGame({ panel: null })} data-testid="trainer-close">
          Thank you! <Ja>おわる</Ja>
        </button>
      </div>
    </div>
  );
}

/** Small first-clear counter; the last-enemy arrow rotates relative to the live camera. */
function StageCounter() {
  const ref = useRef<HTMLDivElement>(null);
  const [fn] = useState(() => () => {
    const el = ref.current;
    if (!el) return;
    const status = stageStatus();
    el.hidden = !status;
    if (!status) return;
    let hint = "";
    if (status.last) {
      const e = status.last,
        p = rt.player,
        c = rt.camera;
      const yaw = Math.atan2(c.target.x - c.pos.x, c.target.z - c.pos.z);
      const angle = Math.atan2(e.x - p.x, e.z - p.z) - yaw;
      const arrows = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
      hint = `  ${arrows[((Math.round(-angle / (Math.PI / 4)) % 8) + 8) % 8]} ${Math.ceil(Math.hypot(e.x - p.x, e.z - p.z))} m`;
    }
    el.textContent = `Enemies remaining: ${status.remaining}${hint}`;
  });
  useLive(fn);
  return <div ref={ref} hidden className="stage-counter panel ui" data-testid="stage-counter" aria-live="polite" />;
}
