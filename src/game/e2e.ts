import { placePlayer, goToTarget } from "./travel";
import type { Layer } from "./world/region";
import { cloudIsleOpen, setE2eCloudIsleShipOpen } from "./release";
import { getGame, setGame } from "./store";
import { rt } from "./runtime";
import { seedChoices } from "./flow/ask";
import { groveCrossingView, groveStreamView } from "./flow/obstacles";
import { objective } from "./logic/progress";
import { PLAYER_R, moveCircle, gatesOf, standY } from "./world/collision";
import { GATE_PILLARS, MAPLE, groundY } from "./world/island";
import { LIVE_MONSTERS } from "./data/monsters";
import { cameraRef } from "../scene/CameraRig";
import { lowlandView } from "../scene/Lowland";
import { caveView } from "../scene/Cave";
import { dprState, perf } from "../scene/GameScene";
import * as THREE from "three";
import { cb, companionVisible, elementObjectStates, stageStatus, wakeEnemy, type EnemyState } from "./combat";
import { ELEMENT_OBJECTS, SECRET_SITES, secretOf } from "./world/elementObjects";
import { ENEMIES } from "./data/combat";
import { travelCombat } from "./combat";
import { CLOUD_DOCK, CLOUD_SPAWNS, CLOUD_ELECTRIC_PANELS, electricPanelActive, electricPanelPhase, type CloudAreaId } from "./world/cloudisle";
import { newAct3, type Act3 } from "./logic/act3";
import { decodeSave, encodeSave, writeSave } from "./logic/save";
import { cloudView } from "../scene/CloudIsle";
import { gustFrame, whipFrame } from "../scene/ElementEffects";

/**
 * Test hook (only with ?e2e=1): read game state and put the player next to
 * things, so Playwright drives the real UI (keys, clicks) without steering.
 */
