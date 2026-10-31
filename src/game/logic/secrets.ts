import { ELEMENT_OBJECTS, EVENT_TAG, secretOf, type ElementEvent, type ElementObject } from "../world/elementObjects";

export interface ElementState { state: string; remaining?: number }
export interface SecretProgress {
  /** Only this final completion list belongs in the save. */
  secrets: string[];
  objects: Record<string, ElementState>;
}

export function objectState(o: ElementObject, p: SecretProgress): ElementState {
  return p.secrets.includes(secretOf(o)) ? { state: "complete" } : p.objects[o.id] ?? { state: "intact" };
}

function complete(p: SecretProgress, id: string): SecretProgress {
  return p.secrets.includes(id) ? p : { ...p, secrets: [...p.secrets, id] };
}

/** Pure event reducer: moves supply only geometry and an elemental event. */
export function secretEvent(id: string, event: ElementEvent, p: SecretProgress): SecretProgress {
  const o = ELEMENT_OBJECTS.find(o => o.id === id);
  if (!o || p.secrets.includes(secretOf(o)) || !o.tags.includes(EVENT_TAG[event])) return p;
  const response = o.on?.[event];
  if (!response) return p;
  const before = objectState(o, p).state;
  if (id === "comboCrateLift" && (event === "lift" ? before !== "onPad" : before !== "intact")) return p;
  if (id === "comboFurnace" && event === "wind" && before !== "lit") return p;
  // Sustained fire never restarts a thicket's burn or extends the furnace clock.
  if (before === response.becomes) return p;
  const remaining = id === "emberThicket" ? 1.5 : id === "comboFurnace" && event === "burn" ? 8 : undefined;
  let next: SecretProgress = { ...p, objects: { ...p.objects, [id]: { state: response.becomes, ...(remaining === undefined ? {} : { remaining }) } } };
  if (!response.secret || id === "emberThicket" || id === "puffLeaves") return next;
  if (response.secret === "leafyStatues" && !["leafyStatues", "leafyStatuesEast"].every(id => next.objects[id]?.state === "pulled")) return next;
  next = complete(next, response.secret);
  return next;
}

/** Advance active-play clocks, and the exposed trapdoor's walking trigger. */
export function tickSecrets(p: SecretProgress, dt: number, player: { x: number; z: number }): SecretProgress {
  let next = p;
  for (const o of ELEMENT_OBJECTS) {
    if (next.secrets.includes(secretOf(o))) continue;
    const s = next.objects[o.id];
    if (!s) continue;
    if (s.remaining !== undefined) {
      const remaining = Math.max(0, s.remaining - dt);
      next = { ...next, objects: { ...next.objects, [o.id]: remaining > 1e-9 ? { ...s, remaining } : { state: o.id === "emberThicket" ? "burnt" : "intact" } } };
      if (remaining <= 1e-9 && o.id === "emberThicket") next = complete(next, o.id);
    }
    if (o.id === "puffLeaves" && s.state === "cleared" && Math.hypot(player.x - o.x, player.z - o.z) <= o.r + .35) next = complete(next, o.id);
  }
  return next;
}
