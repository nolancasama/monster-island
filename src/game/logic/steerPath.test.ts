import { expect, it } from "vitest";
import { floatBarrelGeometry, rockGeometry } from "../../scene/models/pirateShip";
import { MOORED_POSE, boatFootprint } from "../flow/voyageEncounter";
import { BOAT_HALF_BEAM } from "../world/gullBoat";
import { BOW_Z, SHIP, STEER_LANE, hullHalf } from "../world/pirateShip";
import {
  SHIP_OBSTACLE_SCALE, STEER_ANSWER_Z, STEER_APPROACH_SECONDS, STEER_CONTACT_GAP, STEER_MESH_RADIUS, STEER_PASS_Z,
  makeSteerPath, sampleSteerPath, steerClearance, steerShoulder,
} from "./steerPath";
import { steer, type Lane, type SteerCommand } from "./voyage";

const lanes: Lane[] = [-1, 0, 1];
const commands: SteerCommand[] = ["turnLeft", "goStraight", "turnRight"];
const kinds = ["rock", "barrel"] as const;
const boat = boatFootprint(MOORED_POSE);
const boatMinX = Math.min(...boat.map(([x]) => x - SHIP.x));
const boatMaxX = Math.max(...boat.map(([x]) => x - SHIP.x));
const boatMinZ = Math.min(...boat.map(([, z]) => z - SHIP.z));
const boatMaxZ = Math.max(...boat.map(([, z]) => z - SHIP.z));

it("bounds the rendered obstacle meshes, including a rolling barrel", () => {
  for (const kind of kinds) {
    const geometry = kind === "rock" ? rockGeometry() : floatBarrelGeometry();
    const p = geometry.attributes.position;
    let radius = 0;
    for (let i = 0; i < p.count; i++) {
      radius = Math.max(radius, Math.hypot(p.getX(i), p.getZ(i), kind === "barrel" ? p.getY(i) : 0));
    }
    expect(radius).toBeLessThanOrEqual(STEER_MESH_RADIUS[kind]);
    geometry.dispose();
  }
});

it("measures signed clearance from the actual hull in the yawed frame", () => {
  const x = hullHalf(0) + 4, z = 0, yaw = 0.12;
  const measured = steerClearance(x, z, 0, "rock", false);
  expect(measured).toBeGreaterThan(0);
  expect(steerClearance(x * Math.cos(yaw), -x * Math.sin(yaw), yaw, "rock", false)).toBeCloseTo(measured);
  expect(steerClearance(hullHalf(-13) - 0.1, -13, 0, "rock", false)).toBeLessThan(0);
});

it("uses the fixed boat outline only while Gull is moored", () => {
  const x = MOORED_POSE.x - SHIP.x, z = MOORED_POSE.z - SHIP.z;
  const radius = STEER_MESH_RADIUS.rock * SHIP_OBSTACLE_SCALE + 0.25;
  expect(steerClearance(x, z, 0, "rock", false)).toBeGreaterThan(0);
  expect(steerClearance(x, z, 0.12, "rock", true)).toBeCloseTo(-BOAT_HALF_BEAM - radius);
  expect(steerClearance(boatMaxX + radius + 1, z, -0.12, "rock", true)).toBeCloseTo(1);
  expect(makeSteerPath(0, 0, "turnLeft", "rock", false).endX).toBe(STEER_LANE);
});