export function installE2eHook(seed: number) {
  seedChoices(seed);
  const api = {
    state() {
      const g = getGame();
      return {
        time: rt.time,
        cloudIsleOpen: cloudIsleOpen(),
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
        player: { layer: rt.player.layer, x: rt.player.x, z: rt.player.z, y: rt.player.y, yaw: rt.player.yaw, ground: standY(rt.player.x, rt.player.z, g.progress.solved), riding: rt.player.riding, climbing: rt.player.climbY !== null, frozen: rt.player.frozen, falling: rt.player.fall !== null, teeter: rt.player.teeter, safeGround: rt.player.safeGround },
        monsters: Object.fromEntries(
          LIVE_MONSTERS.map((id) => [id, { x: rt.monsters[id].x, z: rt.monsters[id].z, mode: rt.monsters[id].mode, visible: companionVisible(id), air: rt.monsters[id].air }])
        ),
        palm: rt.palm,
        stones: rt.stones,
        bridge: rt.bridge,
        rope: rt.rope,
        bramble: rt.bramble,
        stoneGlow: { ...rt.stoneGlow },
        lava: rt.lava,
        cave: rt.cave,
        caveWarned: rt.caveWarned,
        pillars: { ...rt.pillars },
        gate: rt.gate,
        starGlow: rt.starGlow,
        finale: rt.finale,
        camera: {
          pos: { ...rt.camera.pos }, target: { ...rt.camera.target },
          mode: rt.camera.mode, yaw: rt.camera.yaw, pitch: rt.camera.pitch, dist: rt.camera.dist,
          framing: rt.camera.framing, profile: rt.camera.profile, settled: rt.camera.settled,
          offset: { x: rt.camera.pos.x - rt.player.x, y: rt.camera.pos.y - rt.player.y, z: rt.camera.pos.z - rt.player.z }
        },
        perf: { ...perf, dpr: dprState.dpr, dprDropped: dprState.dropped },
        lowland: { visible: lowlandView.visible, fog: { ...lowlandView.fog }, barriers: { ...lowlandView.barriers } },
        playTime: rt.playTime,
        act2: {
          secrets: [...g.progress.act2.secrets],
          elementObjects: elementObjectStates(),
          scene: rt.act2Scene,
          stage: stageStatus() ? { remaining: stageStatus()!.remaining } : null,
          zone: cb.zones.current,
          stance: { friend: cb.stance.friend, k: cb.stance.k },
          hp: cb.vitals.hp,
          mp: { ...cb.vitals.mp },
          knockedOut: cb.knockedOut,
          inferno: cb.inferno ? { ...cb.inferno, held: cb.holdK } : null,
          infernoBlueBurns: cb.enemies.filter(e => e.burn && e.infernoBlueUntil > rt.time)
            .map(e => ({ enemy: e.i, until: e.infernoBlueUntil })),
          breath: cb.breath ? { ...cb.breath, held: cb.hold } : null,
          whip: cb.whip ? { ...cb.whip, strands: cb.whip.strands.map(strand => ({ ...strand })) } : null,
          whipFrame: { ...whipFrame, base: { ...whipFrame.base }, handR: { ...whipFrame.handR } },
          gustFrame: { ...gustFrame, root: { ...gustFrame.root }, beak: { ...gustFrame.beak } },
          swings: cb.enemies.filter(e => e.flight?.swing).map(e => ({
            enemy: e.i, control: e.control?.kind ?? null, centre: { x: e.flight!.x, z: e.flight!.z },
            yaw: e.flight!.yaw, victims: [...e.flight!.victims], ...e.flight!.swing
          })),
          cyclone: cb.cyclone ? { ...cb.cyclone, bubbles: [...cb.cyclone.bubbles], carried: cb.enemies.filter(e => e.control?.kind === "carried" && e.control.source === cb.cyclone!.id).map(e => e.i) } : null,
          bombChain: cb.bombChain ? { ...cb.bombChain, pops: cb.bombChain.pops.map(p => ({ ...p })), victims: [...cb.bombChain.victims] } : null,
          enemies: cb.enemies.filter(e => !e.retired).map((e) => ({ i: e.i, zone: e.zone, kind: e.kind, state: e.state, plunge: e.plunge !== null, air: e.air, control: e.control?.kind ?? null, controlUntil: e.control?.until ?? null, burning: e.burn !== null, burn: e.burn ? { ...e.burn } : null, panic: e.panic ? { ...e.panic } : null, panicResistUntil: e.panicResistUntil, fireTicks: e.fireTicks, lastFireT: e.lastFireT, resistUntil: e.resistUntil, slowUntil: e.slowUntil, hp: e.hp, x: e.x, z: e.z, yaw: e.yaw, timer: e.timer })),
          drops: cb.drops.length,
          shots: cb.shots.length,
          projectiles: cb.shots.map(s => ({ id: s.id, shape: s.shape, damage: s.damage, hostile: Boolean(s.hostile), source: s.source, x: s.x, y: s.y, z: s.z, vx: s.vx, vz: s.vz, age: s.age, life: s.life, radius: s.radius })),
          ship: { visible: rt.ship.visible, x: rt.ship.x, y: rt.ship.y, z: rt.ship.z, cage: rt.ship.cage.visible },
          cliffRope: rt.cliffRope,
          canopyAscentRope: { ...rt.canopyAscentRope },
          unlock: { ...rt.act2Unlock },
          groveCrossing: groveCrossingView.phase,
          groveStream: groveStreamView.phase,
          cave: { ...caveView },
          bubble: rt.bubbleRide.phase,
          panel: g.panel,
          banner: g.banner?.title ?? null,
          hint: g.hint
        },
        act3: { scene: rt.act3Scene, world: rt.world, voyage: {...rt.voyage}, area: g.progress.act3.area, zone: cb.cloudZones.current, drawing: g.drawing, view: { ...cloudView }, mountedWorlds: cloudView.visible ? ["cloud"] : ["home"], squallLift: rt.squallLift, beacon: { ...cb.beacon, pylons: cb.beacon.pylons.map(p => ({...p})), gust: {...cb.beacon.gust}, rings: cb.beacon.rings.map(p => ({...p})) }, electricPanels: CLOUD_ELECTRIC_PANELS.map(p => ({...p, phase: electricPanelPhase(rt.time, p.phase), active: electricPanelActive(rt.time, p.phase)})) }
      };
    },
    /** Stand next to a named thing (a monster, a food, maple, palm, river, stone), facing it. */
    goTo: goToTarget,
    /** Approach an environmental object without changing progress or its state.
     * leafyStatuesEast addresses the second statue independently. */
    nearSecret(id: string) {
      const o = ELEMENT_OBJECTS.find(o => o.id === id);
      if (!o || getGame().progress.act3.world !== o.world) throw new Error(`Secret unavailable: ${id}`);
      const at = id === "leafyStatuesEast" ? { x: 72, z: -249.5 } : SECRET_SITES[secretOf(o)].approach;
      return placePlayer(at.x, at.z, o.x, o.z);
    },
    /** Collision-respecting movement probe: unlike teleport this cannot cross gates. */
    moveTo(x: number, z: number) {
      const p = rt.player;
      const q = moveCircle(p.x,p.z,x,z,PLAYER_R,gatesOf(getGame().progress));
      p.x=q.x;p.z=q.z;p.vx=p.vz=0;
      return q;
    },
    /** Terrain height alone, ignoring decks: proves puzzle animation moves no land. */
    groundAt(x: number, z: number) { return groundY(x, z); },
    saveNow() { writeSave(encodeSave(getGame().progress, { x: rt.player.x, z: rt.player.z, yaw: rt.player.yaw }, rt.playTime)); },
    teleport(x: number, z: number, yaw = 0, snap = true, layer: Layer = "ground") {
      placePlayer(x, z, x + Math.sin(yaw), z + Math.cos(yaw), layer);
      rt.camera.snap = snap;
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
    snapCamera() {
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
    openCloudShip(open = true) {
      setE2eCloudIsleShipOpen(open);
    },
    /** Additive fixture; use the real save validator and matching physical world. */
    setAct3(patch: Partial<Act3>) {
      const g = getGame(), a = g.progress.act3 ?? newAct3();
      const next = {...a,...patch,family:{...a.family,...patch.family},errands:{...a.errands,...patch.errands}};
      const at = next.world !== a.world ? CLOUD_DOCK.spawn : rt.player;
      const validated = decodeSave(encodeSave({...g.progress,act3:next},{x:at.x,z:at.z,yaw:rt.player.yaw},rt.playTime));
      if (!validated) throw new Error("Invalid Act 3 fixture");
      rt.world = validated.progress.act3.world;
      rt.player.x = validated.player.x; rt.player.z = validated.player.z;
      setGame({progress:validated.progress}); travelCombat(); rt.camera.snap = true;
    },
    cloudArea(area: CloudAreaId) {
      if (getGame().progress.act3.world !== "cloud" || !CLOUD_SPAWNS[area]) throw new Error("Cloud world must be active");
      const at = CLOUD_SPAWNS[area];
      return placePlayer(at.x,at.z,at.x,at.z+1);
    },
    /** Slow or freeze the game clock (0 = paused) for visual captures. */
    timeScale(k: number) {
      rt.timeScale = Math.max(0, k);
    },
    /** Match save loading's settled puzzle poses after a visual progress fixture. */
    settleAct2Unlocks() {
      const solved = getGame().progress.solved;
      for (const id of ["groveLilies", "canopyVines", "canopyRope"] as const)
        rt.act2Unlock[id] = solved.includes(id) ? 1 : 0;
    },
    /** Match loaded sanctuary poses after changing only a visual fixture's solved flags. */
    settleSanctuary() {
      const solved = getGame().progress.solved;
      const ids = Object.keys(GATE_PILLARS) as Array<keyof typeof GATE_PILLARS>;
      for (const id of ids) rt.pillars[id] = solved.includes(id) ? 1 : 0;
      rt.gate = ids.every(id => solved.includes(id)) ? 1 : 0;
    },
    /** Let renderer statistics catch up after a paused visual fixture. */
    renderFrames(count = 2) {
      return new Promise<void>((resolve) => {
        const frame = () => {
          if (--count <= 0) resolve();
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
    },
    /** Act 2: stand near an enemy (by spawn index), facing it. */
    nearEnemy(i: number, dist = 3) {
      const e = cb.enemies[i];
      if (e.retired) throw new Error("This enemy spawn is retired");
      wakeEnemy(e);
      const a = Math.atan2(rt.player.x - e.x, rt.player.z - e.z);
      return placePlayer(e.x + Math.sin(a) * dist, e.z + Math.cos(a) * dist, e.x, e.z);
    },
    /** Isolate existing spawns for repeatable combat captures; no kills or rewards. */
    combatFixture(fixture: { enemies: Array<{ i: number; x: number; z: number; state?: EnemyState; timer?: number; yaw?: number }>; clearShots?: boolean }) {
      for (const e of cb.enemies) {
        if (e.retired) continue;
        const f = fixture.enemies.find(f => f.i === e.i);
        e.state = f?.state ?? (f ? "chase" : "gone");
        e.air = e.resistUntil = e.slowUntil = 0; e.burn = e.control = e.flight = e.fall = null;
        e.panic = null; e.panicResistUntil = e.fireTicks = e.infernoBlueUntil = 0; e.lastFireT = -10;
        if (!f) continue;
        wakeEnemy(e);
        e.x = e.homeX = f.x; e.z = e.homeZ = f.z;
        e.hp = ENEMIES[e.kind].hp; e.timer = f.timer ?? 0;
        e.yaw = f.yaw ?? 0; e.kx = e.kz = 0; e.waiting = false;
        e.wander = null; e.struck = false;
      }
      if (fixture.clearShots !== false) cb.shots.length = 0;
      cb.inferno = cb.cyclone = cb.bombChain = null;
      cb.breath = null;
      cb.whip = null;
      cb.fx.length = 0;
    },
    /** Act 2: set the live HP (tests of damage, eating and knock-outs). */
    setHp(hp: number) {
      cb.vitals = { ...cb.vitals, hp };
    },
    setMp(id: keyof typeof cb.vitals.mp, mp: number) {
      cb.vitals = { ...cb.vitals, mp: { ...cb.vitals.mp, [id]: mp } };
    },
    mapleHome() {
      rt.maple.x = MAPLE.x;
      rt.maple.z = MAPLE.z;
    }
  };
  (window as unknown as { __mi: typeof api }).__mi = api;
}
