import { debugEnabled } from "./debugAccess";
import { useDebug } from "./debugState";
import { keys } from "../input/keyboard";
import { rt } from "./runtime";
import { cb } from "./combat";
import { suspendDebugSpeech } from "./flow/ask";

export function installDebugControls() {
  if (!debugEnabled) {
    // Live builds: Ctrl+Shift+D reloads into ?debug=1 (separate debug save). The
    // single-key backquote stays debug-only so students can't hit it by accident.
    const enter = (e: KeyboardEvent) => {
      if (e.code !== "KeyD" || !e.ctrlKey || !e.shiftKey || e.altKey || e.repeat) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const url = new URL(location.href);
      url.searchParams.set("debug", "1");
      location.assign(url.toString());
    };
    window.addEventListener("keydown", enter, true);
    return () => window.removeEventListener("keydown", enter, true);
  }
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
