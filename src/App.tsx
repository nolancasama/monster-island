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
import { setGame, useGame } from "./game/store";
import { tts } from "./audio/tts";
import { audio } from "./audio/audio";
import { bottomPanel } from "./scene/CameraRig";
import { CloudStory } from "./ui/CloudStory";

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
  // Touch anywhere can reveal the stick/buttons; the view has no drag controls.
  useEffect(() => {
    const detectTouch = (e: PointerEvent) => { if (e.pointerType === "touch") setGame({ touch: true }); };
    window.addEventListener("pointerdown", detectTouch);
    return () => window.removeEventListener("pointerdown", detectTouch);
  }, []);
  const touch = useGame((s) => s.touch);
  return (
    <div className={`app ${touch ? "touch" : ""}`} ref={wrap}>
      <GameScene />
      <Hud />
      <BottomPanels />
      <CloudStory />
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
