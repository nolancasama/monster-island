import * as THREE from "three";
import { PartBuilder } from "../partBuilder";

export type KitPoint = [number, number, number];
export interface KitAnchor { part: string; point: KitPoint }
export interface KitPart {
  id: string;
  parent: string | null;
  /** Named parent socket, followed by a local offset; never a world position. */
  attachment: KitAnchor | null;
  origin: KitPoint;
  bounds: THREE.Box3;
  ground: boolean;
  vertexStart: number;
  vertexCount: number;
}
export interface KitComposite {
  geometry: THREE.BufferGeometry;
  parts: KitPart[];
  anchors: Record<string, KitAnchor>;
  bridgeEnds: Array<{ deck: string; support: string; point: KitPoint }>;
}
const bark = "#626652", timber = "#9d875f", stone = "#65706e";
const plus = (a: KitPoint, b: KitPoint): KitPoint => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const up = new THREE.Vector3(0, 1, 0);

/** One mesh per composite. Metadata is measured from the very same transformed
 * primitives passed to PartBuilder (and identifies their merged vertex ranges). */
class Assembly {
  private builder = new PartBuilder(1);
  parts: KitPart[] = [];
  anchors: Record<string, KitAnchor> = {};
  bridgeEnds: KitComposite["bridgeEnds"] = [];

  socket(part: string, name: string, point: KitPoint): KitAnchor {
    return this.anchors[`${part}.${name}`] = { part, point };
  }
  add(id: string, geo: THREE.BufferGeometry, color: string, parent: KitAnchor | null,
    offset: KitPoint, rotation: KitPoint = [0, 0, 0], ground = false): KitAnchor {
    const origin = plus(parent?.point ?? [0, 0, 0], offset);
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...origin),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(1, 1, 1));
    const measured = geo.clone().applyMatrix4(matrix);
    measured.computeBoundingBox();
    const bounds = measured.boundingBox!.clone();
    measured.dispose();
    const vertexStart = this.builder.vertexCount;
    this.builder.add(geo, color, origin, rotation);
    this.parts.push({ id, parent: parent?.part ?? null, attachment: parent, origin, bounds, ground,
      vertexStart, vertexCount: this.builder.vertexCount - vertexStart });
    return this.socket(id, "center", origin);
  }
  box(id: string, size: KitPoint, parent: KitAnchor | null, offset: KitPoint, color = stone, ground = false) {
    const center = this.add(id, new THREE.BoxGeometry(...size), color, parent, offset, [0, 0, 0], ground);
    this.socket(id, "top", plus(center.point, [0, size[1] / 2, 0]));
    return center;
  }
  limb(id: string, parent: KitAnchor | null, delta: KitPoint, radius: number, tipRadius = radius * .6,
    color = bark, ground = false, offset: KitPoint = [0, 0, 0], square = false) {
    const start = plus(parent?.point ?? [0, 0, 0], offset), dir = new THREE.Vector3(...delta);
    const length = dir.length();
    const rotation = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir.normalize()));
    // A small socket insertion at both ends, rather than merely touching faces.
    const geometry = square ? new THREE.BoxGeometry(radius * 2, length + .16, radius * 2)
      : new THREE.CylinderGeometry(tipRadius, radius, length + .16, 6);
    this.add(id, geometry, color, parent,
      plus(offset, [delta[0] / 2, delta[1] / 2, delta[2] / 2]), [rotation.x, rotation.y, rotation.z], ground);
    this.socket(id, "base", start);
    return this.socket(id, "tip", plus(start, delta));
  }
  finish(): KitComposite {
    return { geometry: this.builder.build(), parts: this.parts, anchors: this.anchors, bridgeEnds: this.bridgeEnds };
  }
}

