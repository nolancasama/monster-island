import * as THREE from "three";
import { rt } from "../game/runtime";
import { getGame } from "../game/store";
import { vy } from "../game/voyageRt";
import { BOAT_HALF_BEAM, BOAT_HALF_LENGTH, boatWakeIntensity } from "../game/world/gullBoat";
import { SEA_Y } from "../game/world/island";
import { seaHeight } from "./PirateShip";
import { voyageStorm } from "./voyageWeather";

const SAMPLE_STEP = 0.06;
const SAMPLE_COUNT = 40;
const LIFETIME = SAMPLE_STEP * (SAMPLE_COUNT - 1);
const MAX_ROWS = 256;
const GULL_WAKE = { stern: BOAT_HALF_LENGTH * 0.73, beam: BOAT_HALF_BEAM, scale: 1, life: LIFETIME };
const RAFT_WAKE = { stern: 1.22, beam: 2.05, scale: 0.72, life: 1.55 };
const wakeMaterial = new THREE.MeshBasicMaterial({
  color: "#effaff", vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  forceSinglePass: true,
});

/** The first 0.2 of flow is the idle sea drifting past the hatch. */
export const raftWakeSpeed = (flow: number) => Math.max(0, (flow - 0.2) * 4);

export function raftWakeIntensity(speed: number, sail: number) {
  return boatWakeIntensity(speed, false) * (0.57 + 0.23 * THREE.MathUtils.clamp(sail, 0, 1));
}

interface SternSample {
  x: number;
  z: number;
  sin: number;
  cos: number;
  time: number;
  strength: number;
}

const sternSample = (): SternSample => ({ x: 0, z: 0, sin: 0, cos: 1, time: 0, strength: 0 });

/** Widens and fades world-space stern marks, plus shorter streaks and ripples from the hull. */
export class BoatWake {
  readonly geometry = new THREE.BufferGeometry();
  readonly material = wakeMaterial;

  private readonly positions = new THREE.BufferAttribute(new Float32Array(MAX_ROWS * 9), 3).setUsage(THREE.DynamicDrawUsage);
  private readonly colors = new THREE.BufferAttribute(new Float32Array(MAX_ROWS * 12).fill(1), 4).setUsage(THREE.DynamicDrawUsage);
  private readonly indices = new THREE.BufferAttribute(new Uint16Array(MAX_ROWS * 12), 1).setUsage(THREE.DynamicDrawUsage);
  private readonly history = Array.from({ length: SAMPLE_COUNT }, sternSample);
  private readonly tip = sternSample();
  private count = 0;
  private next = 0;
  private nextTime = 0;
  private wakeUntil = 0;
  private rows = 0;
  private indexCount = 0;
  private firstRow = 0;
  private time = 0;
  private onVoyageSea = false;
  private onCloudSea = false;
  private storm = 0;
  private gridX = 0;
  private gridZ = 0;
  private gridStep = 10;
  private opacity = 1;
  private readonly profile: typeof GULL_WAKE;

  constructor(private readonly raft = false) {
    this.profile = raft ? RAFT_WAKE : GULL_WAKE;
    this.geometry.setAttribute("position", this.positions);
    this.geometry.setAttribute("color", this.colors);
    this.geometry.setIndex(this.indices);
    this.geometry.setDrawRange(0, 0);
  }

  dispose() {
    this.geometry.dispose();
  }

  clear(time: number) {
    this.count = 0;
    this.nextTime = time;
    this.wakeUntil = 0;
    this.geometry.setDrawRange(0, 0);
  }

