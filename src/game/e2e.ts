import { getGame, setGame } from "./store";
import { rt } from "./runtime";
import { seedChoices } from "./flow/ask";
import { objective } from "./logic/progress";
import { PLAYER_R, moveCircle, gatesOf, nearestWalkable, standY } from "./world/collision";
import { BRIDGE, CLIFF_TOP_SPOT, CROSSING, FALLEN_PALM, FOOD_SOURCES, FOREST_SIGN, GATE_PILLARS, MAPLE, MONSTER_STONE, ROPE } from "./world/island";
import { LIVE_MONSTERS } from "./data/monsters";
import { cameraRef } from "../scene/CameraRig";
import { lowlandView } from "../scene/Lowland";
import { dprState, perf } from "../scene/GameScene";
import * as THREE from "three";
import { ACT2_PLACE, PHASE3_PLACE } from "./flow/obstacles";
import { cb, companionVisible, stageStatus } from "./combat";
import { travelCombat } from "./combat";
import { CLOUD_DOCK, CLOUD_SPAWNS, CLOUD_OBSTACLE_PLACE, CLOUD_PICKUPS, CLOUD_CHESTS, CLOUD_ELECTRIC_PANELS, electricPanelActive, electricPanelPhase, HOLLOW, OBSERVATORY, type CloudAreaId } from "./world/cloudisle";
import { newAct3, type Act3 } from "./logic/act3";
import { decodeSave, encodeSave } from "./logic/save";
import { cloudView } from "../scene/CloudIsle";
import { CAMP2, CHESTS, CLIFF_ROPE, FORK_SIGN, ROUTE_MARKERS, SERVICES, SHORTCUT_GATE, type ServiceId, type ZoneId } from "./world/lowland";

/**
 * Test hook (only with ?e2e=1): read game state and put the player next to
 * things, so Playwright drives the real UI (keys, clicks) without steering.
 */
