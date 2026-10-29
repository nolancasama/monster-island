import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { rt } from "../game/runtime";
import { getGame } from "../game/store";
import { BOULDERS, MONSTER_STONE, TUNNEL, groundY, inTunnel, tunnelCoverY } from "../game/world/island";

import { PASSAGE_DEPTH, TRANSITIONS, passageLocal, passagePoint, type TransitionEnd } from "../game/world/transitions";
import { currentZone } from "../game/combat";
import { MOSSY_BOULDERS, CLIFF_ROPE } from "../game/world/lowland";

const tunnelRoof = groundY(TUNNEL.x, TUNNEL.z1) + TUNNEL.roof;
import { MONSTERS } from "../game/data/monsters";
import { updateOccluderFade } from "./materials";

/** The live camera, for projecting world labels to the screen. */
export const cameraRef: { current: THREE.PerspectiveCamera | null } = { current: null };

/** Height (px) of the prompt / dialogue stack at the bottom of the screen, kept by the UI. */
export const bottomPanel = { height: 0 };

/**
 * Third-person camera: steady and smoothed, no bobbing or automatic spinning.
 * Drag turns it. It rises over the ridge rocks rather than clipping into
 * them, and scripted shots (conversations, powers, the ending) ease in.
 */
export function CameraRig() {
  const { camera } = useThree();
  const pos = useRef(new THREE.Vector3(0, 6, 20));
  const look = useRef(new THREE.Vector3());
  const want = useRef(new THREE.Vector3());
  const wantLook = useRef(new THREE.Vector3());
  const probe = useMemo(() => new THREE.Vector3(), []);
  const probe2 = useMemo(() => new THREE.Vector3(), []);
  const ready = useRef(false);
  const shift = useRef(0);
  /** 0..1: how far the follow camera has settled into the tunnel framing. */
  const tunnel = useRef(0);

  /** Raise the endpoint until the whole target-to-camera line clears the ground and the big rocks. */
  const lift = (target: THREE.Vector3, candidate: THREE.Vector3): number => {
    let up = 0;
    for (let i = 2; i <= 14; i++) {
      const u = i / 14;
      probe.lerpVectors(target, candidate, u);
      const lineY0 = probe.y + up * u;
      // The ridge over the tunnel is solid rock above the passage; the lined
      // passage itself is open space a camera may look through.
      const cover = tunnelCoverY(probe.x, probe.z);
      const open = cover !== null && inTunnel(probe.x, probe.z, 0.4) && lineY0 < tunnelRoof - 0.4;
      let floor = (cover !== null && !open ? cover : groundY(probe.x, probe.z)) + 0.7;
      for (const b of (rt.player.z < -153.6 ? MOSSY_BOULDERS : BOULDERS)) {
        const d = Math.hypot(probe.x - b.x, probe.z - b.z);
        if (d < b.r * 1.1) floor = Math.max(floor, groundY(b.x, b.z) + b.h * 0.95 * Math.sqrt(1 - (d / (b.r * 1.1)) ** 2) + 0.6);
      }
      const lineY = probe.y + up * u;
      if (lineY < floor) up += (floor - lineY) / u;
    }
    return up;
  };

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    cameraRef.current = camera as THREE.PerspectiveCamera;
    const c = rt.camera;
    const g = getGame();
    if (g.screen === "title") {
      // A slow drift along the beach behind the title card.
      const t = rt.time * 0.04;
      want.current.set(-14 + Math.sin(t) * 10, 4.6, 13 + Math.cos(t * 0.7) * 1.5);
      wantLook.current.set(-14 + Math.sin(t) * 8, 1.4, -2);
    } else if (g.screen === "results") {
      const t = rt.time * 0.08;
      const s = g.progress.endings >= 3 ? MONSTERS.lumo.home : MONSTER_STONE;
      const gy = groundY(s.x, s.z);
      want.current.set(s.x + Math.sin(t) * 9, gy + 4, s.z + 3 + Math.cos(t) * 9);
      wantLook.current.set(s.x, gy + 1.6, s.z);
    } else if (c.mode === "shot" && c.shot) {
      want.current.set(c.shot.pos.x, c.shot.pos.y, c.shot.pos.z);
      wantLook.current.set(c.shot.target.x, c.shot.target.y, c.shot.target.z);
    } else {
      const p = rt.player;
      const ty = p.y + 1.1;
      // In the tunnel the orbit turns to look along the passage, comes in
      // closer and lower, and stays under the roof. It blends in and out
      // over about a second, and the yaw it leaves behind is the yaw it
      // used, so leaving never swings the view (or the controls) around.
      const inside = Math.abs(p.x - TUNNEL.x) < TUNNEL.half + 0.6 && p.z < TUNNEL.z1 + 0.8 && p.z > TUNNEL.z0 - 1.2;
      tunnel.current += ((inside ? 1 : 0) - tunnel.current) * Math.min(1, dt * 2.5);
      let k = tunnel.current < 0.002 ? 0 : tunnel.current;
      if (k > 0) {
        const d = Math.atan2(Math.sin(-c.yaw), Math.cos(-c.yaw));
        c.yaw += d * Math.min(1, dt * 4 * k);
      }
      const dist = c.dist + (3.4 - c.dist) * k;
      const pitch = c.pitch + (0.24 - c.pitch) * k;
      const horiz = dist * Math.cos(pitch);
      want.current.set(p.x + Math.sin(c.yaw) * horiz, ty + dist * Math.sin(pitch), p.z + Math.cos(c.yaw) * horiz);
      wantLook.current.set(p.x, ty, p.z);
      // A camera inside the passage (just outside its portals the orbit can
      // swing in) stays under the roof and between the walls.
      if (inTunnel(want.current.x, want.current.z, -0.2)) k = Math.max(k, 1);
      if (k > 0) {
        const roof = tunnelRoof - 0.55;
        const side = TUNNEL.half - 0.6;
        const cx = Math.max(TUNNEL.x - side, Math.min(TUNNEL.x + side, want.current.x));
        want.current.x += (cx - want.current.x) * k;
        if (want.current.y > roof) want.current.y += (roof - want.current.y) * k;
      }
      if (k < 1) {
        // Against the mountain (the volcano's flank, the ridge) the orbit
        // comes in closer rather than climbing tens of metres up the rock;
        // small things like the beach ridge are still risen over.
        let up = lift(wantLook.current, want.current);
        for (const f of [0.75, 0.55, 0.4, 0.28]) {
          if (up < 6) break;
          probe2.lerpVectors(wantLook.current, want.current, f);
          const shorter = lift(wantLook.current, probe2);
          if (shorter < up) {
            want.current.copy(probe2);
            up = shorter;
          }
        }
        want.current.y += Math.min(up, 8) * (1 - k);
      }
    }
    // Arrival faces out of the passage, so the follow camera sits inside its
    // chamber. Keep framing that mouth until both the desired and smoothed
    // camera have left it; the walking pocket alone excludes the arrival pad.
    let mouth: TransitionEnd | null = null, mouthDistance = Infinity;
    if (g.screen === "game" && g.progress.act2.started && rt.player.climbY === null) {
      const zone = currentZone();
      for (const passage of TRANSITIONS) for (const end of [passage.a,passage.b]) {
        if (end.zone !== zone) continue;
        const q = passageLocal(end,rt.player.x,rt.player.z);
        if (q.depth < -Math.max(c.dist+1,3) || q.depth > PASSAGE_DEPTH || Math.abs(q.lateral)>3.4) continue;
        const desired = passageLocal(end,want.current.x,want.current.z);
        const smoothed = passageLocal(end,pos.current.x,pos.current.z);
        if (q.depth < -.2 && desired.depth < -.5 && smoothed.depth < -.5) continue;
        const distance = Math.hypot(q.depth,q.lateral);
        if (distance < mouthDistance) { mouth=end; mouthDistance=distance; }
      }
    }
    const clampMouth = (v:THREE.Vector3) => {
      if(!mouth)return;
      const q=passageLocal(mouth,v.x,v.z);
      // The cap starts at depth 2.59. Staying below the arch's shoulders also
      // leaves headroom for a rider. A player stepping sideways out of the
      // opening needs the camera outside its front instead of behind a wall.
      const playerSide = passageLocal(mouth,rt.player.x,rt.player.z).lateral;
      const maxDepth = Math.abs(playerSide)>1.2 ? -.6 : 2;
      const p=passagePoint(mouth,Math.min(q.depth,maxDepth),Math.max(-1.2,Math.min(1.2,q.lateral)));
      v.x=p.x;v.z=p.z;
      const floor=groundY(mouth.x,mouth.z);
      v.y=Math.max(floor+1.3,Math.min(floor+2.6,v.y));
    };
    clampMouth(want.current);
    const floor = Math.max(groundY(want.current.x, want.current.z), -0.4) + 0.7;
    if (want.current.y < floor) want.current.y = floor;
    if (!ready.current || c.snap) {
      pos.current.copy(want.current);
      look.current.copy(wantLook.current);
      ready.current = true;
      c.snap = false;
    }
    const k = 1 - Math.exp(-dt * (c.mode === "follow" && g.screen === "game" ? 6 : 2.4));
    pos.current.lerp(want.current, k);
    look.current.lerp(wantLook.current, k);
    if (rt.player.climbY !== null && rt.player.z < -150) {
      pos.current.z = Math.min(pos.current.z, CLIFF_ROPE.hangZ - 2.2);
      pos.current.x = Math.max(CLIFF_ROPE.x - 5.5, Math.min(CLIFF_ROPE.x + 5.5,pos.current.x));
    }
    pos.current.y = Math.max(pos.current.y, groundY(pos.current.x,pos.current.z)+.7);
    clampMouth(pos.current);
    camera.position.copy(pos.current);
    camera.lookAt(look.current);
    // Lens shift: while a prompt or line covers the bottom of the screen, the
    // view slides up by half its height (at most 30% of the screen), so the
    // monster being talked to stays above the panel. No perspective change.
    const cam = camera as THREE.PerspectiveCamera;
    const h = window.innerHeight;
    const wantShift = g.screen === "game" && bottomPanel.height > 0 ? Math.min(bottomPanel.height * 0.5, h * 0.3) : 0;
    shift.current += (wantShift - shift.current) * Math.min(1, dt * 5);
    if (Math.abs(shift.current) > 0.5) {
      cam.setViewOffset(window.innerWidth, h, 0, shift.current, window.innerWidth, h);
    } else if (cam.view) {
      cam.clearViewOffset();
    }
    updateOccluderFade(camera, probe.set(rt.player.x, rt.player.y + 1, rt.player.z), g.screen === "game");
    c.pos.x = pos.current.x;
    c.pos.y = pos.current.y;
    c.pos.z = pos.current.z;
    c.target.x = look.current.x;
    c.target.y = look.current.y;
    c.target.z = look.current.z;
  });
  return null;
}
