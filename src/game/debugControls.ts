import { debugEnabled } from "./debugAccess";
import { useDebug } from "./debugState";
import { keys } from "../input/keyboard";
import { rt } from "./runtime";
import { cb } from "./combat";
import { suspendDebugSpeech } from "./flow/ask";

export function installDebugControls() {
  if (!debugEnabled) return () => {};
  const down = (e: KeyboardEvent) => {
    const toggle = e.code === "Backquote" || (e.code === "KeyD" && e.ctrlKey && e.shiftKey);
    const open = useDebug.getState().open;
    if (!toggle && !(open && e.code === "Escape")) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return;
    keys.clear();
    rt.joy.x = rt.joy.y = 0;
    rt.player.vx = rt.player.vz = 0;
    cb.touchHold = cb.hold = false;
    const next = toggle ? !open : false;
    useDebug.setState({ open: next });
    if (next) suspendDebugSpeech();
  };
  window.addEventListener("keydown", down, true);
  return () => window.removeEventListener("keydown", down, true);
}
