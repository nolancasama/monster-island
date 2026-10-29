import type * as THREE from "three";
import { PartBuilder } from "../partBuilder";

/** Touching planks form the actual closed walking surface; seams are coloured edges. */
export function bridgeDeck(b: PartBuilder, len: number, half: number, start: number, colors: [string, string], step = .32, top = 0) {
  const n = Math.ceil(len / step), d = len / n;
  for (let i = 0; i < n; i++)
    b.boxAt(half * 2, .1, d + .002, [0, top - .05, start + (i + .5) * d], [0, 0, 0], colors[i % 2]);
}

/** Bend deck, anchors and railings together without rotating/shortening the span.
 * Coordinates stay horizontal; y=0 on every plank is the shared walking height. */
export function conformBridge(geometry: THREE.BufferGeometry, x: number, z: number, y: number, surface: (x: number, z: number) => number) {
  const p = geometry.getAttribute("position");
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + surface(x + p.getX(i), z + p.getZ(i)) - y);
  p.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
