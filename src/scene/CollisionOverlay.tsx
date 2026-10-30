import { useEffect, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { rt } from "../game/runtime";
import { useDebug } from "../game/debugState";
import { getGame, useGame } from "../game/store";
import { LIVE_MONSTERS, MONSTERS } from "../game/data/monsters";
import { gatesOf, PLAYER_R, solidsFor, standY, type Gates } from "../game/world/collision";
import {
  BRAMBLE, BRIDGE, CAVE, CAVE_PASSAGE, CLIFF_TOP, CROSSING, EMBER_SLOPE,
  FALLEN_PALM, FOREST_PATH, GATE_PILLARS, GLADE, HILLS, LAVA, PASS, PIER,
  RIDGE, RIVER, ROPE, SANCTUARY, SANCTUARY_GATE, STATIC_SOLIDS, VOLCANO_PATH,
  WADE, X_EAST, X_WEST, Z_NORTH, shoreZ, type SolidShape
} from "../game/world/island";

// Red = fixed solid, orange = active gate/obstacle, cyan = walkable surface,
// green = solved obstacle. The overlay is deliberately absent from normal play.
const SOLID = 0xff4969;
const ACTIVE = 0xffb12e;
const SURFACE = 0x43d9ff;
const SOLVED = 0x5dff9e;
const PLAYER = 0xffffff;
const ARC_STEPS = 24;

class Lines {
  private positions: number[] = [];
  private colors: number[] = [];
  private color = new THREE.Color();

  segment(ax: number, ay: number, az: number, bx: number, by: number, bz: number, tint: number) {
    this.positions.push(ax, ay, az, bx, by, bz);
    this.color.setHex(tint);
    for (let i = 0; i < 2; i++) this.colors.push(this.color.r, this.color.g, this.color.b);
  }

  shape(shape: SolidShape, height: (x: number, z: number) => number, tint: number) {
    if (shape.kind === "circle") {
      this.arc(shape.x, shape.z, shape.r, 0, Math.PI * 2, height, tint);
    } else if (shape.kind === "box") {
      const c = Math.cos(shape.yaw);
      const s = Math.sin(shape.yaw);
      const corners = [[-shape.hx, -shape.hz], [shape.hx, -shape.hz], [shape.hx, shape.hz], [-shape.hx, shape.hz]];
      for (let i = 0; i < 4; i++) {
        const a = corners[i];
        const b = corners[(i + 1) % 4];
        const ax = shape.x + a[0] * c + a[1] * s;
        const az = shape.z - a[0] * s + a[1] * c;
        const bx = shape.x + b[0] * c + b[1] * s;
        const bz = shape.z - b[0] * s + b[1] * c;
        this.segment(ax, height(ax, az), az, bx, height(bx, bz), bz, tint);
      }
    } else {
      const angle = Math.atan2(shape.bz - shape.az, shape.bx - shape.ax);
      const nx = -Math.sin(angle) * shape.r;
      const nz = Math.cos(angle) * shape.r;
      for (const side of [-1, 1]) {
        const ax = shape.ax + nx * side;
        const az = shape.az + nz * side;
        const bx = shape.bx + nx * side;
        const bz = shape.bz + nz * side;
        this.segment(ax, height(ax, az), az, bx, height(bx, bz), bz, tint);
      }
      this.arc(shape.ax, shape.az, shape.r, angle + Math.PI / 2, Math.PI, height, tint);
      this.arc(shape.bx, shape.bz, shape.r, angle - Math.PI / 2, Math.PI, height, tint);
    }
  }

  arc(x: number, z: number, r: number, start: number, span: number, height: (x: number, z: number) => number, tint: number) {
    for (let i = 0; i < ARC_STEPS; i++) {
      const a = start + span * i / ARC_STEPS;
      const b = start + span * (i + 1) / ARC_STEPS;
      const ax = x + Math.cos(a) * r;
      const az = z + Math.sin(a) * r;
      const bx = x + Math.cos(b) * r;
      const bz = z + Math.sin(b) * r;
      this.segment(ax, height(ax, az), az, bx, height(bx, bz), bz, tint);
    }
  }

  geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeBoundingSphere();
    return geometry;
  }
}