function roots(a: Assembly, parent: KitAnchor, radius: number, drop = .55) {
  for (let i = 0; i < 4; i++) {
    const angle = i * Math.PI / 2 + .4;
    a.limb(`root${i}`, parent, [Math.cos(angle) * radius * 1.5, -drop, Math.sin(angle) * radius * 1.5], radius * .35, .12, bark, true);
  }
}
export function rootFlare(): KitComposite {
  const a = new Assembly();
  a.limb("stump", null, [0, 1.8, 0], 2, 1.5, bark, true, [0, -.35, 0]);
  roots(a, a.anchors["stump.base"], 2);
  return a.finish();
}
export function branch(delta: KitPoint = [7, 2, 0], radius = .8): KitComposite {
  const a = new Assembly();
  const tip = a.limb("branch", null, delta, radius, radius * .6, bark, true);
  a.socket("branch", "platform", plus(tip.point, [0, radius * .45, 0]));
  return a.finish();
}

export interface GiantTreeOptions {
  height?: number;
  platformHeight?: number;
  /** Direction/length to an existing walkway, relative to this trunk. */
  platformReach?: KitPoint;
  crownRadius?: number;
  /** Height of the rock outcrop the roots grip; taller on a hillside. */
  padHeight?: number;
}
export function giantTree({ height = 24, platformHeight = 14, platformReach = [9, 0, 0], crownRadius = 4.8, padHeight = 1.1 }: GiantTreeOptions = {}): KitComposite {
  const a = new Assembly();
  // The canopy has no terrain mesh beneath it. Carry the roots on a real rock
  // contact rather than ending the tree in empty air above the sea.
  const ground = a.add("ground", new THREE.CylinderGeometry(3.4, 3.8, padHeight, 7), "#7b8074", null,
    [0, -padHeight / 2, 0], [0, 0, 0], true);
  const contact = a.socket(ground.part, "contact", [0, 0, 0]);
  // The trunk runs down into a deep outcrop (the default pad keeps it .35 m in).
  const top = a.limb("trunk", contact, [0, height, 0], 2.2, 1.3, "#7a6650", true, [0, -Math.max(.35, padHeight - .75), 0]);
  // On a deep outcrop the roots grip its top, where they are seen.
  if (padHeight > 1.1) roots(a, contact, 2.2, Math.max(1.4, padHeight * .5)); else roots(a, a.anchors["trunk.base"], 2.2);
  // A broad umbrella crown: five limbs spread from two forks, each carrying a
  // large foliage cluster, plus the leader's own. Every cluster encloses the
  // tip of the wood that carries it.
  const low = a.socket("trunk", "forkLow", plus(top.point, [0, -height * .3, 0]));
  const high = a.socket("trunk", "fork", plus(top.point, [0, -height * .12, 0]));
  const r = crownRadius;
  const crownTips = [
    a.limb("crownWest", low, [-r * 1.25, r * .7, .4], .9, .45, "#7a6650"),
    a.limb("crownEast", low, [r * 1.2, r * .75, -.6], .9, .45, "#7a6650"),
    a.limb("crownNorth", high, [.5, r * .55, r * 1.1], .75, .4, "#7a6650"),
    a.limb("crownSouth", high, [-.4, r * .6, -r * 1.05], .75, .4, "#7a6650"),
    top,
  ];
  const greens = ["#5f9a57", "#6eab60", "#7cb86a", "#68a35c", "#86c070"];
  crownTips.forEach((tip, i) => {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const size = i === 4 ? r * 1.15 : r;
    geo.scale(size, size * .55, size * .9);
    a.add(`foliage${i}`, geo, greens[i], tip, [0, .5, 0]);
  });
  const shoulder = a.socket("trunk", "branchSocket", plus(a.anchors["trunk.base"].point, [0, platformHeight - 2.2, 0]));
  const tip = a.limb("walkwayBranch", shoulder, [platformReach[0], 1.55 + platformReach[1], platformReach[2]], 1.25, .85);
  a.socket("walkwayBranch", "platform", plus(tip.point, [0, .8, 0]));
  return a.finish();
}

