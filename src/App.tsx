import { useEffect, useRef } from "react";
import { GameScene } from "./scene/GameScene";
import { Hud } from "./ui/Hud";
import { DialoguePanel, PromptPanel } from "./ui/Talk";
import { Journal } from "./ui/Journal";
import { TouchControls } from "./ui/TouchControls";
import { SettingsModal } from "./ui/Settings";
import { ResultsScreen, TitleScreen } from "./ui/Screens";
import { Banner } from "./ui/Act2Hud";
import { installKeyboard } from "./input/keyboard";
import { onKey } from "./game/flow/input";
import { hasSaved, installAutosave } from "./game/flow/story";
import { getGame, setGame, useGame } from "./game/store";
import { rt } from "./game/runtime";
import { tts } from "./audio/tts";
import { audio } from "./audio/audio";
import { bottomPanel } from "./scene/CameraRig";

/** Drag anywhere on the 3D view to turn the camera; the wheel zooms. */
function useCameraDrag(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let id: number | null = null;
    let lx = 0;
    let ly = 0;
    const down = (e: PointerEvent) => {
      if (e.pointerType === "touch") setGame({ touch: true });
      const target = e.target as HTMLElement;
      if (target.closest(".ui, button, input, .modal")) return;
      id = e.pointerId;
      lx = e.clientX;
      ly = e.clientY;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - lx;
      const dy = e.clientY - ly;
      lx = e.clientX;
      ly = e.clientY;
      const g = getGame();
      if (g.screen !== "game" || rt.camera.mode !== "follow") return;
      const s = g.settings.cameraSensitivity;
      rt.camera.yaw -= dx * 0.005 * s;
      rt.camera.pitch = Math.min(1.1, Math.max(0.2, rt.camera.pitch + dy * 0.003 * s));
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === id) id = null;
    };
    const wheel = (e: WheelEvent) => {
      if (getGame().screen !== "game") return;
      rt.camera.dist = Math.min(14, Math.max(5, rt.camera.dist + Math.sign(e.deltaY) * 0.8));
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: true });
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [ref]);
}

/** Keep the camera's lens shift in step with the bottom panel's height. */
function BottomPanels() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      bottomPanel.height = el.offsetHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="bottom-panels" ref={ref}>
      <PromptPanel />
      <DialoguePanel />
    </div>
  );
}

function Fade() {
  const fade = useGame((s) => s.fade);
  return <div className="fade" style={{ opacity: fade }} />;
}

export function App() {
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => installKeyboard(onKey), []);
  useEffect(() => tts.onSpeakingChange((on) => audio.setSpeaking(on)), []);
  useEffect(() => installAutosave(), []);
  useEffect(() => {
    if (window.matchMedia?.("(pointer: coarse)").matches) setGame({ touch: true });
    setGame({ hasSave: hasSaved() });
  }, []);
  useCameraDrag(wrap);
  const touch = useGame((s) => s.touch);
  return (
    <div className={`app ${touch ? "touch" : ""}`} ref={wrap}>
      <GameScene />
      <Hud />
      <BottomPanels />
      <TouchControls />
      <Banner />
      <Journal />
      <TitleScreen />
      <ResultsScreen />
      <SettingsModal />
      <Fade />
    </div>
  );
}
