import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { rt } from "../game/runtime";
import { getGame } from "../game/store";
import { BOULDERS, MONSTER_STONE, TUNNEL, groundY, inTunnel, tunnelCoverY } from "../game/world/island";

import { CLIFF_ROPE, MOSSY_BOULDERS } from "../game/world/lowland";
import { CAMERA_BLEND_SECONDS, DEFAULT_CAMERA, cameraProfileAt, type CameraProfile, type Framing } from "./cameraProfiles";

const tunnelRoof = groundY(TUNNEL.x, TUNNEL.z1) + TUNNEL.roof;
import { MONSTERS } from "../game/data/monsters";
import { updateOccluderFade } from "./materials";

/** The live camera, for projecting world labels to the screen. */
export const cameraRef: { current: THREE.PerspectiveCamera | null } = { current: null };

/** Height (px) of the prompt / dialogue stack at the bottom of the screen, kept by the UI. */
export const bottomPanel = { height: 0 };

/**
 * Third-person camera: steady and smoothed, no bobbing or automatic spinning.
 * Authored zone profiles blend over a second; scripted shots retain their
 * own cameras. Movement reads the rendered view throughout each handoff.
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
  const profile = useRef<CameraProfile | undefined>(undefined);
  const framing = useRef<Framing>({ ...DEFAULT_CAMERA });
  const blendFrom = useRef<Framing>({ ...DEFAULT_CAMERA });
  const blendAge = useRef(CAMERA_BLEND_SECONDS);
  const ropeAge = useRef(0);
  const ropeOffset = useMemo(() => new THREE.Vector3(), []);
  const ropeLook = useMemo(() => new THREE.Vector3(), []);
  const ropeShot = useRef(rt.camera.shot);

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
    const p = rt.player;
    const cloud = g.screen === "game" && g.progress.act3.world === "cloud";
    const rope = g.screen === "game" && p.climbY !== null && p.z < -140;
    const wasRope = c.framing === "rope";
    const leavingRope = !rope && (wasRope || c.shot !== null && c.shot === ropeShot.current);
    const point = { x: p.x, y: p.y, z: p.z, climbing: p.climbY !== null, cloud };
    const selected = cameraProfileAt(point, c.snap ? undefined : profile.current);
    const lowland = selected.kind === "lowland" && !rope && (c.mode === "follow" || leavingRope);
    const tunnel = selected.kind === "tunnel";
    if (selected !== profile.current || c.snap) {
      blendFrom.current = { ...framing.current };
      blendAge.current = c.snap ? CAMERA_BLEND_SECONDS : 0;
      profile.current = selected;
    }
    const target = selected.resolve?.(point, framing.current) ?? selected;
    blendAge.current = Math.min(CAMERA_BLEND_SECONDS, blendAge.current + dt);
    const t = blendAge.current / CAMERA_BLEND_SECONDS;
    const e = t * t * (3 - 2 * t);
    const from = blendFrom.current;
    const yawDelta = Math.atan2(Math.sin(target.yaw - from.yaw), Math.cos(target.yaw - from.yaw));
    framing.current = { yaw: from.yaw + yawDelta * e, pitch: from.pitch + (target.pitch - from.pitch) * e,
      dist: from.dist + (target.dist - from.dist) * e, ahead: from.ahead + (target.ahead - from.ahead) * e };
    // Radial framing continues tracking gently after a zone blend has ended.
    if (t === 1) framing.current.yaw = target.yaw;
    if (selected.trackYaw && t === 1) {
      const d = Math.atan2(Math.sin(target.yaw - c.yaw), Math.cos(target.yaw - c.yaw));
      framing.current.yaw = c.snap ? target.yaw : c.yaw + d * (1 - Math.exp(-dt * 3));
    }
    c.profile = selected.id;
    if (rope && !wasRope) {
      ropeAge.current = 0;
      ropeOffset.set(pos.current.x - p.x, pos.current.y - p.y, pos.current.z - p.z);
      ropeLook.set(look.current.x - p.x, look.current.y - p.y, look.current.z - p.z);
    }
    c.settled = false;
    if (g.screen === "title") {
      c.framing = "title";
      // A slow drift along the beach behind the title card.
      const t = rt.time * 0.04;
      want.current.set(-14 + Math.sin(t) * 10, 4.6, 13 + Math.cos(t * 0.7) * 1.5);
      wantLook.current.set(-14 + Math.sin(t) * 8, 1.4, -2);
    } else if (g.screen === "results") {
      c.framing = "results";
      const t = rt.time * 0.08;
      const s = g.progress.endings >= 3 ? MONSTERS.lumo.home : MONSTER_STONE;
      const gy = groundY(s.x, s.z);
      want.current.set(s.x + Math.sin(t) * 9, gy + 4, s.z + 3 + Math.cos(t) * 9);
      wantLook.current.set(s.x, gy + 1.6, s.z);
    } else if (rope) {
      c.framing = "rope";
      ropeShot.current = c.shot;
      // A fixed offset travels with the climber; interpolation affects only
      // the handoff, so ascent and descent have exactly the same framing.
      c.yaw = selected.yaw;
      c.pitch = selected.pitch;
      c.dist = selected.dist;
      const horizontal = selected.dist * Math.cos(selected.pitch);
      want.current.set(p.x + Math.sin(selected.yaw) * horizontal, p.y + 1.1 + selected.dist * Math.sin(selected.pitch), p.z + Math.cos(selected.yaw) * horizontal);
      wantLook.current.set(p.x, p.y + 1.1, p.z);
    } else if (c.mode === "shot" && c.shot && !leavingRope) {
      c.framing = "shot";
      want.current.set(c.shot.pos.x, c.shot.pos.y, c.shot.pos.z);
      wantLook.current.set(c.shot.target.x, c.shot.target.y, c.shot.target.z);
    } else {
      c.framing = cloud ? "cloud" : lowland ? "lowland" : "fixed";
      c.yaw = framing.current.yaw;
      c.pitch = framing.current.pitch;
      c.dist = framing.current.dist;
      const focus = typeof selected.anchor === "function" ? selected.anchor(point, framing.current) : selected.anchor ?? p;
      const ty = (selected.anchor ? groundY(focus.x, focus.z) : p.y) + 1.1;
      const dist = c.dist;
      const pitch = c.pitch;
      const horiz = dist * Math.cos(pitch);
      const ahead = framing.current.ahead;
      want.current.set(focus.x + Math.sin(c.yaw) * (horiz - ahead), ty + dist * Math.sin(pitch), focus.z + Math.cos(c.yaw) * (horiz - ahead));
      wantLook.current.set(focus.x - Math.sin(c.yaw) * ahead, ty, focus.z - Math.cos(c.yaw) * ahead);
      // Physical clearance also applies during blends through either portal.
      const tunnelClearance = !cloud && (tunnel || inTunnel(want.current.x, want.current.z, -0.2));
      if (tunnelClearance) {
        const roof = tunnelRoof - 0.55;
        const side = TUNNEL.half - 0.6;
        const cx = Math.max(TUNNEL.x - side, Math.min(TUNNEL.x + side, want.current.x));
        want.current.x = cx;
        want.current.y = Math.min(want.current.y, roof);
      }
      if (lowland) {
        // Banks only pull the camera in or lift it a bounded amount. The
        // close endpoint also keeps the cliff behind the camera at its foot.
        // The cliff closes the lowland's north side: near its foot the lens
        // comes in towards the player (same height, same heading) instead of
        // sitting inside the rock.
        want.current.z = Math.min(want.current.z, CLIFF_ROPE.faceZ - 1.4);
        const minZ = want.current.z - 2.5;
        const dx = p.x - CLIFF_ROPE.x;
        // Leave room behind the lens for the rope, including its knots.
        let ropeLimit = Infinity;
        if (Math.abs(dx) < 1.1 && wantLook.current.z < CLIFF_ROPE.hangZ) {
          ropeLimit = CLIFF_ROPE.hangZ - Math.sqrt(1.1 ** 2 - dx ** 2);
          want.current.z = Math.max(minZ, Math.min(want.current.z, ropeLimit));
        }
        let up = lift(wantLook.current, want.current);
        for (const f of [0.94, 0.88, 0.8, (dist - 2.5) / dist]) {
          if (up <= 1.5) break;
          probe2.set(p.x, ty + Math.sin(pitch) * dist * f, Math.max(minZ, Math.min(p.z - ahead + Math.cos(pitch) * dist * f, ropeLimit, CLIFF_ROPE.faceZ - 1.4)));
          const shorter = lift(wantLook.current, probe2);
          if (shorter < up) {
            want.current.copy(probe2);
            up = shorter;
          }
        }
        want.current.y += Math.min(1.5, up);
      } else if (!cloud && !tunnelClearance) {
        // Against the mountain (the volcano's flank, the ridge) the view
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
        want.current.y += Math.min(up, 8);
      }
    }
    if (!rope && !lowland && !rt.voyage.active) {
      const floor = Math.max(groundY(want.current.x, want.current.z), -0.4) + 0.7;
      if (want.current.y < floor) want.current.y = floor;
    }
    if (!ready.current || rt.voyage.active || c.snap && !rope && !leavingRope) {
      pos.current.copy(want.current);
      look.current.copy(wantLook.current);
      ready.current = true;
    }
    c.snap = false;
    const k = 1 - Math.exp(-dt * ((c.mode === "follow" || leavingRope) && g.screen === "game" ? 6 : 2.4));
    if (rope) {
      ropeAge.current = Math.min(0.75, ropeAge.current + dt);
      const t = ropeAge.current / 0.75;
      const e = t * t * (3 - 2 * t);
      pos.current.set(p.x + ropeOffset.x * (1 - e) + (want.current.x - p.x) * e, p.y + ropeOffset.y * (1 - e) + (want.current.y - p.y) * e, p.z + ropeOffset.z * (1 - e) + (want.current.z - p.z) * e);
      look.current.set(p.x + ropeLook.x * (1 - e), p.y + ropeLook.y * (1 - e) + 1.1 * e, p.z + ropeLook.z * (1 - e));
      c.settled = t === 1;
    } else {
      pos.current.lerp(want.current, k);
      look.current.lerp(wantLook.current, k);
      if (!lowland && !rt.voyage.active) pos.current.y = Math.max(pos.current.y, groundY(pos.current.x, pos.current.z) + 0.7);
      c.settled = blendAge.current === CAMERA_BLEND_SECONDS && pos.current.distanceTo(want.current) < 0.08 && look.current.distanceTo(wantLook.current) < 0.08;
    }
    if (!cloud && g.screen === "game" && (c.mode === "follow" || leavingRope) && inTunnel(pos.current.x, pos.current.z, -.2)) {
      pos.current.y = Math.min(pos.current.y, tunnelRoof - .55);
    }
    camera.position.copy(pos.current);
    camera.lookAt(look.current);
    // Lens shift: while a prompt or line covers the bottom of the screen, the
    // view slides up by half its height (at most 30% of the screen), so the
    // monster being talked to stays above the panel. No perspective change.
    const cam = camera as THREE.PerspectiveCamera;
    // The mountain's real beacon and the nearby player need a taller sky view
    // than the lowland. Physical follow offsets remain exactly the same.
    const fov = cloud || c.framing === "fixed" || lowland ? selected.fov ?? 55 : rt.voyage.active ? 65 : 55;
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    const h = window.innerHeight;
    const wantShift = (c.framing === "cloud" || c.framing === "fixed" || lowland ? h * (selected.viewShift ?? 0) : 0) + (g.screen === "game" && bottomPanel.height > 0 ? Math.min(bottomPanel.height * 0.5, h * 0.3) : 0);
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