/** Fifty triangles versus the old conifer's sixty; the continuous trunk's
 * axis also determines every foliage tier, including the wind lean. */
export function mountainConifer(): KitComposite {
  const a = new Assembly(), lean = -.21, height = 5.2;
  const base: KitPoint = [0, -.28, 0];
  a.add("trunk", new THREE.CylinderGeometry(.13, .34, height, 5), "#565849", null,
    plus(base, [Math.sin(-lean) * height / 2, Math.cos(lean) * height / 2, 0]), [0, 0, lean], true);
  for (let i = 0; i < 3; i++) {
    const t = 2.1 + i * .85;
    const socket = a.socket("trunk", `tier${i}`, plus(base, [Math.sin(-lean) * t, Math.cos(lean) * t, 0]));
    a.add(`foliage${i}`, new THREE.ConeGeometry(1.55 - i * .3, 2.2, 5),
      ["#405e56", "#4d695a", "#657b64"][i], socket, [0, .65, 0]);
  }
  return a.finish();
}

export function rockFormation(): KitComposite {
  const a = new Assembly();
  const core = a.add("rock", new THREE.IcosahedronGeometry(2.5, 0), stone, null, [0, .7, 0], [0, .2, 0], true);
  a.add("shoulder", new THREE.IcosahedronGeometry(1.5, 0), "#7e8778", core, [1.8, -.4, .2], [0, .7, 0], true);
  a.socket("rock", "platform", plus(core.point, [0, 1.7, 0]));
  return a.finish();
}
export function cliffSegment(width = 8, height = 8, depth = 3): KitComposite {
  const a = new Assembly();
  const face = a.box("face", [width, height, depth], null, [0, height / 2 - .3, 0], "#394b53", true);
  a.box("ledge", [width, .35, depth + .5], a.anchors["face.top"], [0, -.08, 0], "#51685d");
  a.socket("face", "ground", plus(face.point, [0, -height / 2, 0]));
  return a.finish();
}

function archAssembly(width: number, height: number, depth: number, color: string): Assembly {
  const a = new Assembly(), thick = Math.min(1.5, width * .17);
  const sill = a.box("foundation", [width + thick, .4, depth], null, [0, -.2, 0], color, true);
  for (const side of [-1, 1]) {
    const foot = a.socket(sill.part, `foot${side}`, plus(sill.point, [side * width / 2, .15, 0]));
    a.box(`pier${side}`, [thick, height, depth], foot, [0, height / 2 - .1, 0], color, true);
  }
  a.box("lintel", [width + thick, thick, depth], a.anchors["pier-1.top"], [width / 2, thick / 2 - .15, 0], color);
  a.socket("lintel", "otherSupport", a.anchors["pier1.top"].point);
  return a;
}
export function caveMouth(width = 6.4, height = 6, depth = 3): KitComposite {
  return archAssembly(width, height, depth, "#59625b").finish();
}
export function ruinedArch(width = 5.2, height = 4.8, depth = 1.4): KitComposite {
  return archAssembly(width, height, depth, "#929381").finish();
}
export function ruinedWall(): KitComposite {
  const a = new Assembly();
  const base = a.box("wall", [6, 2.4, 1.1], null, [0, 1, 0], stone, true);
  for (const x of [-2, 0, 2]) a.box(`merlon${x}`, [1.1, .7, 1.1], a.anchors[`${base.part}.top`], [x, .3, 0], "#929381");
  return a.finish();
}
export function ruinedTower(): KitComposite {
  const a = new Assembly();
  const base = a.add("tower", new THREE.CylinderGeometry(1.8, 2.2, 6, 7), stone, null, [0, 2.8, 0], [0, 0, 0], true);
  const rim = a.socket(base.part, "top", plus(base.point, [0, 2.9, 0]));
  for (let i = 0; i < 5; i++) {
    const t = i * Math.PI * 2 / 7;
    a.box(`parapet${i}`, [.9, 1, .8], rim, [Math.sin(t) * 1.4, .4, Math.cos(t) * 1.4]);
  }
  return a.finish();
}

