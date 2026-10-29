import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { LOWLAND_CAMERA, rt } from "../game/runtime";
import { getGame } from "../game/store";
import { BOULDERS, MONSTER_STONE, TUNNEL, groundY, inTunnel, tunnelCoverY } from "../game/world/island";

import { CLIFF_ROPE, MOSSY_BOULDERS, inLowland } from "../game/world/lowland";

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
    const lowland = !cloud && g.screen === "game" && !rope && (c.mode === "follow" || leavingRope) && inLowland(p.x, p.z);
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
      c.yaw = Math.atan2(5, -8);
      c.pitch = Math.atan2(2.9, Math.hypot(5, 8));
      c.dist = Math.hypot(5, 8, 2.9);
      want.current.set(p.x + 5, p.y + 4, p.z - 8);
      wantLook.current.set(p.x, p.y + 1.1, p.z);
    } else if (c.mode === "shot" && c.shot && !leavingRope) {
      c.framing = "shot";
      want.current.set(c.shot.pos.x, c.shot.pos.y, c.shot.pos.z);
      wantLook.current.set(c.shot.target.x, c.shot.target.y, c.shot.target.z);
    } else {
      c.framing = cloud ? "cloud" : lowland ? "lowland" : "orbit";
      // There is no room behind the player at the foot of the cliff, so over
      // the last few metres the view tips down onto the player (same heading).
      const nearCliff = lowland ? THREE.MathUtils.smoothstep(p.z, CLIFF_ROPE.foot.z - 6, CLIFF_ROPE.foot.z - 1) : 0;
      if (lowland || cloud) {
        c.yaw = cloud ? Math.PI : LOWLAND_CAMERA.yaw;
        c.pitch = LOWLAND_CAMERA.pitch + (1.15 - LOWLAND_CAMERA.pitch) * nearCliff;
        c.dist = LOWLAND_CAMERA.dist - 2 * nearCliff;
      }
      const ty = p.y + 1.1;
      // In the tunnel the orbit turns to look along the passage, comes in
      // closer and lower, and stays under the roof. It blends in and out
      // over about a second, and the yaw it leaves behind is the yaw it
      // used, so leaving never swings the view (or the controls) around.
      const inside = !cloud && !lowland && Math.abs(p.x - TUNNEL.x) < TUNNEL.half + 0.6 && p.z < TUNNEL.z1 + 0.8 && p.z > TUNNEL.z0 - 1.2;
      tunnel.current += ((inside ? 1 : 0) - tunnel.current) * Math.min(1, dt * 2.5);
      let k = tunnel.current < 0.002 ? 0 : tunnel.current;
      if (k > 0) {
        const d = Math.atan2(Math.sin(-c.yaw), Math.cos(-c.yaw));
        c.yaw += d * Math.min(1, dt * 4 * k);
      }
      const dist = c.dist + (3.4 - c.dist) * k;
      const pitch = c.pitch + (0.24 - c.pitch) * k;
      const horiz = dist * Math.cos(pitch);
      const ahead = lowland || cloud ? LOWLAND_CAMERA.ahead * (1 - nearCliff) : 0;
      want.current.set(p.x + Math.sin(c.yaw) * (horiz - ahead), ty + dist * Math.sin(pitch), p.z + Math.cos(c.yaw) * (horiz - ahead));
      wantLook.current.set(p.x - Math.sin(c.yaw) * ahead, ty, p.z - Math.cos(c.yaw) * ahead);
      // A camera inside the passage (just outside its portals the orbit can
      // swing in) stays under the roof and between the walls.
      if (!cloud && inTunnel(want.current.x, want.current.z, -0.2)) k = Math.max(k, 1);
      if (k > 0) {
        const roof = tunnelRoof - 0.55;
        const side = TUNNEL.half - 0.6;
        const cx = Math.max(TUNNEL.x - side, Math.min(TUNNEL.x + side, want.current.x));
        want.current.x += (cx - want.current.x) * k;
        if (want.current.y > roof) want.current.y += (roof - want.current.y) * k;
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
      } else if (!cloud && k < 1) {
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
      pos.current.set(p.x + ropeOffset.x * (1 - e) + 5 * e, p.y + ropeOffset.y * (1 - e) + 4 * e, p.z + ropeOffset.z * (1 - e) - 8 * e);
      look.current.set(p.x + ropeLook.x * (1 - e), p.y + ropeLook.y * (1 - e) + 1.1 * e, p.z + ropeLook.z * (1 - e));
      c.settled = t === 1;
    } else {
      pos.current.lerp(want.current, k);
      look.current.lerp(wantLook.current, k);
      if (!lowland && !rt.voyage.active) pos.current.y = Math.max(pos.current.y, groundY(pos.current.x, pos.current.z) + 0.7);
      c.settled = pos.current.distanceTo(want.current) < 0.08 && look.current.distanceTo(wantLook.current) < 0.08;
    }
    camera.position.copy(pos.current);
    camera.lookAt(look.current);
    // Lens shift: while a prompt or line covers the bottom of the screen, the
    // view slides up by half its height (at most 30% of the screen), so the
    // monster being talked to stays above the panel. No perspective change.
    const cam = camera as THREE.PerspectiveCamera;
    // The mountain's real beacon and the nearby player need a taller sky view
    // than the lowland. Physical follow offsets remain exactly the same.
    const fov = cloud ? 80 : rt.voyage.active ? 65 : 55;
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    const h = window.innerHeight;
    const wantShift = (cloud && c.framing === "cloud" ? -h * .2 : 0) + (g.screen === "game" && bottomPanel.height > 0 ? Math.min(bottomPanel.height * 0.5, h * 0.3) : 0);
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