  update(x: number, z: number, yaw: number, dx: number, dz: number, dyaw: number, dt: number, strength: number) {
    const time = rt.time;
    if (this.raft && strength === 0) {
      this.clear(time);
      return;
    }
    this.opacity = this.raft ? Math.min(1, strength / 0.14) : 1;
    if (dt > 0) {
      // The raft is camera-anchored. Carry its previous marks aft through the moving water.
      if (this.raft) for (let i = 0; i < this.count; i++) {
        const sample = this.sampleAt(i);
        sample.x -= dx;
        sample.z -= dz;
      }
      while (this.nextTime <= time) {
        const remaining = (time - this.nextTime) / dt;
        this.writeSample(this.history[this.next], x - dx * remaining, z - dz * remaining,
          yaw - dyaw * remaining, this.nextTime, strength);
        this.count = Math.min(SAMPLE_COUNT, this.count + 1);
        this.next = (this.next + 1) % SAMPLE_COUNT;
        this.nextTime += SAMPLE_STEP;
      }
    }
    this.writeSample(this.tip, x, z, yaw, time, strength);
    if (strength > 0) this.wakeUntil = time + this.profile.life;
    this.time = time;
    this.onVoyageSea = vy.sea && rt.world === "home";
    this.onCloudSea = rt.world === "cloud" || (rt.voyage.active && !vy.sea);
    if (this.onVoyageSea) {
      this.gridStep = 10;
      this.gridX = Math.round(rt.camera.target.x / 10) * 10;
      this.gridZ = Math.round(rt.camera.target.z / 10) * 10;
      this.storm = vy.storm;
    } else if (this.onCloudSea) {
      // Match CloudSea's 60 × 60 grid, which tracks the boat during the original crossing.
      const crossing = rt.world === "home";
      this.gridStep = 700 / 60;
      this.gridX = crossing ? x : 0;
      this.gridZ = crossing ? z : 60;
      this.storm = crossing ? voyageStorm() : getGame().progress.act3.beaconDefeated ? 0.05 : 1;
    }
    this.rows = 0;
    this.indexCount = 0;
    for (let side = -1; side <= 1; side += 2) {
      if (time < this.wakeUntil) {
        this.firstRow = this.rows;
        this.armRow(this.tip, side);
        for (let i = 0; i < this.count; i++) {
          const sample = this.sampleAt(i);
          if (time - sample.time > 0.001) this.armRow(sample, side);
        }
      }
      for (let i = 0; i < this.count; i++) {
        const sample = this.sampleAt(i);
        if (sample.strength > 0 && (this.next - i + SAMPLE_COUNT - 1) % 3 === 0) this.foam(sample, side);
        if ((this.next - i + SAMPLE_COUNT - 1) % 10 === 0) this.ripple(sample, side);
      }
    }
    this.geometry.setDrawRange(0, this.indexCount);
    this.positions.needsUpdate = this.colors.needsUpdate = this.indices.needsUpdate = true;
  }

  private sampleAt(ageIndex: number) {
    return this.history[(this.next + SAMPLE_COUNT - 1 - ageIndex) % SAMPLE_COUNT];
  }

  private writeSample(sample: SternSample, x: number, z: number, yaw: number, time: number, strength: number) {
    sample.sin = Math.sin(yaw);
    sample.cos = Math.cos(yaw);
    sample.x = x - sample.sin * this.profile.stern;
    sample.z = z - sample.cos * this.profile.stern;
    sample.time = time;
    sample.strength = strength;
  }

  private armRow(sample: SternSample, side: number) {
    const age = this.time - sample.time;
    const { life, scale } = this.profile;
    const fade = Math.max(0, 1 - age / life);
    if (this.raft && !fade) return;
    const outward = side * scale * (0.7 + age * (0.7 + sample.strength * 1.4));
    const aft = scale * (0.12 + age * 0.45);
    const x = sample.x + sample.cos * outward - sample.sin * aft;
    const z = sample.z - sample.sin * outward - sample.cos * aft;
    const churn = 0.81 + 0.19 * Math.sin(sample.time * 31 + side);
    const width = 0.12 + sample.strength * (0.36 + age * 0.07);
    this.row(x, z, sample.cos, -sample.sin, width * scale, 0.84 * sample.strength * fade * churn);
  }

