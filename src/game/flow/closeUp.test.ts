import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rt } from "../runtime";
import { resetVoyageRt, vy, type CrewId } from "../voyageRt";
import { COMPANION_IDS } from "../data/combat";
import { DECK_Y, MASTS, SHIP, SPOT } from "../world/pirateShip";
import { CLOSE_UP_EASE, FACE_Y, SAIL_SPANS, closeUp, closeUpEase, closeUpFraming, endCloseUp, lensOnDeck, lineClear, type Blocker } from "./closeUp";
import { HUDDLE, HUDDLE_PARTY, HUDDLE_PIRATES, PEPPER_LEAN, crewHome, huddleUp } from "./voyage";

vi.mock("../../audio/audio", () => ({ audio: { play: vi.fn(), voice: vi.fn(), startMusic: vi.fn(), cancelPanic: vi.fn(), stopFlame: vi.fn() } }));

const person = (p: { x: number; z: number }, top = 1.75): Blocker => ({ x: p.x, z: p.z, r: 0.5, top });
const huddle: Blocker[] = [
  person(HUDDLE_PARTY.player),
  ...(["gull", ...COMPANION_IDS] as const).map((id) => person(HUDDLE_PARTY[id], 1.45)),
  ...Object.entries(HUDDLE_PIRATES).filter(([id]) => id !== "redbeard").map(([, p]) => person(p, 2.05)),
];
const finaleCrew: Blocker[] = [[2.4, 8.4], [-2.4, 8.4], [-3.9, 9.6], [3.9, 9.6], [4.5, 6.4], [-4.5, 6.6], [4.8, 4.4]].map(([x, z]) => person({ x, z }, 2.05));
const finalePlayer = { x: 0, z: 5.6 };
const pepperBlockers: Blocker[] = [
  { ...HUDDLE_PARTY.player, r: 0.45, top: 1.75 },
  { ...HUDDLE_PARTY.gull, r: 0.45, top: 2.05 },
  ...COMPANION_IDS.map((id) => ({ ...HUDDLE_PARTY[id], r: 0.55, top: 1.45 })),
  ...Object.entries(HUDDLE_PIRATES).filter(([id]) => id !== "pepper").map(([, p]) => ({ ...p, r: 0.45, top: 2.05 })),
];

/** Each subject's spot, facing target, and the other people on deck. */
const SCENES: Array<{ name: string; at: { x: number; z: number }; player: { x: number; z: number }; people: Blocker[] }> = [
  { name: "huddle", at: HUDDLE_PIRATES.redbeard, player: HUDDLE_PARTY.player, people: huddle },
  { name: "Pepper leans in", at: PEPPER_LEAN, player: HUDDLE, people: pepperBlockers },
  { name: "at the helm, player aft", at: SPOT.captain, player: { x: -1.2, z: 13.6 }, people: [person({ x: -1.2, z: 13.6 })] },
  { name: "at the helm, player forward", at: SPOT.captain, player: { x: -2.2, z: 9.4 }, people: [person({ x: -2.2, z: 9.4 })] },
  { name: "at the helm, player abeam", at: SPOT.captain, player: { x: 0.2, z: 11.2 }, people: [person({ x: 0.2, z: 11.2 })] },
  { name: "finale", at: { x: 0, z: 9.2 }, player: finalePlayer, people: [person(finalePlayer), ...finaleCrew] },
];

describe("close-up framing", () => {
  for (const s of SCENES) for (const side of [1, -1]) {
    it(`${s.name} (side ${side}): lens on deck, line to the face clear, upper body in view`, () => {
      const f = closeUpFraming(s.at, s.player, side, s.people);
      expect(f).not.toBeNull();
      const { pos, target } = f!;
      expect(lensOnDeck(pos.x, pos.z)).toBe(true);
      expect(lineClear(pos, { x: s.at.x, y: FACE_Y, z: s.at.z }, s.people)).toBe(true);
      for (const span of SAIL_SPANS) expect(pos.x > span.x0 && pos.x < span.x1 && pos.z > span.z0 && pos.z < span.z1 && pos.y > span.y0).toBe(false);
      for (const m of Object.values(MASTS)) expect(Math.hypot(pos.x - m.x, pos.z - m.z)).toBeGreaterThan(0.6);
      // Medium close-up: a few metres from the face, looking at the subject.
      const d = Math.hypot(pos.x - s.at.x, pos.z - s.at.z);
      expect(d).toBeGreaterThan(1.4);
      expect(d).toBeLessThan(2.1);
      expect(target.x).toBe(s.at.x);
      expect(target.z).toBe(s.at.z);
      // Three-quarter: off the subject's line of sight by 25-70 degrees.
      const toPlayer = Math.atan2(s.player.x - s.at.x, s.player.z - s.at.z), toLens = Math.atan2(pos.x - s.at.x, pos.z - s.at.z);
      const off = Math.abs(Math.atan2(Math.sin(toLens - toPlayer), Math.cos(toLens - toPlayer))) * 180 / Math.PI;
      expect(off).toBeGreaterThan(25);
      expect(off).toBeLessThan(70);
    });
  }

  it("rejects a line through the mizzen mast, and falls back when nothing is clear", () => {
    const m = MASTS.mizzen;
    expect(lineClear({ x: m.x, y: 1.9, z: m.z - 2 }, { x: m.x, y: FACE_Y, z: m.z + 2 }, [])).toBe(false);
    const wall: Blocker[] = Array.from({ length: 36 }, (_, i) => ({ x: Math.sin(i / 36 * Math.PI * 2) * 1.2, z: 0 + Math.cos(i / 36 * Math.PI * 2) * 1.2, r: 0.4, top: 3 }));
    expect(closeUpFraming({ x: 0, z: 0 }, { x: 0, z: 3 }, 1, wall)).toBeNull();
  });

  /** The face's screen row with the rig's lens (55° fov) and its panel shift (half the panel, at most 30%). */
  const faceRow = (f: NonNullable<ReturnType<typeof closeUpFraming>>, w: number, h: number, panel: number) => {
    const cam = new THREE.PerspectiveCamera(55, w / h, 0.1, 500);
    cam.position.set(f.pos.x, f.pos.y, f.pos.z);
    cam.lookAt(f.target.x, f.target.y, f.target.z);
    cam.setViewOffset(w, h, 0, Math.min(panel * 0.5, h * 0.3), w, h);
    cam.updateMatrixWorld();
    const face = new THREE.Vector3(f.target.x, FACE_Y, f.target.z).project(cam);
    return (1 - face.y) / 2 * h;
  };
  for (const [w, h] of [[1366, 768], [1280, 800]]) for (const panel of [0, 180, 260]) {
    it(`face in the upper middle, above a ${panel}px panel at ${w}x${h}`, () => {
      for (const s of SCENES) {
        const f = closeUpFraming(s.at, s.player, 1, s.people)!;
        const row = faceRow(f, w, h, panel);
        expect(row).toBeGreaterThan(h * 0.12);
        expect(row).toBeLessThan(Math.min(h * 0.5, h - panel - 40));
      }
    });
  }
});

