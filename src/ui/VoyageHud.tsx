import { useEffect, useRef, useState } from "react";
import { useGame } from "../game/store";
import { vy } from "../game/voyageRt";
import { TOOL } from "../game/voyageSim";
import { voyaging } from "../game/flow/voyage";
import { rt } from "../game/runtime";
import { pressAttack, releaseAttack } from "../input/attackInput";
import type { CompanionId } from "../game/data/combat";

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
    if (box.current) box.current.hidden = !show;
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
  // The touch button unmounts while a scene runs, and its pointerup never arrives.
  useEffect(() => () => releaseAttack("basic", "touch"), [touch, onBoard, mode]);
  const tool = active ? TOOL[active] : null;
  return <>
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
        <button className="move-btn basic" data-testid="voyage-tool"
          onPointerDown={(e) => { e.preventDefault(); pressAttack("basic", "touch"); }}
          onPointerUp={() => releaseAttack("basic", "touch")} onPointerCancel={() => releaseAttack("basic", "touch")} onPointerLeave={() => releaseAttack("basic", "touch")}>
          {tool.name}<small>{tool.ja}</small>
        </button>
      </div>
    )}
  </>;
}
