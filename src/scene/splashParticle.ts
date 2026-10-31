import type { Vector3 } from "three";

const rnd = (n: number) => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};

/** Shared by world splashes and the pooled combat bubble pops. */
export function splashParticle(x: number, y: number, z: number, id: number, i: number, t: number, out: Vector3): void {
  const a = rnd(id * 19 + i) * Math.PI * 2;
  const v = 1 + rnd(i * 5) * 1.2;
  out.set(x + Math.cos(a) * t * v, y + t * 3.4 - t * t * 6, z + Math.sin(a) * t * v);
}