for (const kind of kinds) for (const start of lanes) for (const obstacle of lanes) for (const command of commands) {
  const end = steer(start, command);
  const safe = end !== obstacle;
  it(`${kind}, lane ${start} to ${end}, obstacle ${obstacle}, ${command} (${safe ? "safe" : "bump"})`, () => {
    const path = makeSteerPath(start, obstacle, command, kind, true);
    const frame = sampleSteerPath(path, 0);
    const approach = makeSteerPath(start, obstacle, "goStraight", kind, true);
    expect(sampleSteerPath(path, STEER_APPROACH_SECONDS).x).toBe(sampleSteerPath(approach, STEER_APPROACH_SECONDS).x);
    const targetX = (obstacle - end) * STEER_LANE;
    const radius = STEER_MESH_RADIUS[kind] * SHIP_OBSTACLE_SCALE + 0.25;
    const direction = Math.sign(start - end);
    let lastX = frame.x - steerShoulder(path, frame.t), min = Infinity, minBoat = Infinity, turn = 0, bank = 0, wobble = 0;

    for (let i = 0; i <= Math.ceil(path.duration * 60); i++) {
      sampleSteerPath(path, i / 60, frame);
      min = Math.min(min, frame.clearance);
      // The mooring heading is π, so the world-aligned bounds of its footprint
      // give an independent distance check at every sample, including turns.
      const boatDx = Math.max(0, boatMinX - frame.x, frame.x - boatMaxX);
      const boatDz = Math.max(0, boatMinZ - frame.z, frame.z - boatMaxZ);
      minBoat = Math.min(minBoat, Math.hypot(boatDx, boatDz) - radius);
      // A wrong answer then slides onto the bow's port shoulder while braking (seen from the
      // steering camera); the lane rules below are about the lane drift, so test them without it.
      const lane = frame.x - steerShoulder(path, frame.t);
      expect(direction * (lane - lastX)).toBeGreaterThanOrEqual(-1e-9);
      if (!direction || frame.phase === "steer-approach") expect(lane).toBe(path.startX);
      if (!path.safe && (frame.phase === "steer-bump" || frame.phase === "steer-retreat")) {
        expect(frame.x).toBeCloseTo(path.endX + path.contactX, 9);
        if (frame.phase === "steer-bump") expect(frame.clearance).toBeLessThan(0.1);
      }
      if (frame.z >= BOW_Z - 8) {
        expect(lane).toBeCloseTo(path.endX, 9);
        expect(Math.abs(frame.yaw)).toBe(0);
      }
      turn = Math.max(turn, frame.yaw * direction);
      if (frame.phase === "steer-pass") bank = Math.max(bank, frame.roll * direction);
      if (frame.phase === "steer-bump") wobble = Math.max(wobble, Math.abs(frame.roll));
      lastX = lane;
    }
    expect(path.safe).toBe(safe);
    if (targetX > 0) expect(path.endX).toBeGreaterThanOrEqual(Math.max(targetX, boatMaxX + radius));
    else expect(path.endX).toBe(targetX);
    expect(Math.abs(frame.yaw)).toBe(0);
    expect(Math.abs(frame.roll)).toBe(0);
    expect(turn > 0).toBe(direction !== 0);
    expect(bank > 0).toBe(direction !== 0);
    if (safe) {
      expect(min).toBeGreaterThan(0);
      expect(minBoat).toBeGreaterThan(0);
      expect(frame.z).toBeCloseTo(STEER_PASS_Z);
      expect(wobble).toBe(0);
    } else {
      expect(min).toBeGreaterThanOrEqual(0);
      expect(minBoat).toBeGreaterThanOrEqual(0);
      expect(min).toBeCloseTo(STEER_CONTACT_GAP, 6);
      expect(wobble).toBeGreaterThan(0);
      expect(frame.z).toBeLessThan(path.contactZ - 10);

      // The failed command still changes the logical lane. A fresh attempt starts
      // at the new relative offset with no turn or wobble from the last sample.
      const retryLane: Lane = end === 0 ? 1 : 0;
      const retry = makeSteerPath(end, retryLane, "goStraight", kind, true);
      sampleSteerPath(path, path.contactTime + 0.1, frame);
      expect(frame.roll).not.toBe(0);
      expect(sampleSteerPath(retry, 0, frame)).toBe(frame);
      expect(frame).toEqual(sampleSteerPath(retry, 0));
      expect(frame.x).toBe(retry.startX);
      expect(frame.z).toBe(-110);
      expect(frame.phase).toBe("steer-approach");
      expect(sampleSteerPath(retry, STEER_APPROACH_SECONDS).z).toBe(STEER_ANSWER_Z);
      for (let i = 0; i <= Math.ceil(retry.duration * 60); i++) {
        expect(sampleSteerPath(retry, i / 60, frame).clearance).toBeGreaterThan(0);
      }
    }
  });
}