  private foam(sample: SternSample, side: number) {
    const age = this.time - sample.time;
    const fade = Math.max(0, 1 - age / 1.05);
    if (!fade) return;
    const { beam, stern, scale } = this.profile;
    const outward = side * (beam * 0.81 + age * 0.78 * scale);
    const forward = stern + scale * (0.65 * Math.sin(sample.time * 17 + side) - age * 1.35);
    const x = sample.x + sample.cos * outward + sample.sin * forward;
    const z = sample.z - sample.sin * outward + sample.cos * forward;
    const length = scale * (0.28 + sample.strength * 0.72);
    const width = scale * (0.08 + sample.strength * 0.14);
    this.firstRow = this.rows;
    this.row(x - sample.sin * length, z - sample.cos * length, sample.cos, -sample.sin, width * 0.28, 0);
    this.row(x, z, sample.cos, -sample.sin, width, 0.76 * sample.strength * fade);
    this.row(x + sample.sin * length, z + sample.cos * length, sample.cos, -sample.sin, width * 0.28, 0);
  }

  private ripple(sample: SternSample, side: number) {
    const age = this.time - sample.time;
    const fade = Math.max(0, 1 - age / 1.4);
    if (!fade) return;
    const { beam, stern, scale } = this.profile;
    const x = sample.x + sample.sin * (stern - 0.7 * scale);
    const z = sample.z + sample.cos * (stern - 0.7 * scale);
    const radius = beam * 0.85 + age * scale * (0.72 + sample.strength);
    this.firstRow = this.rows;
    for (let i = -4; i <= 4; i++) {
      const angle = i * 0.18;
      const across = side * Math.cos(angle);
      const along = Math.sin(angle);
      const nx = sample.cos * across + sample.sin * along;
      const nz = -sample.sin * across + sample.cos * along;
      const alpha = (0.12 + 0.29 * sample.strength) * fade * (1 - Math.abs(i) / 4) * Math.min(1, age * 8);
      this.row(x + nx * radius, z + nz * radius, nx, nz, scale * (0.075 + age * 0.055), alpha * scale);
    }
  }

  /** Three vertices across each ribbon row feather the edges without a texture. */
  private row(x: number, z: number, nx: number, nz: number, width: number, alpha: number) {
    const vertex = this.rows * 3;
    for (let i = -1; i <= 1; i++) {
      const px = x + i * width * nx;
      const pz = z + i * width * nz;
      this.positions.setXYZ(vertex + i + 1, px, this.surface(px, pz) + 0.055, pz);
      this.colors.setW(vertex + i + 1, i === 0 ? alpha * this.opacity : 0);
    }
    if (this.rows > this.firstRow) {
      for (let i = vertex - 3; i < vertex - 1; i++) {
        this.indices.setX(this.indexCount++, i);
        this.indices.setX(this.indexCount++, i + 1);
        this.indices.setX(this.indexCount++, i + 3);
        this.indices.setX(this.indexCount++, i + 1);
        this.indices.setX(this.indexCount++, i + 4);
        this.indices.setX(this.indexCount++, i + 3);
      }
    }
    this.rows++;
  }

  private surface(x: number, z: number) {
    if (!this.onVoyageSea && !this.onCloudSea) return SEA_Y;
    // Interpolate the actual water triangles. The analytic wave between grid
    // vertices can be well above or below the rendered surface in a storm.
    const step = this.gridStep;
    const x0 = this.gridX + Math.floor((x - this.gridX) / step) * step;
    const z0 = this.gridZ + Math.floor((z - this.gridZ) / step) * step;
    const u = (x - x0) / step, v = (z - z0) / step;
    const east = this.wave(x0 + step, z0), south = this.wave(x0, z0 + step);
    return u + v <= 1
      ? east * u + south * v + this.wave(x0, z0) * (1 - u - v)
      : east * (1 - v) + south * (1 - u) + this.wave(x0 + step, z0 + step) * (u + v - 1);
  }

  private wave(x: number, z: number) {
    if (this.onVoyageSea) return seaHeight(x, z, this.time, this.storm, vy.flowDist);
    // CloudSea's waves, used for the original crossing and arrival at Cloud Isle.
    return -0.4 + (0.035 + this.storm * 0.24) * Math.sin(x * 0.29 + z * 0.16 + this.time * 1.8)
      + this.storm * 0.1 * Math.sin(z * 0.57 - this.time * 2.1);
  }
}