export function waterfallSurround(width = 11, height = 9.2): KitComposite {
  const a = archAssembly(width, height, 3, stone);
  a.box("waterLip", [width - 1, .4, 1.1], a.anchors["lintel.center"], [0, -.25, -1.2], "#71887c");
  return a.finish();
}

export interface BridgeOptions { length?: number; width?: number; supportHeight?: number; deckAt?: (t: number) => number }
export function bridge({ length = 4, width = 3, supportHeight = 1.2, deckAt = () => 0 }: BridgeOptions = {}): KitComposite {
  const a = new Assembly(), count = Math.ceil(length / .3), beamCount = Math.ceil(length);
  const startY = deckAt(0), endY = deckAt(1);
  const start = a.box("startSupport", [width, supportHeight, .6], null, [0, startY - .12 - supportHeight / 2, 0], bark, true);
  const startTop = a.socket(start.part, "deck", [0, startY - .2, 0]);
  // A continuous timber spine follows the same height samples as the deck.
  let previous = startTop;
  for (let i = 0; i < beamCount; i++) {
    const z0 = length * i / beamCount, z1 = length * (i + 1) / beamCount;
    previous = a.limb(`spine${i}`, previous, [0, deckAt((i + 1) / beamCount) - deckAt(i / beamCount), z1 - z0],
      .22, .22, timber, false, [0, 0, 0], true);
  }
  const endSupportHeight = Math.max(supportHeight, endY + .2);
  a.box("endSupport", [width, endSupportHeight, .6], previous, [0, .08 - endSupportHeight / 2, 0], bark, true);
  for (let i = 0; i <= count; i++) {
    const t = i / count, beam = Math.min(beamCount - 1, Math.floor(t * beamCount)), beamT = beam / beamCount;
    const socket = a.anchors[`spine${beam}.base`];
    a.box(`plank${i}`, [width, .18, length / count + .04], socket,
      [0, deckAt(t) - deckAt(beamT) + .11, length * (t - beamT)], timber);
    if (i === 0 || i === count) {
      const support = i === 0 ? start : a.anchors["endSupport.center"];
      for (const side of [-1, 1]) {
        const post = a.box(`post${i}-${side}`, [.16, 1.3, .16], support,
          [side * (width / 2 - .15), supportHeight / 2 + .48, 0], "#829664");
        a.socket(post.part, "rope", plus(post.point, [0, .35, 0]));
      }
      a.bridgeEnds.push({ deck: `plank${i}`, support: support.part, point: [0, deckAt(t) - .18, t * length] });
    }
  }
  for (const side of [-1, 1]) {
    const from = a.anchors[`post0-${side}.rope`], to = a.anchors[`post${count}-${side}.rope`];
    a.limb(`rope${side}`, from, [0, to.point[1] - from.point[1], length], .045, .045, "#829664");
  }
  a.socket("plank0", "start", [0, startY, 0]);
  a.socket(`plank${count}`, "end", [0, endY, length]);
  return a.finish();
}

