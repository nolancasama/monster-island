/** Held keys (by physical code, so WASD works on JIS keyboards and with the IME on). */
export const keys = new Set<string>();

export function keyboardMove(): { x: number; y: number } {
  let x = 0;
  let y = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) y += 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) y -= 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
  return { x, y };
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return Boolean(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable));
}

/** Install listeners. `onPress` receives fresh presses only (no auto-repeat). */
export function installKeyboard(onPress: (code: string, e: KeyboardEvent) => void): () => void {
  const down = (e: KeyboardEvent) => {
    if (isTyping(e)) return;
    const fresh = !keys.has(e.code) && !e.repeat;
    keys.add(e.code);
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    if (fresh) onPress(e.code, e);
  };
  const up = (e: KeyboardEvent) => {
    keys.delete(e.code);
  };
  const blur = () => keys.clear();
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", blur);
  return () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
    window.removeEventListener("blur", blur);
  };
}