export function installE2eHook(seed: number) {
  seedChoices(seed);
  const place = (x: number, z: number, faceX: number, faceZ: number) => {
    const p = nearestWalkable(x, z, PLAYER_R, gatesOf(getGame().progress));
    rt.player.x = p.x;
    rt.player.z = p.z;
    rt.player.y = standY(p.x, p.z, getGame().progress.solved);
    rt.player.vx = rt.player.vz = 0;
    rt.player.yaw = Math.atan2(faceX - p.x, faceZ - p.z);
    rt.camera.snap = true;
    return p;
  };
  const target = (name: string): { x: number; z: number } | null => {
    if (getGame().progress.act3.world === "cloud") {
      if (name.startsWith("cloud:")) return CLOUD_SPAWNS[name.slice(6) as CloudAreaId] ?? null;
      if (name in CLOUD_SPAWNS) return CLOUD_SPAWNS[name as CloudAreaId];
      if (name === "cloudGull") return CLOUD_DOCK.gull;
      if (name === "observatoryRest") return OBSERVATORY.rest;
      if (name === "beaconLift") return OBSERVATORY.lift;
      if (name === "hollowRest") return HOLLOW.rest;
      if (name === "tala" || name === "bo" || name === "kiko") return HOLLOW[name];
      if (name in CLOUD_OBSTACLE_PLACE) return CLOUD_OBSTACLE_PLACE[name as keyof typeof CLOUD_OBSTACLE_PLACE];
      const pickup = [...CLOUD_PICKUPS, ...CLOUD_CHESTS].find(p => p.id === name);
      if (pickup) return pickup;
    }
    if (name === "maple") return { x: rt.maple.x, z: rt.maple.z };
    if (name === "palm") return { x: FALLEN_PALM.x - 1, z: FALLEN_PALM.z };
    if (name === "river") return CROSSING.west;
    if (name === "stone") return MONSTER_STONE;
    if (name === "sign") return FOREST_SIGN;
    if (name === "bridge") return { x: BRIDGE.x, z: BRIDGE.z1 + 0.6 };
    if (name === "cliff" || name === "rope") return { x: ROPE.x, z: ROPE.z + 0.2 };
    if (name === "cliffTop") return CLIFF_TOP_SPOT;
    if (name in PHASE3_PLACE) return PHASE3_PLACE[name as keyof typeof PHASE3_PLACE];
    // Act 2 places.
    if (name in ACT2_PLACE) return ACT2_PLACE[name as keyof typeof ACT2_PLACE];
    if (name === "cliffDown") return { x: CLIFF_ROPE.top.x, z: CLIFF_ROPE.top.z - 0.5 };
    if (name === "cliffUp") return { x: CLIFF_ROPE.foot.x, z: CLIFF_ROPE.foot.z + 0.6 };
    if (name === "campRest") return CAMP2.rest;
    if (name === "forkSign") return FORK_SIGN;
    if (name === "lockedGate") return { x: SHORTCUT_GATE.x, z: SHORTCUT_GATE.z + 1.2 };
    if (name in SERVICES) return SERVICES[name as ServiceId].keeper;
    if (name.startsWith("zone:")) return ROUTE_MARKERS[name.slice(5) as ZoneId] ?? null;
    const chest = CHESTS.find((c) => c.id === name);
    if (chest) return chest;
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
        player: { x: rt.player.x, z: rt.player.z, y: rt.player.y, ground: standY(rt.player.x, rt.player.z, g.progress.solved), riding: rt.player.riding, climbing: rt.player.climbY !== null },
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
          framing: rt.camera.framing, settled: rt.camera.settled,
          offset: { x: rt.camera.pos.x - rt.player.x, y: rt.camera.pos.y - rt.player.y, z: rt.camera.pos.z - rt.player.z }
        },
        perf: { ...perf, dpr: dprState.dpr, dprDropped: dprState.dropped },
        lowland: { visible: lowlandView.visible, fog: { ...lowlandView.fog }, barriers: { ...lowlandView.barriers } },
        playTime: rt.playTime,
        act2: {
          scene: rt.act2Scene,
          stage: stageStatus() ? { remaining: stageStatus()!.remaining } : null,
          zone: cb.zones.current,
          stance: { friend: cb.stance.friend, k: cb.stance.k },
          hp: cb.vitals.hp,
          mp: { ...cb.vitals.mp },
          knockedOut: cb.knockedOut,
          enemies: cb.enemies.map((e) => ({ i: e.i, zone: e.zone, kind: e.kind, state: e.state, hp: e.hp, x: e.x, z: e.z })),
          drops: cb.drops.length,
          shots: cb.shots.length,
          ship: { visible: rt.ship.visible, x: rt.ship.x, y: rt.ship.y, z: rt.ship.z, cage: rt.ship.cage.visible },
          cliffRope: rt.cliffRope,
          unlock: { ...rt.act2Unlock },
          panel: g.panel,
          banner: g.banner?.title ?? null,
          hint: g.hint
        },
        act3: { scene: rt.act3Scene, world: rt.world, voyage: {...rt.voyage}, area: g.progress.act3.area, zone: cb.cloudZones.current, drawing: g.drawing, view: { ...cloudView }, mountedWorlds: cloudView.visible ? ["cloud"] : ["home"], squallLift: rt.squallLift, beacon: { ...cb.beacon, pylons: cb.beacon.pylons.map(p => ({...p})), gust: {...cb.beacon.gust}, rings: cb.beacon.rings.map(p => ({...p})) }, electricPanels: CLOUD_ELECTRIC_PANELS.map(p => ({...p, phase: electricPanelPhase(rt.time, p.phase), active: electricPanelActive(rt.time, p.phase)})) }
      };
    },
    /** Stand next to a named thing (a monster, a food, maple, palm, river, stone), facing it. */
    goTo(name: string, dist = 1.6) {
      const t = target(name);
      if (!t) throw new Error(`no target ${name}`);
      const a = Math.atan2(rt.player.x - t.x, rt.player.z - t.z);
      // Obstacles are approached from the side the player arrives on.
      // Act 2: unlocks are asked from their own standing spot; keepers are faced across their counter.
      if (name in ACT2_PLACE) {
        const f = ACT2_PLACE[name as keyof typeof ACT2_PLACE];
        const face = ({ groveLilies: { x: 39, z: -223 }, canopyVines: { x: 106, z: -218 }, canopyRope: { x: 106, z: -227.5 }, causewayGate: SHORTCUT_GATE } as Record<string, { x: number; z: number }>)[name];
        return place(f.x, f.z, face.x, face.z);
      }
      if (name in SERVICES) {
        const k = SERVICES[name as ServiceId].keeper;
        return place(k.x + Math.sin(k.yaw) * 1.7, k.z + Math.cos(k.yaw) * 1.7, k.x, k.z);
      }
      const near =
        name === "river"
          ? { x: t.x - 0.2, z: t.z }
          : name === "bridge" || name === "cliff" || name === "rope" || name in PHASE3_PLACE
            ? { x: t.x, z: t.z + dist * 0.6 }
            : { x: t.x + Math.sin(a) * dist, z: t.z + Math.cos(a) * dist };
      return place(near.x, near.z, name === "river" ? CROSSING.east.x : t.x, name === "river" ? CROSSING.east.z : t.z);
    },
    /** Collision-respecting movement probe: unlike teleport this cannot cross gates. */
    moveTo(x: number, z: number) {
      const p = rt.player;
      const q = moveCircle(p.x,p.z,x,z,PLAYER_R,gatesOf(getGame().progress));
      p.x=q.x;p.z=q.z;p.vx=p.vz=0;
      return q;
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
      return place(at.x,at.z,at.x,at.z+1);
    },
    /** Slow or freeze the game clock (0 = paused) for visual captures. */
    timeScale(k: number) {
      rt.timeScale = Math.max(0, k);
    },
    /** Match save loading's settled puzzle poses after a visual progress fixture. */
    settleAct2Unlocks() {
      const solved = getGame().progress.solved;
      for (const id of ["groveLilies", "canopyVines", "canopyRope", "causewayGate"] as const)
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
      const a = Math.atan2(rt.player.x - e.x, rt.player.z - e.z);
      return place(e.x + Math.sin(a) * dist, e.z + Math.cos(a) * dist, e.x, e.z);
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
