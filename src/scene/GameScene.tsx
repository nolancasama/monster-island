import { useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { rt } from "../game/runtime";
import { tick } from "../game/sim";
import { FarLand, River, Rocks, Sea, SkyAndLights, Terrain, Vegetation } from "./Environment";
import { Props } from "./Props";
import { Maple, Player } from "./Characters";
import { Monsters } from "./Monsters";
import { Effects } from "./Effects";
import { CameraRig } from "./CameraRig";

/** Renderer stats for the test hook (draw calls / triangles per frame). */
export const perf = { calls: 0, triangles: 0, fps: 0 };

function Clock() {
  const frames = useRef({ n: 0, t: 0 });
  // Runs before everything else each frame.
  useFrame((state, dt) => {
    const d = Math.min(dt, 0.1);
    rt.time += d;
    tick(d);
    perf.calls = state.gl.info.render.calls;
    perf.triangles = state.gl.info.render.triangles;
    const f = frames.current;
    f.n++;
    f.t += dt;
    if (f.t > 1) {
      perf.fps = Math.round(f.n / f.t);
      f.n = 0;
      f.t = 0;
    }
  }, -10);
  return null;
}

/**
 * School Chromebooks: start sharp (up to 1.5x), and if frames stay under
 * ~28 fps for 4 s of play, drop to 1x once and never flip back (flipping
 * would stutter). Teachers never need a graphics setting.
 */
export const dprState = { dpr: 0, dropped: false };

function AdaptiveDpr() {
  const { setDpr, gl } = useThree();
  const slow = useRef(0);
  useFrame((_, dt) => {
    dprState.dpr = gl.getPixelRatio();
    if (dprState.dropped || dt > 0.5) return;
    if (gl.getPixelRatio() <= 1) return;
    slow.current = dt > 1 / 28 ? slow.current + dt : Math.max(0, slow.current - dt * 0.5);
    if (slow.current > 4) {
      dprState.dropped = true;
      setDpr(1);
    }
  });
  return null;
}

export function GameScene() {
  return (
    <Canvas
      className="scene"
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ fov: 55, near: 0.1, far: 900, position: [0, 6, 24] }}
      flat
    >
      <Clock />
      <AdaptiveDpr />
      <SkyAndLights />
      <Terrain />
      <Sea />
      <River />
      <Rocks />
      <Vegetation />
      <FarLand />
      <Props />
      <Player />
      <Maple />
      <Monsters />
      <Effects />
      <CameraRig />
    </Canvas>
  );
}