type Area = { x0: number; x1: number; z0: number; z1: number };

function dynamicGeometry() {
  const lines = new Lines();
  lines.arc(0, 0, PLAYER_R, 0, Math.PI * 2, () => 0, PLAYER);
  // Fixed capacity: player, Maple, and all non-companion monster circles.
  for (let i = 0; i <= LIVE_MONSTERS.length; i++) lines.arc(0, 0, 1, 0, Math.PI * 2, () => 0, SOLID);
  const geometry = lines.geometry();
  (geometry.getAttribute("position") as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  return geometry;
}

function updateRing(positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, offset: number, x: number, y: number, z: number, radius: number) {
  for (let i = 0; i < ARC_STEPS; i++) {
    const a = Math.PI * 2 * i / ARC_STEPS;
    const b = Math.PI * 2 * (i + 1) / ARC_STEPS;
    positions.setXYZ(offset++, x + Math.cos(a) * radius, y, z + Math.sin(a) * radius);
    positions.setXYZ(offset++, x + Math.cos(b) * radius, y, z + Math.sin(b) * radius);
  }
  return offset;
}

function worldGeometry(gates: Gates) {
  const lines = new Lines();
  const height = (x: number, z: number) => standY(x, z, gates.solved) + 0.07;
  const fixed = new Set(STATIC_SOLIDS);
  for (const solid of solidsFor(gates)) lines.shape(solid, height, fixed.has(solid) ? SOLID : ACTIVE);
  const area = (a: Area, open = true) => lines.shape({ kind: "box", x: (a.x0 + a.x1) / 2, z: (a.z0 + a.z1) / 2, hx: (a.x1 - a.x0) / 2, hz: (a.z1 - a.z0) / 2, yaw: 0 }, height, open ? SURFACE : ACTIVE);

  // Draw the shoreline instead of a rectangle that would imply walkable sea.
  for (const [x0, x1] of [[X_WEST, RIDGE.x0], [RIDGE.x1, RIVER.x0], [RIVER.x1, X_EAST]]) {
    lines.segment(x0, height(x0, Z_NORTH), Z_NORTH, x1, height(x1, Z_NORTH), Z_NORTH, SURFACE);
    for (const x of [x0, x1]) lines.segment(x, height(x, Z_NORTH), Z_NORTH, x, height(x, shoreZ(x) + WADE), shoreZ(x) + WADE, SURFACE);
    for (let x = x0; x < x1; x += 0.5) {
      const next = Math.min(x1, x + 0.5);
      lines.segment(x, height(x, shoreZ(x) + WADE), shoreZ(x) + WADE, next, height(next, shoreZ(next) + WADE), shoreZ(next) + WADE, SURFACE);
    }
  }
  area({ x0: RIDGE.x0, x1: RIDGE.x1, z0: PASS.z0, z1: PASS.z1 }, gates.solved.includes("fallenPalm"));
  area({ x0: PIER.x - PIER.half, x1: PIER.x + PIER.half, z0: PIER.z0, z1: PIER.z1 });
  area({ x0: RIVER.x0, x1: RIVER.x1, z0: CROSSING.z - CROSSING.half, z1: CROSSING.z + CROSSING.half }, gates.solved.includes("river"));
  for (const a of [FOREST_PATH, GLADE, HILLS]) area(a, gates.forest);
  area({ x0: BRIDGE.x - BRIDGE.half, x1: BRIDGE.x + BRIDGE.half, z0: BRIDGE.z0, z1: BRIDGE.z1 }, gates.solved.includes("bridge"));
  area(CLIFF_TOP, gates.solved.includes("cliff"));
  for (const a of [...VOLCANO_PATH, EMBER_SLOPE]) area(a, gates.volcano && gates.solved.includes("lava"));
  area(CAVE_PASSAGE, gates.solved.includes("cave"));
  area(SANCTUARY, gates.solved.includes("cave"));
  const gateOpen = Object.keys(GATE_PILLARS).every((id) => gates.solved.includes(id as keyof typeof GATE_PILLARS));
  for (const [place, open] of [
    [FALLEN_PALM, gates.solved.includes("fallenPalm")], [CROSSING, gates.solved.includes("river")],
    [BRAMBLE, gates.forest], [BRIDGE, gates.solved.includes("bridge")],
    [ROPE, gates.solved.includes("cliff")], [LAVA, gates.solved.includes("lava")],
    [CAVE, gates.solved.includes("cave")], [SANCTUARY_GATE, gateOpen]
  ] as const) {
    const x = "x" in place ? place.x : (CROSSING.west.x + CROSSING.east.x) / 2;
    const z = "z" in place ? place.z : (BRIDGE.z0 + BRIDGE.z1) / 2;
    lines.arc(x, z, 0.65, 0, Math.PI * 2, height, open ? SOLVED : ACTIVE);
  }
  for (const id of Object.keys(GATE_PILLARS) as (keyof typeof GATE_PILLARS)[]) {
    const p = GATE_PILLARS[id];
    lines.arc(p.x, p.z, 1.25, 0, Math.PI * 2, height, gates.solved.includes(id) ? SOLVED : ACTIVE);
  }
  return lines.geometry();
}

function VisibleOverlay() {
  // These are the only progress fields that change collision geometry.
  const solved = useGame((s) => s.progress.solved);
  const endings = useGame((s) => s.progress.endings);
  const geometry = useMemo(() => worldGeometry(gatesOf({ solved, endings })), [solved, endings]);
  const liveGeometry = useMemo(dynamicGeometry, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => liveGeometry.dispose(), [liveGeometry]);
  useFrame(() => {
    const progress = getGame().progress;
    const positions = liveGeometry.getAttribute("position");
    let offset = updateRing(positions, 0, rt.player.x, rt.player.y + 0.1, rt.player.z, PLAYER_R);
    offset = updateRing(positions, offset, rt.maple.x, standY(rt.maple.x, rt.maple.z, progress.solved) + 0.1, rt.maple.z, 0.4);
    for (let i = 0; i < LIVE_MONSTERS.length; i++) {
      const id = LIVE_MONSTERS[i];
      if (id === progress.active) continue;
      const monster = rt.monsters[id];
      offset = updateRing(positions, offset, monster.x, standY(monster.x, monster.z, progress.solved) + 0.1, monster.z, MONSTERS[id].radius);
    }
    liveGeometry.setDrawRange(0, offset);
    positions.needsUpdate = true;
  });
  return (
    <group>
      <lineSegments geometry={geometry} renderOrder={1000}>
        <lineBasicMaterial vertexColors depthTest={false} toneMapped={false} />
      </lineSegments>
      <lineSegments geometry={liveGeometry} renderOrder={1001} frustumCulled={false}>
        <lineBasicMaterial vertexColors depthTest={false} toneMapped={false} />
      </lineSegments>
    </group>
  );
}

/** F3 is available only in development or in an explicitly opted-in test session. */
export function CollisionOverlay() {
  const [visible, setVisible] = useState(false);
  const debugVisible = useDebug(s => s.collision);
  useEffect(() => {
    const toggle = (event: KeyboardEvent) => {
      if (event.code !== "F3" || event.repeat) return;
      event.preventDefault();
      setVisible((v) => !v);
    };
    window.addEventListener("keydown", toggle);
    return () => window.removeEventListener("keydown", toggle);
  }, []);
  return visible || debugVisible ? <VisibleOverlay /> : null;
}
