import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { cb } from "../game/combat";
import { getGame } from "../game/store";
import { rt } from "../game/runtime";
import { standY } from "../game/world/collision";
import { ELEMENT_OBJECTS, SECRET_IDS, SECRET_SITES } from "../game/world/elementObjects";

// Five draws across all sites, including instanced autumn leaf quads.
// Flames share ElementEffects' existing sprite draw. Scratch storage is mount-only.
const CAP = 1024;
const WOOD = "#956038", DARK_WOOD = "#523824", STONE = "#999c91", DARK = "#302b27";
const groundY = (x: number, z: number) => standY(x, z, getGame().progress.solved, "ground");

function makeBatch(geometry: THREE.BufferGeometry, material: THREE.Material) {
  const mesh = new THREE.InstancedMesh(geometry, material, CAP);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3).fill(1), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.visible = false;
  return { mesh, n: 0 };
}

export function Secrets() {
  const kit = useMemo(() => {
    const material = new THREE.MeshLambertMaterial({ flatShading: true });
    const leafMaterial = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, forceSinglePass: true });
    // A pointed leaf silhouette, still just two triangles per instance.
    const leaf = new THREE.PlaneGeometry(1, 1);
    const p = leaf.getAttribute("position");
    p.setXYZ(0, 0, .5, 0); p.setXYZ(1, .25, 0, 0);
    p.setXYZ(2, -.25, 0, 0); p.setXYZ(3, 0, -.5, 0);
    const batches = {
      box: makeBatch(new THREE.BoxGeometry(1, 1, 1), material),
      cone: makeBatch(new THREE.ConeGeometry(1, 1, 5), material),
      stone: makeBatch(new THREE.IcosahedronGeometry(1, 0), material),
      ring: makeBatch(new THREE.TorusGeometry(1, .12, 4, 12), material),
      leaf: makeBatch(leaf, leafMaterial),
    };
    const all = Object.values(batches);
    const eastStatue = ELEMENT_OBJECTS.find(o => o.id === "leafyStatuesEast")!;
    const o = new THREE.Object3D(), color = new THREE.Color();
    // Visual interpolation only; gameplay and persistence remain in E4a.
    const sites = SECRET_IDS.map(id => ({
      id, site: SECRET_SITES[id], object: ELEMENT_OBJECTS.find(o => o.id === id)!,
      open: getGame().progress.act2.secrets.includes(id) ? 1 : 0,
      first: true, a: 0, b: 0, clear: 0,
    }));
    function part(kind: keyof typeof batches, x: number, y: number, z: number,
      sx: number, sy: number, sz: number, tint: string, rx = 0, ry = 0, rz = 0) {
      if (sx < .001 || sy < .001 || sz < .001) return;
      const b = batches[kind];
      if (b.n >= CAP) return;
      o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.scale.set(sx, sy, sz); o.updateMatrix();
      b.mesh.setMatrixAt(b.n, o.matrix); b.mesh.setColorAt(b.n++, color.set(tint));
    }
    function box(x: number, y: number, z: number, w: number, h: number, d: number, tint: string, rx = 0, ry = 0, rz = 0) {
      part("box", x, y, z, w, h, d, tint, rx, ry, rz);
    }
    function thorn(x: number, z: number, k: number, seed: number) {
      const y = groundY(x, z);
      box(x, y + .48 * k, z, .19, .96 * k, .18, k < .3 ? DARK : "#69452e", 0, seed, .32);
      for (let j = 0; j < 3; j++) {
        part("cone", x + Math.sin(seed + j) * .16, y + (.4 + j * .24) * k, z,
          .18, .52 * k, .15, "#815b36", 0, seed + j, j % 2 ? 1 : -1);
      }
    }
    function shell(x: number, y: number, z: number, upright: number, s = 1) {
      part("stone", x, y, z, .46 * s, (.13 + upright * .33) * s, (.46 - upright * .32) * s, "#f4cc9c");
      for (let j = 0; j < 5; j++) {
        const a = (j - 2) * .32;
        box(x + Math.sin(a) * .16 * s, y + .09 * s, z + Math.cos(a) * .1 * s,
          .035 * s, (.035 + upright * .48) * s, (.48 - upright * .44) * s, "#fff1ce", 0, a, -a * upright);
      }
      part("ring", x, y, z + .39 * s, .16 * s, .16 * s, .16 * s, "#d49b53", Math.PI / 2 * (1 - upright));
    }
    function statue(x: number, z: number, bodyOffset: number) {
      const y = groundY(x, z);
      box(x, y + .16, z, 1.08, .32, 1, "#6c746e");
      box(x, y + .37, z, .87, .12, .8, STONE);
      // Plinth centres move the full three metres; the paired carvings nest
      // side by side on the shared central base rather than overlapping faces.
      x += bodyOffset;
      part("stone", x, y + .9, z, .43, .61, .35, STONE);
      part("stone", x, y + 1.6, z, .42, .41, .38, "#b0b3a5");
      for (let side = -1; side <= 1; side += 2) {
        part("cone", x + side * .28, y + 1.97, z, .16, .32, .17, STONE, 0, 0, -side * .3);
        box(x + side * .16, y + 1.66, z + .32, .1, .1, .05, DARK);
        box(x + side * .44, y + .99, z, .24, .68, .24, "#80897f", 0, 0, side * .22);
      }
      box(x, y + 1.42, z + .34, .16, .12, .12, "#80897f");
    }
    function leaves(x: number, z: number, hx: number, hz: number, k: number, base: number) {
      if (k < .002) return;
      for (let i = 0; i < 100; i++) {
        const a = i * 2.39996, r = Math.sqrt((i + .5) / 100);
        const dx = Math.cos(a) * hx * r, dz = Math.sin(a) * hz * r;
        part("leaf", x + dx + (1 - k) * Math.sin(a) * 2, base + (.1 + (1 - r) * .65) * k,
          z + dz, .7 * k, .95 * k, k, i % 3 === 0 ? "#d89a32" : i % 3 === 1 ? "#b75228" : "#d0b044",
          -Math.PI / 2 + Math.sin(i) * .45, i * 1.8, i * .5);
      }
    }
    return { all, sites, eastStatue, part, box, thorn, shell, statue, leaves, material, leafMaterial };
  }, []);
  useEffect(() => () => {
    for (const b of kit.all) { b.mesh.geometry.dispose(); b.mesh.dispose(); }
    kit.material.dispose(); kit.leafMaterial.dispose();
  }, [kit]);

  useFrame((_, dt) => {
    const { part, box, thorn, shell, statue, leaves } = kit;
    const secrets = getGame().progress.act2.secrets;
    for (const s of kit.sites) {
      const done = secrets.includes(s.id), state = cb.elementObjects[s.id]?.state ?? "intact";
      const targetA = s.id === "leafyStatues" ? (done || state === "pulled" ? 1 : 0)
        : s.id === "comboCrateLift" ? (done || state === "onPad" ? 1 : 0) : done ? 1 : 0;
      const targetB = done || cb.elementObjects.leafyStatuesEast?.state === "pulled" ? 1 : 0;
      const targetClear = done || state === "cleared" ? 1 : 0;
      // Linear .55-second motions reach the endpoint, including when reset by a save load.
      const step = Math.min(1, dt / .55);
      s.open = THREE.MathUtils.clamp(s.open + Math.sign(Number(done) - s.open) * step, 0, 1);
      s.a = s.first ? targetA : THREE.MathUtils.clamp(s.a + Math.sign(targetA - s.a) * step, 0, 1);
      s.b = s.first ? targetB : THREE.MathUtils.clamp(s.b + Math.sign(targetB - s.b) * step, 0, 1);
      s.clear = s.first ? targetClear : THREE.MathUtils.clamp(s.clear + Math.sign(targetClear - s.clear) * step, 0, 1);
      s.first = false;
      const b = s.site.blocker;
      if (b.kind !== "box") continue;
      if (cb.world !== "home" || Math.hypot(rt.player.x - b.x, rt.player.z - b.z) > 45) continue;
      const x = b.x, z = b.z, hx = b.hx, hz = b.hz, y = groundY(x, z);
      const ox = s.object.x, oz = s.object.z, oy = groundY(ox, oz);
      const k = s.open, shut = 1 - k;

      // Open chambers have a low structural rim; their centres remain terrain.
      // Closed pockets and the shell cage never add a floor over the ground.
      if (k > 0 && (s.id === "leafyStatues" || s.id === "puffLeaves"
        || s.id === "comboCrateLift" || s.id === "comboFurnace")) {
        const tint = s.id === "puffLeaves" || s.id === "comboCrateLift" ? WOOD : STONE;
        for (const side of [-1, 1]) {
          box(x + side * (hx - .09), y + .09 * k, z, .18, .18 * k, hz * 2, tint);
          box(x, y + .09 * k, z + side * (hz - .09), hx * 2 - .36, .18 * k, .18, tint);
        }
        // A stream runs through this one chamber: planks keep the chest out of the water.
        if (s.id === "comboCrateLift") box(x, y + .13 * k, z, hx * 2 - .2, .1 * k, hz * 2 - .2, WOOD);
      }
      if (s.id === "groveDryReeds" || s.id === "canopyDryReeds") {
        // Dry reeds fill the exact blocker footprint and withdraw as the saved
        // burn completes. They reuse the thicket's instanced wood and cones.
        if (shut > .002) for (let ix = 0; ix <= 6; ix++) for (let iz = 0; iz <= 8; iz++) {
          const px = x - hx + ix * hx / 3, pz = z - hz + iz * hz / 4;
          const base = groundY(px, pz), height = (.95 + ((ix + iz * 3) % 4) * .14) * shut;
          box(px, base + height / 2, pz, .13 * shut, height, .13 * shut, "#b89549", 0, 0, Math.sin(ix * 2 + iz) * .12);
          part("cone", px, base + height, pz, .16 * shut, .3 * shut, .14 * shut, "#d0b06b");
        }
        for (let i = 0; i < 5; i++) {
          const a = i * 2.39996, r = .45 * Math.sqrt((i + .5) / 5);
          const height = (1 - k) * .9;
          box(ox + Math.cos(a) * r, oy + height / 2, oz + Math.sin(a) * r, .13, height, .13, "#b89549");
        }
      } else if (s.id === "emberThicket") {
        for (let i = 0; i < 12; i++) {
          const a = i * 2.39996, r = .75 * Math.sqrt((i + .5) / 12);
          thorn(ox + Math.cos(a) * r, oz + Math.sin(a) * r, 1 - k * .86, a);
        }
        // Hedge follows all four collision edges, including both rear corners.
        for (let i = 0; i <= 8; i++) {
          const t = i / 8;
          if (shut > .002) {
            thorn(x - hx + t * hx * 2, z - hz, shut, i);
            thorn(x - hx + t * hx * 2, z + hz, shut, i + 2);
            thorn(x - hx, z - hz + t * hz * 2, shut, i + 4);
            thorn(x + hx, z - hz + t * hz * 2, shut, i + 6);
          }
        }
        // The bush covers the whole pocket: no bare floor gives the hiding place away.
        if (shut > .002) for (let ix = 1; ix < 4; ix++) for (let iz = 1; iz < 5; iz++)
          thorn(x - hx + ix * hx / 2, z - hz + iz * hz * .4, shut * 1.2, ix * 3 + iz);
        if (k > 0) part("stone", ox, oy + .035, oz, .85 * k, .055, .8 * k, "#615951");
      } else if (s.id === "bubboLedgeKey") {
        const postX = x - hx - .32, postZ = z + hz;
        box(postX, groundY(postX, postZ) + .8, postZ, .38, 1.6, .38, "#d5c5a3");
        part("ring", postX, groundY(postX, postZ) + 1.4, postZ + .21, .3, .3, .3, "#846953");
        shell(ox + (postX - ox) * k, oy + .18 + (groundY(postX, postZ) + 1.4 - oy - .18) * k + Math.sin(k * Math.PI) * 1.7,
          oz + (postZ + .24 - oz) * k, k);
        // Shell bars enclose the entire box; the front gates slide sideways.
        for (let edge = 0; edge < 4; edge++) {
          const alongX = edge < 2;
          for (let i = 0; i <= 8; i++) {
            const t = i / 8, slide = edge === 1 ? (t < .5 ? -1 : 1) * k * hx : 0;
            const px = alongX ? x - hx + t * hx * 2 + slide : x + (edge === 2 ? -hx : hx);
            const pz = alongX ? z + (edge === 0 ? -hz : hz) : z - hz + t * hz * 2;
            const h = (edge === 1 ? 1 : shut) * (1.25 + Math.sin(t * Math.PI) * .4);
            box(px, groundY(px, pz) + h / 2, pz, .13, h, .13, "#d4b99b");
            if (h > .01) part("stone", px, groundY(px, pz) + h, pz, .19, .23, .1, "#f4cc9c");
          }
          const h = edge === 1 ? 1 : shut;
          // Front crossbar retracts along with the fence, leaving a full opening.
          if (h > .002) box(x + (edge === 2 ? -hx : edge === 3 ? hx : 0), y + .5 * shut, z + (edge === 0 ? -hz : edge === 1 ? hz : 0),
            alongX ? hx * 2 * shut : .13, .12 * shut, alongX ? .13 : hz * 2, "#e8d8bb");
        }
      } else if (s.id === "leafyStatues") {
        const east = kit.eastStatue, centre = (ox + east.x) / 2;
        statue(ox + (centre - ox) * s.a, oz, -.32 * s.a);
        statue(east.x + (centre - east.x) * s.b, east.z, .32 * s.b);
        box(centre, groundY(centre, oz) + .08 * (1 - k), oz, 2.3, .16, 1.25, "#b2b5a7");
        // Whole slab matches the solid footprint; it slides aside and sinks flat.
        box(x + k * (hx * 2 + .25), y + .62 * shut + .09, z, hx * 2, 1.24 * shut + .12, hz * 2, STONE);
        for (let i = 0; i < 4; i++) {
          box(x + k * (hx * 2 + .25), y + 1.25 * shut + .16, z - hz + .5 + i,
            hx * 2 - .12, .04, .06, "#6d776f");
          // Shallow descending steps end at the existing chest's ground height.
          if (k > 0) box(x, y + .045 + (3 - i) * .08 * k, z + hz - .3 - i * .48,
            2.5, .09, .43, "#848b80");
        }
      } else if (s.id === "puffLeaves") {
        for (let i = 0; i < 6; i++) {
          box(ox + (i % 2 - .5) * .9, oy + .025, oz + (Math.floor(i / 2) - 1) * .75, .84, .05, .69, "#898b77");
        }
        leaves(ox, oz, 1.2, 1, 1 - s.clear, oy + .04);
        // Leaf-covered lid fills the otherwise solid chest pocket, then folds outward.
        const lidX = x - k * (hx + .25), lidY = y + .65 * shut + .08;
        box(lidX, lidY, z, hx * 2 * (1 - k * .87), 1.3 * shut + .1, hz * 2, DARK_WOOD, 0, 0, -k * .12);
        for (let i = 0; i < 6; i++) {
          box(lidX, lidY + .66 * shut + .07, z - hz + (i + .5) * hz / 3,
            hx * 2 * (1 - k * .87), .07, hz / 3 - .045, WOOD);
        }
        part("ring", lidX + .6 * shut, lidY + .7 * shut + .13, z + .8, .18, .18, .18, "#c7ac71", Math.PI / 2);
        leaves(x, z, hx, hz, 1 - s.clear, y + 1.4);
      } else if (s.id === "comboCrateLift") {
        // Pad and switch are visual props only; E4a owns the grab/lift targets.
        const padX = ox - 1, padZ = oz - 1.4, py = groundY(padX, padZ);
        box(padX, py + .1, padZ, 1.7, .2, 1.7, "#aeb7a0");
        part("ring", padX, py + .21, padZ, .6, .6, .6, "#82baae", Math.PI / 2);
        box(padX - 1.2, py + 1.45, padZ, .22, 2.9, .22, DARK_WOOD);
        box(padX - 1.2, py + 2.75, padZ + .05, .65, .55, .3, k > .5 ? "#99d68c" : "#d6ac53");
        const cx = ox + (padX - ox) * s.a, cz = oz + (padZ - oz) * s.a;
        const cy = groundY(cx, cz) + .61 + k * 1.95;
        box(cx, cy, cz, 1.12, 1.12, 1.12, WOOD);
        for (let i = 0; i < 4; i++) {
          box(cx - .42 + i * .28, cy, cz + .568, .035, 1.06, .025, DARK_WOOD);
        }
        for (let side = -1; side <= 1; side += 2) {
          box(cx, cy + side * .43, cz + .59, 1.18, .12, .06, "#d4a76a");
          box(cx + side * .59, cy, cz, .06, .13, 1.16, DARK_WOOD);
        }
        box(cx, cy, cz + .6, .12, 1.25, .065, "#d4a76a", 0, 0, -.76);
        // Timber enclosure matches the entire blocker; the hinged bridge drops
        // from its far edge onto the landing as the enclosure retracts.
        box(x, y + .64 * shut, z, hx * 2, 1.28 * shut, hz * 2, DARK_WOOD);
        const angle = shut * Math.PI / 2;
        for (let i = 0; i < 8; i++) {
          const d = (i + .5) * hz / 4;
          box(x, y + .09 + Math.sin(angle) * d, z - hz + Math.cos(angle) * d,
            hx * 2, .09, hz / 4 - .035, WOOD, -angle);
        }
      } else {
        const hot = state === "lit" || done;
        // Cold stone firebox and bellows vent at the real interaction point.
        box(ox, oy + .15, oz, 1.7, .3, 1.5, "#69716b");
        box(ox - .6, oy + .8, oz, .35, 1.3, 1.35, STONE);
        box(ox + .6, oy + .8, oz, .35, 1.3, 1.35, STONE);
        box(ox, oy + 1.5, oz, 1.6, .35, 1.4, "#777e77");
        box(ox, oy + 1.95, oz - .3, .6, .65, .6, "#727b75");
        box(ox, oy + .7, oz - .55, 1, .9, .15, DARK);
        box(ox, oy + .34, oz + .2, 1, .12, .7, hot ? "#ec6b24" : DARK);
        box(ox - k * 1.1, oy + .85 - k * .65, oz + .69,
          1.02, 1.05 * shut + .12, .12, hot ? "#783b28" : "#454c48");
        for (let i = 0; i < 3; i++) box(ox - k * 1.1 - .3 + i * .3, oy + .9 - k * .65, oz + .76,
          .09, .5 * shut + .035, .025, hot ? "#f59c38" : DARK);
        part("ring", ox - .81, oy + .85, oz + .05, .4, .4, .4, "#5b635f", 0, Math.PI / 2);
        for (let i = 0; i < 3; i++) box(ox - .83, oy + .65 + i * .18, oz + .05, .06, .05, .65, "#b4b4a0");
        // The reward chamber is a stone furnace extension, with a full footprint lid.
        box(x, y + .66 * shut, z, hx * 2, 1.32 * shut, hz * 2, "#777e77");
        box(x - k * (hx * 2 + .1), y + .75 * shut + .08, z + hz - .07,
          hx * 2, 1.5 * shut + .1, .16, "#454c48");
        for (let i = 0; i < 5; i++) {
          box(x - hx + .4 + i * (hx * 2 - .8) / 4, y + .06, z - .7,
            .27, .08, .3, hot ? "#d77432" : DARK);
        }
      }
    }
    for (const b of kit.all) {
      b.mesh.count = b.n; b.mesh.visible = b.n > 0; b.n = 0;
      b.mesh.instanceMatrix.needsUpdate = true;
      if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true;
    }
  });
  return <group>{kit.all.map((b, i) => <primitive key={i} object={b.mesh} />)}</group>;
}