export function shelterFrame(width = 3.2, height = 2.2, depth = 2): KitComposite {
  const a = new Assembly();
  const floor = a.box("floor", [width + .3, .18, depth + .3], null, [0, -.09, 0], timber, true);
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const foot = a.socket(floor.part, `foot${x}-${z}`, [x * width / 2, -.04, z * depth / 2]);
    a.box(`post${x}-${z}`, [.18, height, .18], foot, [0, height / 2, 0], bark, true);
  }
  a.box("roof", [width + .6, .2, depth + .6], a.anchors["post-1--1.top"], [width / 2, .06, depth / 2], timber);
  return a.finish();
}
export function shelterShelf(): KitComposite {
  const a = new Assembly();
  const base = a.box("plinth", [2.2, .12, .7], null, [0, -.06, 0], timber, true);
  for (const side of [-1, 1]) a.box(`upright${side}`, [.15, 2, .65], base, [side, 1, 0], timber, true);
  for (const y of [.8, 1.6]) a.box(`shelf${y}`, [2.2, .15, .7], a.anchors["upright-1.center"], [1, y - .865, 0], timber);
  return a.finish();
}
/** Local origin attaches to the underside of an existing shelter ceiling. */
export function shelterRoofPatch(): KitComposite {
  const a = new Assembly();
  const batten = a.box("batten", [6.2, .16, .18], null, [0, 0, 0], timber);
  for (let i = 0; i < 8; i++) a.box(`patch${i}`, [1.6, .18, 3], batten, [(i - 3.5) * .65, -.04, 0], "#b28d5f");
  a.socket(batten.part, "ceiling", [0, .08, 0]);
  return a.finish();
}
export function observatoryBay(side = 1): KitComposite {
  const a = new Assembly();
  const base = a.box("foundation", [1, .4, 6.8], null, [0, -.2, 0], stone, true);
  for (const side of [-1, 1]) {
    const foot = a.socket(base.part, `foot${side}`, [0, -.05, side * 3]);
    a.box(`pier${side}`, [.65, 7.05, .8], foot, [0, 3.525, 0], "#8d9897", true);
  }
  a.box("lintel", [.8, .6, 6.6], a.anchors["pier-1.top"], [0, -.2, 3], "#8d9897");
  a.box("walkway", [4.2, .35, 5], a.anchors["pier1.center"], [-2 * side, -.3, 1], "#8d9897");
  a.box("bracket", [.5, 3.3, .7], a.anchors["walkway.center"], [.9 * side, -1.6, 0], "#8d9897");
  return a.finish();
}
export function observatoryGear(): KitComposite {
  const a = new Assembly();
  const foot = a.box("pedestal", [1.8, .25, 1.4], null, [0, -.125, 0], stone, true);
  const axle = a.limb("axle", foot, [0, 1.8, 0], .18, .18, "#b49b59");
  a.box("spokeHorizontal", [2.8, .16, .18], axle, [0, 0, 0], "#b49b59");
  a.box("spokeVertical", [.16, 2.8, .18], axle, [0, 0, 0], "#b49b59");
  a.add("gear", new THREE.TorusGeometry(1.4, .18, 4, 10), "#b49b59", a.anchors["spokeHorizontal.center"], [0, 0, 0]);
  for (let i = 0; i < 10; i++) {
    const t = i * Math.PI / 5;
    a.box(`tooth${i}`, [.35, .45, .3], a.anchors["gear.center"], [Math.sin(t) * 1.45, Math.cos(t) * 1.45, 0], "#b49b59");
  }
  return a.finish();
}

/** Geometry can be baked into an area's existing draw call. */
export function addKit(builder: PartBuilder, kit: KitComposite, position: KitPoint, yaw = 0): void {
  const g = kit.geometry;
  // PartBuilder paints incoming parts; retain the kit's individual vertex colours.
  const colors = g.getAttribute("color").clone();
  const start = builder.vertexCount;
  builder.add(g, "#ffffff", position, [0, yaw, 0], [1, 1, 1], { vary: false, flatAo: true });
  // The builder owns g until build(); reapply its original colours in place.
  g.setAttribute("color", colors);
  if (builder.vertexCount - start !== colors.count) throw new Error("Kit geometry must be non-indexed");
}

export const cloudKit = { giantTree, mountainConifer, branch, rootFlare, rockFormation, cliffSegment,
  caveMouth, bridge, ruinedWall, ruinedArch, ruinedTower, waterfallSurround, shelterFrame, shelterShelf,
  shelterRoofPatch, observatoryBay, observatoryGear };
