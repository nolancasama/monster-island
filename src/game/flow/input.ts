import { getGame, setGame } from "../store";
import { cancelAsk, chooseIndex, hasLine, micPress, nextLine } from "./ask";
import { interact, switchByIndex } from "./actions";
import { audio } from "../../audio/audio";

export function openJournal(open = !getGame().journalOpen) {
  const g = getGame();
  if (open && (g.mode !== "explore" || g.screen !== "game")) return;
  audio.play(open ? "journal" : "tick");
  setGame({ journalOpen: open, journalPulse: false, journalPage: open ? (g.progress.active ?? g.journalPage) : g.journalPage });
}

/** Fresh key presses, routed by what is on screen. Movement keys are read per frame. */
export function onKey(code: string) {
  const g = getGame();
  if (g.screen !== "game") return;

  if (g.settingsOpen) {
    if (code === "Escape") setGame({ settingsOpen: false });
    return;
  }
  if (g.journalOpen) {
    if (code === "Escape" || code === "KeyM") openJournal(false);
    return;
  }
  if (hasLine()) {
    if (code === "Space" || code === "KeyE" || code === "Enter" || code === "NumpadEnter") nextLine();
    return;
  }

  switch (g.mode) {
    case "ask": {
      if (code === "Space") micPress();
      else if (code === "Escape") cancelAsk();
      else if (code.startsWith("Digit") || code.startsWith("Numpad")) {
        const n = Number(code.replace(/\D/g, ""));
        if (n >= 1 && n <= 4) chooseIndex(n - 1);
      }
      return;
    }
    case "explore": {
      if (code === "KeyE" || code === "Enter") interact();
      else if (code === "KeyM") openJournal(true);
      else if (code === "Escape") setGame({ settingsOpen: true });
      else if (code.startsWith("Digit")) {
        const n = Number(code.replace(/\D/g, ""));
        if (n >= 1 && n <= 4) switchByIndex(n - 1);
      }
      return;
    }
    default:
      return;
  }
}
