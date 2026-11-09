import { describe, expect, it } from "vitest";
import { BEACON } from "../game/world/cloudisle";
import { CAMERA_PROFILES, DEFAULT_CAMERA, GROVE_FERRY_SHOT, cameraProfileAt, type CameraPoint } from "./cameraProfiles";
import { CANOPY_ROPES, CLIFF_ROPE, streamY, zoneAt } from "../game/world/lowland";
import { GROVE_STREAM_FERRY } from "../game/world/groveStream";
import { GATE_PILLARS, groundY } from "../game/world/island";
import * as THREE from "three";

const point = (x: number, z: number, cloud = false, y = 0): CameraPoint => ({ x, z, y, cloud, climbing: false });

describe("authored camera profiles", () => {
  it("frames both entrance ferry banks and Bubbo's whole body and rider from one fixed side-on lens", () => {
    const north = GROVE_STREAM_FERRY.north, south = GROVE_STREAM_FERRY.south;
    const middle = { x: (north.x + south.x) / 2, z: (north.z + south.z) / 2 };
    expect(cameraProfileAt(point(north.x, north.z)).id).toBe("forest-left-arm");
    expect(cameraProfileAt(point(south.x, south.z)).id).toBe("flooded-grove");
    expect(cameraProfileAt(point(65.2, -206.8)).id).toBe("forest-left-arm");
    expect(GROVE_FERRY_SHOT.pos.x).toBeLessThan(north.x - 10);
    expect(Math.abs(GROVE_FERRY_SHOT.pos.z - middle.z)).toBeLessThan(2);
    for (const aspect of [1366 / 768, 1280 / 800]) {
      const camera = new THREE.PerspectiveCamera(GROVE_FERRY_SHOT.fov, aspect, .1, 900);
      const { pos, target } = GROVE_FERRY_SHOT;
      camera.position.set(pos.x, pos.y, pos.z);
      camera.lookAt(target.x, target.y, target.z);
      camera.updateMatrixWorld();
      // Bank margins, Bubbo's feet/body, and the mounted player's head. Both
      // directions traverse precisely this envelope with no camera reversal.
      const samples = [north, middle, south, { ...north, x: north.x + 1.05 }, { ...south, x: south.x + 1.05 }].flatMap(stand => [-1, 0, 1].flatMap(dx => [-.8, .8].flatMap(dz =>
        [-.05, 1.2, 2.8].map(height => ({ x: stand.x + dx, z: stand.z + dz, y: Math.max(groundY(stand.x, stand.z), streamY(stand.x, stand.z)) + height })))));
      for (const sample of samples) {
        const projected = new THREE.Vector3(sample.x, sample.y, sample.z).project(camera);
        const context = `aspect=${aspect}, sample=${JSON.stringify(sample)}`;
        expect(Math.abs(projected.x), context).toBeLessThan(.9);
        expect(Math.abs(projected.y), context).toBeLessThan(.9);
        expect(projected.z, context).toBeGreaterThan(-1);
        expect(projected.z, context).toBeLessThan(1);
      }
    }
  });

  it("uses identical fixed framing throughout the Causeway and its rope-foot pocket", () => {
    const expected = { yaw: 0, pitch: .8, dist: 10.5, ahead: 1 };
    let samples = 0;
    for (let x = 45; x <= 114; x += 1) for (let z = -265; z <= -241; z += 1) {
      if (zoneAt(x, z) !== "causeway") continue;
      const profile = cameraProfileAt(point(x, z));
      expect(profile.id, `${x},${z}`).toBe("ruined-causeway");
      expect(profile).toMatchObject({ ...expected, kind: "lowland" });
      expect(profile.resolve).toBeUndefined();
      expect(profile.trackYaw).toBeUndefined();
      samples++;
    }
    expect(samples).toBeGreaterThan(1000);
    for (const x of [92, 96, 100]) for (const z of [-244, -242, -241]) {
      expect(cameraProfileAt(point(x, z))).toMatchObject({ id: "ruined-causeway", ...expected });
    }
  });

  it("uses the exit-rope profile only while climbing and returns to the fixed Causeway lens", () => {
    const r = CANOPY_ROPES.exit;
    const ground = point(r.foot.x, r.foot.z);
    const climbing = { ...point(r.x, r.bodyZ), climbing: true };
    const rope = cameraProfileAt(climbing, cameraProfileAt(ground));
    expect(rope.id).toBe("causeway-exit-rope");
    expect(rope.kind).toBe("rope");
    expect(rope.contains(ground, 100)).toBe(false);
    expect(cameraProfileAt(ground, rope).id).toBe("ruined-causeway");
  });

  it("switches at the Grove door plane and retains both views throughout a ±0.9m walk", () => {
    const plane = -241.4;
    const grove = cameraProfileAt(point(56, plane + .01));
    const causeway = cameraProfileAt(point(56, plane - .01));
    expect(grove.id).toBe("flooded-grove");
    expect(causeway.id).toBe("ruined-causeway");
    for (const initial of [grove, causeway]) {
      let profile = initial;
      for (let i = 0; i < 300; i++) {
        profile = cameraProfileAt(point(56, plane + Math.sin(i) * .9), profile);
        expect(profile).toBe(initial);
      }
    }
    expect(cameraProfileAt(point(56, plane - 1.01), grove)).toBe(causeway);
    expect(cameraProfileAt(point(56, plane + 1.01), causeway)).toBe(grove);
  });

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
    for (const [x, z] of [[8, BEACON.z], [-8, BEACON.z], [0, (BEACON.z + 8)], [0, (BEACON.z - 8)]]) {
      const p = point(x, z, true, 37);
      const profile = cameraProfileAt(p);
      expect(profile.id).toBe("beacon-arena");
      const frame = profile.resolve!(p, DEFAULT_CAMERA);
      expect(Math.sin(frame.yaw) * x + Math.cos(frame.yaw) * (z - BEACON.z)).toBeGreaterThan(7.9);
      expect(profile.resolve!(point(0, BEACON.z, true, 37), frame).yaw).toBe(frame.yaw);
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
