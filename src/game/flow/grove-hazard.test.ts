import { afterEach, expect, it, vi } from "vitest";
import { basicAttack, cb, combatTick, resetCombat } from "../combat";
import { newProgress } from "../logic/progress";
import { hazardAt } from "../logic/elements";
import { resetRuntime, rt } from "../runtime";
import { getGame, setGame } from "../store";
import { ISLET, POND, STAGES } from "../world/lowland";
import { region } from "../world/region";

vi.mock("../../audio/audio", () => ({ audio: { play: vi.fn(), voice: vi.fn(), startMusic: vi.fn() } }));
afterEach(() => { resetRuntime(); resetCombat(); cb.onScreen = null; region.world = "home"; setGame({ screen: "title", progress: newProgress() }); });

it("still splashes enemies knocked into deep pond water after all pads settle", () => {
  resetRuntime();
  const progress = newProgress();
  progress.act2.started = progress.act2.descended = true;
  progress.act2.cleared = [...STAGES];
  progress.active = "puff";
  progress.solved = ["groveLilies"];
  setGame({ screen: "game", mode: "explore", journalOpen: false, settingsOpen: false, progress });
  region.world = "home"; resetCombat(); cb.onScreen = () => true;
  rt.time = rt.playTime = 10;
  rt.act2Unlock.groveLilies = 1;
  expect(hazardAt(ISLET.x, ISLET.z, "home", progress.solved)).toBeNull();
  expect(hazardAt(POND.x + POND.r - .5, POND.z, "home", progress.solved)?.kind).toBe("splash");
  for (const e of cb.enemies) e.state = "gone";
  const e = cb.enemies.find(e => e.zone === "grove")!;
  Object.assign(e, { kind: "snapjaw", x: POND.x + POND.r + .2, z: POND.z, hp: 100, state: "recover", timer: 99 });
  Object.assign(rt.player, { x: e.x + 2, z: e.z, yaw: -Math.PI / 2, climbY: null });
  cb.zones.current = "grove";
  cb.stance.friend = "puff"; cb.stance.k = 1; cb.ready.basic = 0;
  expect(basicAttack()).toBe(true);
  for (let i = 0; i < 9; i++) { rt.time += 1 / 60; rt.playTime += 1 / 60; combatTick(1 / 60); }
  expect(e.state).toBe("ko");
  expect(cb.fx.some(f => f.kind === "splashKo")).toBe(true);
  expect(getGame().progress.solved).toContain("groveLilies");
});
