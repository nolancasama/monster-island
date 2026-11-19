import { useCallback, useEffect, useRef, useState } from "react";
import { useGame } from "../game/store";
import { vy } from "../game/voyageRt";
import { TOOL } from "../game/voyageSim";
import { pressSpyglass, voyaging } from "../game/flow/voyage";
import { rt } from "../game/runtime";
import { GAME_CONTROL, releaseAttack, touchHold } from "../input/attackInput";
import { FOODS, islandFoods } from "../game/data/foods";
import { Icon } from "./icons";
import { Ja } from "./Talk";
import type { CompanionId } from "../game/data/combat";

/**
 * Redbeard's "Do you have …?" questions: the bag stays on screen with every food
 * in it and its count, and the food being asked about lit up (shown with 0 when
 * the bag has none, so "No, I don't!" is just as easy to check). Reads the live
 * bag, so a food taken shows at once.
 */
export function VoyageBag() {
  const show = useGame((s) => s.voyageBag);
  const bag = useGame((s) => s.progress.bag);
  const endings = useGame((s) => s.progress.endings);
  // Toasts ("Your bag: …", "-1 apples") move below the panel while it is open.
  useEffect(() => {
    document.body.classList.toggle("voyage-bag-on", Boolean(show));
    return () => document.body.classList.remove("voyage-bag-on");
  }, [show]);
  if (!show) return null;
  const foods = islandFoods({ endings }).filter((f) => (bag[f] ?? 0) > 0 || f === show.target);
  return (
    <div className="panel ui voyage-bag" data-testid="voyage-bag" aria-label="Your bag" role="status">
      <div className="voyage-bag-title">Your bag<Ja>バッグの なか</Ja></div>
      <div className="voyage-bag-items">
        {foods.map((f) => (
          <span key={f} className={`voyage-bag-item${f === show.target ? " target" : ""}${(bag[f] ?? 0) === 0 ? " none" : ""}`}
            data-testid={`voyage-bag-${f}`} data-target={f === show.target ? "true" : undefined} title={FOODS[f].word}>
            <Icon id={f} size={32} />
            <b>{bag[f] ?? 0}</b>
          </span>
        ))}
        {!foods.length && <span className="voyage-bag-empty">Empty<Ja>からっぽ</Ja></span>}
      </div>
    </div>
  );
}

/**
 * The pirate voyage's HUD (docs/PIRATE_VOYAGE.md): the running job's counter or
 * meter with a bilingual hint, the storm's lightning flash, and on touch screens
 * a J button named after the active friend's tool. Written straight to the DOM
 * every frame from `vy` (no React state per frame).
 */