describe("close-up blend", () => {
  it("is monotonic and ends exactly at the target", () => {
    let last = -1;
    for (let i = 0; i <= 100; i++) {
      const e = closeUpEase(i / 100);
      expect(e).toBeGreaterThanOrEqual(last);
      last = e;
    }
    expect(closeUpEase(0)).toBe(0);
    expect(closeUpEase(1)).toBe(1);
    expect(closeUpEase(1.4)).toBe(1);
    expect(CLOSE_UP_EASE).toBeGreaterThanOrEqual(0.6);
    expect(CLOSE_UP_EASE).toBeLessThanOrEqual(0.9);
  });
});

describe("closeUp / endCloseUp", () => {
  beforeEach(() => {
    resetVoyageRt();
    huddleUp();
    rt.camera.ease = 0;
    rt.camera.snap = false;
  });

  it("frames Redbeard and restores the previous shot", () => {
    const before = { pos: { x: SHIP.x + 6, y: DECK_Y + 5, z: SHIP.z + 10 }, target: { x: SHIP.x, y: DECK_Y + 1, z: SHIP.z + 6 } };
    rt.camera.mode = "shot";
    rt.camera.shot = before;
    rt.camera.pos = { ...before.pos };
    closeUp("redbeard");
    expect(rt.camera.mode).toBe("shot");
    expect(rt.camera.ease).toBe(CLOSE_UP_EASE);
    const rb = vy.crew.redbeard;
    expect(rt.camera.shot!.target.x).toBeCloseTo(SHIP.x + rb.x);
    expect(rt.camera.shot!.target.z).toBeCloseTo(SHIP.z + rb.z);
    expect(Math.hypot(rt.camera.shot!.pos.x - SHIP.x - rb.x, rt.camera.shot!.pos.z - SHIP.z - rb.z)).toBeLessThan(2.1);
    rt.camera.ease = 0;
    endCloseUp();
    expect(rt.camera.mode).toBe("shot");
    expect(rt.camera.shot).toEqual(before);
    expect(rt.camera.ease).toBe(CLOSE_UP_EASE);
  });

  it("restores follow, and a cut close-up behind a fade snaps", () => {
    crewHome();
    rt.camera.mode = "follow";
    rt.camera.shot = null;
    closeUp("redbeard" as CrewId, { cut: true });
    expect(rt.camera.snap).toBe(true);
    expect(rt.camera.ease).toBe(0);
    endCloseUp();
    expect(rt.camera.mode).toBe("follow");
    expect(rt.camera.shot).toBeNull();
  });

  it("frames Pepper's leaned-in face and returns to the wide shot", () => {
    const before = { pos: { x: SHIP.x + 4.6, y: DECK_Y + 4.35, z: SHIP.z + 9.3 }, target: { x: SHIP.x + HUDDLE.x, y: DECK_Y + 0.8, z: SHIP.z + 5.45 } };
    Object.assign(vy.crew.pepper, PEPPER_LEAN);
    rt.camera.mode = "shot";
    rt.camera.shot = before;
    rt.camera.pos = { ...before.pos };
    closeUp("pepper");
    const { pos, target } = rt.camera.shot!;
    expect(target.x).toBeCloseTo(SHIP.x + PEPPER_LEAN.x);
    expect(target.z).toBeCloseTo(SHIP.z + PEPPER_LEAN.z);
    expect(lineClear({ x: pos.x - SHIP.x, y: pos.y - DECK_Y, z: pos.z - SHIP.z }, { ...PEPPER_LEAN, y: FACE_Y }, pepperBlockers)).toBe(true);
    endCloseUp();
    expect(rt.camera.shot).toEqual(before);
  });

  it("does not restore a stale camera once a flow has moved on", () => {
    rt.camera.mode = "follow";
    rt.camera.shot = null;
    closeUp("redbeard");
    const later = { pos: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 } };
    rt.camera.shot = later;
    endCloseUp();
    expect(rt.camera.shot).toBe(later);
    expect(rt.camera.mode).toBe("shot");
  });
});
