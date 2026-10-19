import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Collects primitive shapes into one vertex-coloured geometry, so a whole
 * piece of furniture is a single draw call. Colours get a gentle height-based
 * darkening near the floor (cheap ambient occlusion) and a tiny per-part
 * variation so flat colours look hand-painted.
 */
export class PartBuilder {
  private parts: THREE.BufferGeometry[] = [];
  private seed = 1;

  constructor(private ao = 0.55) {}

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  add(
    geo: THREE.BufferGeometry,
    color: THREE.ColorRepresentation,
    pos: [number, number, number],
    rot: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] = [1, 1, 1],
    opts: { vary?: boolean; flatAo?: boolean } = {}
  ): this {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...pos),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
      new THREE.Vector3(...scale)
    );
    g.applyMatrix4(m);
    const base = new THREE.Color(color);
    if (opts.vary !== false) base.multiplyScalar(0.94 + this.rand() * 0.12);
    const p = g.attributes.position;
    const colors = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const t = opts.flatAo ? 1 : THREE.MathUtils.smoothstep(y, 0, this.ao);
      const k = 0.58 + 0.42 * t;
      colors[i * 3] = base.r * k;
      colors[i * 3 + 1] = base.g * k;
      colors[i * 3 + 2] = base.b * k;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    if (!g.attributes.uv) {
      g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(p.count * 2), 2));
    }
    this.parts.push(g);
    return this;
  }

  /** Box resting on `y` (its bottom), centred on x/z. */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, rotY = 0): this {
    return this.add(new THREE.BoxGeometry(w, h, d), color, [x, y + h / 2, z], [0, rotY, 0]);
  }

  /** Box with an arbitrary rotation, centred on (x, y, z). */
  boxAt(
    w: number,
    h: number,
    d: number,
    pos: [number, number, number],
    rot: [number, number, number],
    color: THREE.ColorRepresentation
  ): this {
    return this.add(new THREE.BoxGeometry(w, h, d), color, pos, rot);
  }

  /** Vertical cylinder resting on `y`. */
  cyl(rTop: number, rBot: number, h: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, seg = 12): this {
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg), color, [x, y + h / 2, z]);
  }

  /** Cylinder centred on pos with rotation. */
  cylAt(
    r: number,
    h: number,
    pos: [number, number, number],
    rot: [number, number, number],
    color: THREE.ColorRepresentation,
    seg = 10
  ): this {
    return this.add(new THREE.CylinderGeometry(r, r, h, seg), color, pos, rot);
  }

  sphere(
    r: number,
    x: number,
    y: number,
    z: number,
    color: THREE.ColorRepresentation,
    scale: [number, number, number] = [1, 1, 1],
    seg = 12
  ): this {
    return this.add(new THREE.SphereGeometry(r, seg, Math.max(6, Math.floor(seg * 0.7))), color, [x, y, z], [0, 0, 0], scale);
  }

  cone(r: number, h: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, seg = 12, open = false): this {
    return this.add(new THREE.ConeGeometry(r, h, seg, 1, open), color, [x, y + h / 2, z]);
  }

  torus(r: number, tube: number, pos: [number, number, number], rot: [number, number, number], color: THREE.ColorRepresentation): this {
    return this.add(new THREE.TorusGeometry(r, tube, 6, 16), color, pos, rot);
  }

  get empty(): boolean {
    return this.parts.length === 0;
  }

  build(): THREE.BufferGeometry {
    if (!this.parts.length) return new THREE.BufferGeometry();
    const merged = mergeGeometries(this.parts, false);
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    merged.computeBoundingSphere();
    return merged;
  }
}
