import { debugEnabled } from "./debugAccess";
import { useDebug } from "./debugState";
import { cb } from "./combat";
import { MAX_HP, MAX_MP, COMPANION_IDS } from "./data/combat";
import { MONSTER_ORDER } from "./data/monsters";
import { getGame, setGame } from "./store";
import { rt } from "./runtime";
import { standY } from "./world/collision";
import { clearSave } from "./logic/save";
import { jumpDebug, nearestDebugGround } from "./debugTravel";
import { newProgress } from "./logic/progress";
export { debugKillZone } from "./combat";

export function debugHeal() {
  if (!debugEnabled) return;
  cb.vitals = { hp: MAX_HP, mp: Object.fromEntries(COMPANION_IDS.map(id => [id, MAX_MP])) as typeof cb.vitals.mp };
  cb.knockedOut = false;
}

export function debugUnlockFriends() {
  if (!debugEnabled) return;
  const p = getGame().progress;
  const monsters = { ...p.monsters };
  for (const id of MONSTER_ORDER) monsters[id] = { ...monsters[id], discovered: true, friend: true, invited: true };
  setGame({ progress: { ...p, monsters, active: p.active ?? "leafy" } });
}

export function setDebugNoclip(noclip: boolean) {
  if (!debugEnabled) return;
  useDebug.setState({ noclip });
  rt.player.riding = false;
  rt.player.climbY = null;
  if (!noclip) {
    const p = getGame().progress;
    const at = nearestDebugGround(rt.player.x, rt.player.z);
    rt.player.x = at.x; rt.player.z = at.z;
    rt.player.y = standY(at.x, at.z, p.solved);
    rt.camera.snap = true;
  }
}

export function resetDebugSave() {
  if (!debugEnabled) return;
  setGame({ progress: newProgress() });
  jumpDebug("beach");
  clearSave();
  setGame({ hasSave: false });
}
