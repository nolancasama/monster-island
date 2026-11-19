import { expect, it } from "vitest";
import { floatBarrelGeometry, rockGeometry } from "../../scene/models/pirateShip";
import { BOW_Z, STEER_LANE, hullHalf } from "../world/pirateShip";
import {
  STEER_ANSWER_Z, STEER_APPROACH_SECONDS, STEER_CONTACT_GAP, STEER_MESH_RADIUS, STEER_PASS_Z,
  makeSteerPath, sampleSteerPath, steerClearance,
} from "./steerPath";
import { steer, type Lane, type SteerCommand } from "./voyage";

const lanes: Lane[] = [-1, 0, 1];
const commands: SteerCommand[] = ["turnLeft", "goStraight", "turnRight"];
const kinds = ["rock", "barrel"] as const;

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
  const measured = steerClearance(x, z, 0, "rock");
  expect(measured).toBeGreaterThan(0);
  expect(steerClearance(x * Math.cos(yaw), -x * Math.sin(yaw), yaw, "rock")).toBeCloseTo(measured);
  expect(steerClearance(hullHalf(-13) - 0.1, -13, 0, "rock")).toBeLessThan(0);
});

for (const kind of kinds) for (const start of lanes) for (const obstacle of lanes) for (const command of commands) {
  const end = steer(start, command);
  const safe = end !== obstacle;
  it(`${kind}, lane ${start} to ${end}, obstacle ${obstacle}, ${command} (${safe ? "safe" : "bump"})`, () => {
    const path = makeSteerPath(start, obstacle, command, kind);
    const frame = sampleSteerPath(path, 0);
    const targetX = (obstacle - end) * STEER_LANE;
    const direction = Math.sign(start - end);
    let lastX = frame.x, min = Infinity, turn = 0, bank = 0, wobble = 0;

    for (let i = 0; i <= Math.ceil(path.duration * 60); i++) {
      sampleSteerPath(path, i / 60, frame);
      min = Math.min(min, frame.clearance);
      expect(direction * (frame.x - lastX)).toBeGreaterThanOrEqual(-1e-9);
      if (!direction || frame.phase === "steer-approach") expect(frame.x).toBe(path.startX);
      if (frame.z >= BOW_Z - 8) {
        expect(frame.x).toBe(targetX);
        expect(Math.abs(frame.yaw)).toBe(0);
      }
      turn = Math.max(turn, frame.yaw * direction);
      if (frame.phase === "steer-pass") bank = Math.max(bank, frame.roll * direction);
      if (frame.phase === "steer-bump") wobble = Math.max(wobble, Math.abs(frame.roll));
      lastX = frame.x;
    }
    expect(path.safe).toBe(safe);
    expect(Math.abs(frame.yaw)).toBe(0);
    expect(Math.abs(frame.roll)).toBe(0);
    expect(turn > 0).toBe(direction !== 0);
    expect(bank > 0).toBe(direction !== 0);
    if (safe) {
      expect(min).toBeGreaterThan(0);
      expect(frame.z).toBeCloseTo(STEER_PASS_Z);
      expect(wobble).toBe(0);
    } else {
      expect(min).toBeGreaterThanOrEqual(0);
      expect(min).toBeCloseTo(STEER_CONTACT_GAP, 6);
      expect(wobble).toBeGreaterThan(0);
      expect(frame.z).toBeLessThan(path.contactZ - 10);

      // The failed command still changes the logical lane. A fresh attempt starts
      // at the new relative offset with no turn or wobble from the last sample.
      const retryLane: Lane = end === 0 ? 1 : 0;
      const retry = makeSteerPath(end, retryLane, "goStraight", kind);
      sampleSteerPath(path, path.contactTime + 0.1, frame);
      expect(frame.roll).not.toBe(0);
      expect(sampleSteerPath(retry, 0, frame)).toBe(frame);
      expect(frame).toEqual(sampleSteerPath(retry, 0));
      expect(frame.x).toBe((retryLane - end) * STEER_LANE);
      expect(frame.z).toBe(-110);
      expect(frame.phase).toBe("steer-approach");
      expect(sampleSteerPath(retry, STEER_APPROACH_SECONDS).z).toBe(STEER_ANSWER_Z);
      for (let i = 0; i <= Math.ceil(retry.duration * 60); i++) {
        expect(sampleSteerPath(retry, i / 60, frame).clearance).toBeGreaterThan(0);
      }
    }
  });
}