function useFrameLoop(fn: () => void) {
  useEffect(() => {
    let raf = 0;
    const loop = () => { raf = requestAnimationFrame(loop); fn(); };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [fn]);
}

/**
 * Gull's spyglass: a dark ring closes round the view as the lens narrows
 * (the camera's field of view follows `vy.spyglass`), and a big button raises
 * or lowers it (E, Enter or Space do the same; flow/input).
 */
function Spyglass() {
  const step = useGame((s) => s.spyglass);
  const ring = useRef<HTMLDivElement>(null);
  const fn = useCallback(() => {
    const r = ring.current;
    if (!r) return;
    const k = vy.spyglass;
    r.style.opacity = `${Math.min(1, k * 1.4)}`;
    r.style.setProperty("--spy-r", `${130 - 50 * k}vmin`);
    r.hidden = k <= 0;
  }, []);
  useFrameLoop(fn);
  return <>
    <div ref={ring} hidden className="spyglass-ring" data-testid="spyglass-ring" aria-hidden="true" />
    {step && (
      <button className={`spyglass-btn ui ${GAME_CONTROL}`} data-testid={`spyglass-${step}`} onClick={() => pressSpyglass()}
        aria-label={step === "raise" ? "Use the spyglass" : "Put the spyglass down"}>
        <Icon id="spyglass" size={40} />
        <span>{step === "raise" ? "Use the spyglass" : "Put it down"}</span>
        <small>{step === "raise" ? "ぼうえんきょうを つかう" : "ぼうえんきょうを おろす"} · E</small>
      </button>
    )}
  </>;
}

export function VoyageHud() {
  const mode = useGame((s) => s.mode);
  const touch = useGame((s) => s.touch);
  const active = useGame((s) => s.progress.active) as CompanionId | null;
  const box = useRef<HTMLDivElement>(null), title = useRef<HTMLDivElement>(null), count = useRef<HTMLDivElement>(null);
  const meter = useRef<HTMLDivElement>(null), fill = useRef<HTMLDivElement>(null), band = useRef<HTMLDivElement>(null), hint = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const [onBoard, setOnBoard] = useState(false);
  const [fn] = useState(() => () => {
    const h = vy.hud, show = Boolean(h) && voyaging();
    if (box.current && box.current.hidden === show) {
      box.current.hidden = !show;
      document.body.classList.toggle("voyage-task", show);
    }
    if (show && h) {
      if (title.current) title.current.textContent = `${h.title} · ${h.ja}`;
      if (count.current) {
        count.current.hidden = !h.count;
        if (h.count) count.current.textContent = `${"●".repeat(Math.min(h.count[0], h.count[1]))}${"○".repeat(Math.max(0, h.count[1] - h.count[0]))}  ${h.count[0]} / ${h.count[1]}`;
      }
      if (meter.current) meter.current.hidden = h.value === undefined;
      if (fill.current && h.value !== undefined) {
        fill.current.style.width = `${Math.round(h.value * 100)}%`;
        const inBand = h.band ? h.value >= h.band[0] && h.value <= h.band[1] : true;
        fill.current.style.background = inBand ? "linear-gradient(#8fe08a,#3fae4a)" : h.band && h.value > h.band[1] ? "linear-gradient(#ffb09a,#e0563a)" : "linear-gradient(#ffe39a,#e8a83a)";
      }
      if (band.current) {
        band.current.hidden = !h.band;
        if (h.band) { band.current.style.left = `${h.band[0] * 100}%`; band.current.style.width = `${(h.band[1] - h.band[0]) * 100}%`; }
      }
      if (hint.current) hint.current.textContent = h.hint ?? "";
    }
    if (flash.current) {
      const k = vy.sea ? Math.max(0, 1 - (rt.time - vy.flash) / 0.35) : 0;
      flash.current.style.opacity = `${k * 0.4}`;
    }
    const board = voyaging();
    setOnBoard((was) => (was === board ? was : board));
  });
  useFrameLoop(fn);
  useEffect(() => () => document.body.classList.remove("voyage-task"), []);
  // The touch button unmounts while a scene runs, and its pointerup never arrives.
  useEffect(() => () => releaseAttack("basic", "touch"), [touch, onBoard, mode]);
  const tool = active ? TOOL[active] : null;
  return <>
    <VoyageBag />
    <Spyglass />
    <div ref={flash} className="voyage-flash" aria-hidden="true" />
    <div ref={box} hidden className="panel ui voyage-hud" data-testid="voyage-hud" role="status">
      <div ref={title} className="voyage-title" />
      <div ref={count} className="voyage-count" data-testid="voyage-count" />
      <div ref={meter} className="vital-bar voyage-meter" role="meter" aria-label="Job meter" aria-valuemin={0} aria-valuemax={1}>
        <div ref={band} className="voyage-band" />
        <div ref={fill} className="vital-fill" data-testid="voyage-meter" />
      </div>
      <div ref={hint} className="voyage-hint" />
    </div>
    {touch && onBoard && mode === "explore" && tool && (
      <div className="touch-moves ui">
        <button className={`move-btn basic ${GAME_CONTROL}`} data-testid="voyage-tool" {...touchHold("basic")}>
          {tool.name}<small>{tool.ja}</small>
        </button>
      </div>
    )}
  </>;
}
