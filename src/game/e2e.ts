import { getGame, setGame } from "./store";
import { rt } from "./runtime";
import { seedChoices } from "./flow/ask";
import { objective } from "./logic/progress";
import { PLAYER_R, nearestWalkable } from "./world/collision";
import { CROSSING, FALLEN_PALM, FOOD_SOURCES, MAPLE, MONSTER_STONE } from "./world/island";
import { LIVE_MONSTERS } from "./data/monsters";
import { cameraRef } from "../scene/CameraRig";
import { dprState, perf } from "../scene/GameScene";
import * as THREE from "three";

/**
 * Test hook (only with ?e2e=1): read game state and put the player next to
 * things, so Playwright drives the real UI (keys, clicks) without steering.
 */
export function installE2eHook(seed: number) {
  seedChoices(seed);
  const place = (x: number, z: number, faceX: number, faceZ: number) => {
    const p = nearestWalkable(x, z, PLAYER_R, { solved: getGame().progress.solved });
    rt.player.x = p.x;
    rt.player.z = p.z;
    rt.player.vx = rt.player.vz = 0;
    rt.player.yaw = Math.atan2(faceX - p.x, faceZ - p.z);
    rt.camera.snap = true;
    return p;
  };
  const target = (name: string): { x: number; z: number } | null => {
    if (name === "maple") return { x: rt.maple.x, z: rt.maple.z };
    if (name === "palm") return { x: FALLEN_PALM.x - 1, z: FALLEN_PALM.z };
    if (name === "river") return CROSSING.west;
    if (name === "stone") return MONSTER_STONE;
    if ((LIVE_MONSTERS as string[]).includes(name)) return rt.monsters[name as keyof typeof rt.monsters];
    const src = FOOD_SOURCES.find((s) => s.id === name || s.food === name);
    return src ?? null;
  };
  const api = {
    state() {
      const g = getGame();
      return {
        screen: g.screen,
        mode: g.mode,
        micState: g.micState,
        progress: g.progress,
        objective: objective(g.progress),
        focus: g.focus ? { id: g.focus.id, kind: g.focus.kind } : null,
        journalOpen: g.journalOpen,
        discovering: g.discovering,
        friendCard: g.friendCard,
        prompt: g.prompt
          ? {
              id: g.prompt.id,
              kind: g.prompt.kind,
              status: g.prompt.status,
              buttons: g.prompt.buttons,
              misses: g.prompt.misses,
              sentences: g.prompt.sentences.map((s) => s.en),
              choices: g.prompt.choices.map((c) => c.id),
              question: g.prompt.question?.en ?? null
            }
          : null,
        line: g.line ? { by: g.line.by, en: g.line.en } : null,
        player: { x: rt.player.x, z: rt.player.z, y: rt.player.y, riding: rt.player.riding },
        monsters: Object.fromEntries(LIVE_MONSTERS.map((id) => [id, { x: rt.monsters[id].x, z: rt.monsters[id].z, mode: rt.monsters[id].mode }])),
        palm: rt.palm,
        stones: rt.stones,
        perf: { ...perf, dpr: dprState.dpr, dprDropped: dprState.dropped }
      };
    },
    /** Stand next to a named thing (a monster, a food, maple, palm, river, stone), facing it. */
    goTo(name: string, dist = 1.6) {
      const t = target(name);
      if (!t) throw new Error(`no target ${name}`);
      const a = Math.atan2(rt.player.x - t.x, rt.player.z - t.z);
      const near = name === "river" ? { x: t.x - 0.2, z: t.z } : { x: t.x + Math.sin(a) * dist, z: t.z + Math.cos(a) * dist };
      return place(near.x, near.z, name === "river" ? CROSSING.east.x : t.x, name === "river" ? CROSSING.east.z : t.z);
    },
    teleport(x: number, z: number, yaw = 0) {
      place(x, z, x + Math.sin(yaw), z + Math.cos(yaw));
    },
    /** Pin the camera (screenshots). */
    look(pos: [number, number, number], at: [number, number, number]) {
      rt.camera.mode = "shot";
      rt.camera.shot = { pos: { x: pos[0], y: pos[1], z: pos[2] }, target: { x: at[0], y: at[1], z: at[2] } };
      rt.camera.snap = true;
    },
    follow() {
      rt.camera.mode = "follow";
      rt.camera.shot = null;
      rt.camera.snap = true;
    },
    setCamera(yaw: number, pitch: number, dist: number) {
      rt.camera.yaw = yaw;
      rt.camera.pitch = pitch;
      rt.camera.dist = dist;
      rt.camera.snap = true;
    },
    /** Screen position of a world point (for tap tests). */
    project(x: number, y: number, z: number) {
      const cam = cameraRef.current;
      if (!cam) return null;
      const v = new THREE.Vector3(x, y, z).project(cam);
      return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight };
    },
    set(patch: Record<string, unknown>) {
      setGame(patch as never);
    },
    mapleHome() {
      rt.maple.x = MAPLE.x;
      rt.maple.z = MAPLE.z;
    }
  };
  (window as unknown as { __mi: typeof api }).__mi = api;
}
