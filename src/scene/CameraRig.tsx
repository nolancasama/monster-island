import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { rt } from "../game/runtime";
import { getGame } from "../game/store";
import { BOULDERS, CAVE, MONSTER_STONE, groundY } from "../game/world/island";
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
  const ready = useRef(false);
  const shift = useRef(0);

  /** Raise the endpoint until the whole target-to-camera line clears the ground and the big rocks. */
  const lift = (target: THREE.Vector3, candidate: THREE.Vector3): number => {
    let up = 0;
    for (let i = 2; i <= 14; i++) {
      const u = i / 14;
      probe.lerpVectors(target, candidate, u);
      let floor = groundY(probe.x, probe.z) + 0.7;
      for (const b of BOULDERS) {
        const d = Math.hypot(probe.x - b.x, probe.z - b.z);
        if (d < b.r * 1.1) floor = Math.max(floor, groundY(b.x, b.z) + b.h * 0.95 * Math.sqrt(1 - (d / (b.r * 1.1)) ** 2) + 0.6);
      }
      const lineY = probe.y + up * u;
      if (lineY < floor) up += (floor - lineY) / u;
    }
    return Math.min(up, 8);
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
      const horiz = c.dist * Math.cos(c.pitch);
      want.current.set(p.x + Math.sin(c.yaw) * horiz, ty + c.dist * Math.sin(c.pitch), p.z + Math.cos(c.yaw) * horiz);
      wantLook.current.set(p.x, ty, p.z);
      if (p.z < CAVE.z - 1 && p.z > CAVE.z - 27 && Math.abs(p.x - CAVE.x) < 3) {
        // Keep the follow camera beneath the solid tunnel roof while walking through it.
        want.current.set(Math.max(CAVE.x - 2.4, Math.min(CAVE.x + 2.4, p.x)), groundY(CAVE.x, CAVE.z) + 3.4, Math.min(CAVE.z - 0.4, p.z + 3));
        pos.current.x = Math.max(CAVE.x - 2.4, Math.min(CAVE.x + 2.4, pos.current.x));
        pos.current.y = Math.min(pos.current.y, groundY(CAVE.x, CAVE.z) + 3.7);
      } else {
        want.current.y += lift(wantLook.current, want.current);
      }
    }
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
