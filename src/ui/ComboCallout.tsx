import { useEffect, useRef } from "react";
import * as THREE from "three";
import { cb } from "../game/combat";
import { COMBOS, COMBO_FRIEND, comboCall } from "../game/data/combos";
import { rt } from "../game/runtime";
import { cameraRef } from "../scene/CameraRig";

const LIFE = 0.9;
const SLOTS = 3;

/**
 * Combo popups ("Bonk!", "Splash x3!") projected from the impact point
 * (docs/PORT_TOWN_REVAMP.md §4.5). Written straight to the DOM each frame from
 * the combat log; at most three at once, the newest first.
 */
export function ComboCallouts() {
  const refs = useRef<Array<HTMLDivElement | null>>([]);
  useEffect(() => {
    let raf = 0;
    const v = new THREE.Vector3();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const cam = cameraRef.current;
      const live = cb.combos.filter((c) => rt.time - c.t >= 0 && rt.time - c.t < LIFE).slice(-SLOTS).reverse();
      for (let i = 0; i < SLOTS; i++) {
        const el = refs.current[i];
        if (!el) continue;
        const c = live[i];
        if (!c || !cam) {
          el.style.visibility = "hidden";
          continue;
        }
        const age = rt.time - c.t, k = age / LIFE;
        v.set(c.x, c.y, c.z).project(cam);
        const text = comboCall(c.kind, c.n);
        if (el.textContent !== text) el.textContent = text;
        el.style.color = COMBOS[COMBO_FRIEND[c.kind]].color;
        const pop = age < 0.12 ? 0.7 + (age / 0.12) * 0.5 : 1.2 - Math.min(0.2, (age - 0.12) * 0.8);
        el.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * window.innerWidth}px, ${((1 - v.y) / 2) * window.innerHeight - k * 46}px) scale(${pop})`;
        el.style.opacity = `${Math.min(1, (1 - k) * 2.5)}`;
        el.style.visibility = v.z < 1 ? "visible" : "hidden";
      }
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <>
      {Array.from({ length: SLOTS }, (_, i) => (
        <div key={i} ref={(el) => { refs.current[i] = el; }} className="combo-callout ui" data-testid="combo-callout" style={{ visibility: "hidden" }} aria-hidden="true" />
      ))}
    </>
  );
}
