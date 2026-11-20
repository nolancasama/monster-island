import { expect, it } from "vitest";
import { floatBarrelGeometry, rockGeometry } from "../../scene/models/pirateShip";
import { MOORED_POSE, boatFootprint } from "../flow/voyageEncounter";
import { BOAT_HALF_BEAM } from "../world/gullBoat";
import { BOW_Z, SHIP, STEER_LANE, hullHalf } from "../world/pirateShip";
import {
  SHIP_OBSTACLE_SCALE, STEER_ANSWER_Z, STEER_APPROACH_SECONDS, STEER_CONTACT_GAP, STEER_MESH_RADIUS, STEER_PASS_Z,
  makeSteerPath, sampleSteerPath, steerClearance, steerShoulder,
} from "./steerPath";
import { SHIP_STEER_STEPS, STEER_COMMANDS, steer, type Lane } from "./voyage";

const lanes: Lane[] = [-1, 0, 1];
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
  expect(makeSteerPath({ start: 0, obstacles: [{ lane: 0, kind: "rock" }] }, "turnLeft", false).obstacles[0].endX).toBe(STEER_LANE);
});

for (const kind of kinds) for (const start of lanes) for (const obstacle of lanes) for (const command of STEER_COMMANDS) {
  const end = steer(start, command);
  const safe = end !== obstacle;
  it(`${kind}, lane ${start} to ${end}, obstacle ${obstacle}, ${command} (${safe ? "safe" : "bump"})`, () => {
    const step = { start, obstacles: [{ lane: obstacle, kind }] };
    const path = makeSteerPath(step, command, true);
    const { startX, endX } = path.obstacles[0];
    const frame = sampleSteerPath(path, 0);
    const approach = makeSteerPath(step, "goStraight", true);
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
      if (!direction || frame.phase === "steer-approach") expect(lane).toBe(startX);
      if (!path.safe && (frame.phase === "steer-bump" || frame.phase === "steer-retreat")) {
        expect(frame.x).toBeCloseTo(endX + path.contactX, 9);
        if (frame.phase === "steer-bump") expect(frame.clearance).toBeLessThan(0.1);
      }
      if (frame.z >= BOW_Z - 8) {
        expect(lane).toBeCloseTo(endX, 9);
        expect(Math.abs(frame.yaw)).toBe(0);
      }
      turn = Math.max(turn, frame.yaw * direction);
      if (frame.phase === "steer-pass") bank = Math.max(bank, frame.roll * direction);
      if (frame.phase === "steer-bump") wobble = Math.max(wobble, Math.abs(frame.roll));
      lastX = lane;
    }
    expect(path.safe).toBe(safe);
    if (targetX > 0) expect(endX).toBeGreaterThanOrEqual(Math.max(targetX, boatMaxX + radius));
    else expect(endX).toBe(targetX);
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

      // The fresh attempt restores the original obstacle position and neutral pose.
      expect(path.nextLane).toBe(start);
      const retry = makeSteerPath(step, "goStraight", true);
      sampleSteerPath(path, path.contactTime + 0.1, frame);
      expect(frame.roll).not.toBe(0);
      expect(sampleSteerPath(retry, 0, frame)).toBe(frame);
      expect(frame).toEqual(sampleSteerPath(retry, 0));
      expect(frame.x).toBe(startX);
      expect(frame.z).toBe(-110);
      expect(frame.phase).toBe("steer-approach");
      expect(sampleSteerPath(retry, STEER_APPROACH_SECONDS).z).toBe(STEER_ANSWER_Z);
    }
  });
}

it("clears both authored obstacles, or touches only the chosen obstacle", () => {
  for (const step of SHIP_STEER_STEPS) for (const command of STEER_COMMANDS) for (const moored of [false, true]) {
    const path = makeSteerPath(step, command, moored);
    const frames = step.obstacles.map((_, index) => sampleSteerPath(path, 0, undefined, index));
    for (let i = 0; i <= Math.ceil(path.duration * 60); i++) {
      for (const [index, frame] of frames.entries()) {
        sampleSteerPath(path, i / 60, frame, index);
        expect(frame.clearance).toBeGreaterThan(0);
      }
      if (frames.length === 2) expect(Math.abs(frames[0].x - frames[1].x)).toBeGreaterThan(6);
    }
    for (const [index, frame] of frames.entries()) {
      if (path.safe) {
        expect(frame.z).toBeCloseTo(STEER_PASS_Z);
      } else {
        sampleSteerPath(path, path.contactTime, frame, index);
        expect(frame.phase).toBe("steer-bump");
        if (step.obstacles[index].lane === steer(step.start, command)) {
          expect(frame.clearance).toBeCloseTo(STEER_CONTACT_GAP, 6);
        } else {
          expect(frame.clearance).toBeGreaterThan(1);
        }
      }
    }
  }
});
