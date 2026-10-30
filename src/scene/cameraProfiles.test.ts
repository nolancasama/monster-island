import { describe, expect, it } from "vitest";
import { CAMERA_PROFILES, DEFAULT_CAMERA, cameraProfileAt, type CameraPoint } from "./cameraProfiles";
import { CLIFF_ROPE } from "../game/world/lowland";
import { GATE_PILLARS, groundY } from "../game/world/island";
import * as THREE from "three";

const point = (x: number, z: number, cloud = false, y = 0): CameraPoint => ({ x, z, y, cloud, climbing: false });

describe("authored camera profiles", () => {
  it("retains either side of a border until the player clears its dead band", () => {
    const glade = cameraProfileAt(point(37, -21));
    const bridge = cameraProfileAt(point(37, -26));
    expect(glade.id).toBe("forest-glade");
    expect(bridge.id).toBe("forest-bridge");
    for (const initial of [glade, bridge]) {
      let profile = initial;
      for (let i = 0; i < 300; i++) {
        profile = cameraProfileAt(point(37, -23.4 + Math.sin(i) * .3), profile);
        expect(profile).toBe(initial);
      }
    }
    expect(cameraProfileAt(point(37, -24.1), glade)).toBe(bridge);
    expect(cameraProfileAt(point(37, -22.7), bridge)).toBe(glade);
  });

  it("leaves a retained profile when changing worlds or starting/ending the rope", () => {
    const home = cameraProfileAt(point(70, -128));
    const cloud = cameraProfileAt(point(0, 20, true), home);
    expect(cloud.id).toBe("cloud");
    const ropePoint = { ...point(CLIFF_ROPE.x, -152), climbing: true };
    const rope = cameraProfileAt(ropePoint, cloud);
    expect(rope.id).toBe("cliff-rope");
    expect(cameraProfileAt(point(CLIFF_ROPE.x, CLIFF_ROPE.foot.z), rope).id).toBe("lowland-rope-foot");
  });

  it("preserves the lowland default and continuously tips down over the last five metres", () => {
    const profile = CAMERA_PROFILES.find(p => p.id === "lowland-rope-foot")!;
    expect(profile.resolve!(point(75.5, CLIFF_ROPE.foot.z - 6), DEFAULT_CAMERA)).toEqual(DEFAULT_CAMERA);
    const near = profile.resolve!(point(75.5, CLIFF_ROPE.foot.z - 1), DEFAULT_CAMERA);
    expect(near).toEqual({ yaw: 0, pitch: 1.15, dist: 8, ahead: 0 });
    const middle = profile.resolve!(point(75.5, CLIFF_ROPE.foot.z - 3.5), DEFAULT_CAMERA);
    expect(middle.pitch).toBeCloseTo(.85);
    expect(middle.dist).toBe(9);
  });

  it("keeps the beacon lens radially outside the player and holds heading near its mast", () => {
    for (const [x, z] of [[8, 169], [-8, 169], [0, 177], [0, 161]]) {
      const p = point(x, z, true, 37);
      const profile = cameraProfileAt(p);
      expect(profile.id).toBe("beacon-arena");
      const frame = profile.resolve!(p, DEFAULT_CAMERA);
      expect(Math.sin(frame.yaw) * x + Math.cos(frame.yaw) * (z - 169)).toBeGreaterThan(7.9);
      expect(profile.resolve!(point(0, 169, true, 37), frame).yaw).toBe(frame.yaw);
    }
  });

  it("has unique profile IDs and a close roof-safe tunnel framing", () => {
    expect(new Set(CAMERA_PROFILES.map(p => p.id)).size).toBe(CAMERA_PROFILES.length);
    const tunnel = cameraProfileAt(point(64, -114));
    expect(tunnel.id).toBe("volcano-tunnel");
    expect(tunnel.dist).toBe(3.4);
    expect(1.1 + Math.sin(tunnel.pitch) * tunnel.dist).toBeLessThan(4.2 - .55);
  });

  it("fits the player and all four pillar symbols from both courtyard shoulders at both sizes", () => {
    const profile = CAMERA_PROFILES.find(p => p.id === "sanctuary-courtyard")!;
    for (const aspect of [1366 / 768, 1280 / 800]) {
      for (const x of [57.5, 64, 70, 80.5, 82.5]) {
        const p = point(x, -127.2);
        expect(cameraProfileAt(p, profile).id, `courtyard approach to shoulder x=${x}`).toBe("sanctuary-courtyard");
        const frame = profile.resolve!(p, DEFAULT_CAMERA);
        const focus = typeof profile.anchor === "function" ? profile.anchor(p, frame) : profile.anchor!;
        const y = groundY(focus.x, focus.z) + 1.1;
        const horizontal = frame.dist * Math.cos(frame.pitch);
        const camera = new THREE.PerspectiveCamera(55, aspect, .1, 900);
        camera.position.set(focus.x + Math.sin(frame.yaw) * (horizontal - frame.ahead), y + Math.sin(frame.pitch) * frame.dist, focus.z + Math.cos(frame.yaw) * (horizontal - frame.ahead));
        camera.lookAt(focus.x - Math.sin(frame.yaw) * frame.ahead, y, focus.z - Math.cos(frame.yaw) * frame.ahead);
        camera.updateMatrixWorld();
        for (const sample of [{ x, z: p.z, height: .9 }, ...Object.values(GATE_PILLARS).map(pillar => ({ ...pillar, z: pillar.z + .8, height: 2 }))]) {
          const projected = new THREE.Vector3(sample.x, groundY(sample.x, sample.z) + sample.height, sample.z).project(camera);
          expect(Math.abs(projected.x), `x=${x}, aspect=${aspect}, subject=${sample.x}`).toBeLessThan(.98);
          expect(Math.abs(projected.y), `x=${x}, aspect=${aspect}, subject=${sample.x}`).toBeLessThan(.98);
        }
      }
    }
  });
});
