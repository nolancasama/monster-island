import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { cb } from "../game/combat";
import { rt } from "../game/runtime";
import { getGame } from "../game/store";
import { groundY } from "../game/world/island";
import { gatesOf } from "../game/world/collision";
import { TRANSITIONS, transitionOpen, type TransitionDef, type TransitionEnd } from "../game/world/transitions";
import { flatMat } from "./materials";
import { passageBlockerGeometry, passageShellGeometry } from "./models/passages";

/** Visible physical mouths live in the world, while their destination remains
 * behind an opaque chamber. Only the active side is drawn. The original stage
 * clear flags animate blockers independently of the permanent tunnel shell. */
function PassageEnd({ passage, end }: { passage: TransitionDef; end: TransitionEnd }) {
  const shell = useMemo(() => passageShellGeometry(passage.kind), [passage.kind]);
  const blocker = useMemo(() => passageBlockerGeometry(passage.kind), [passage.kind]);
  const root = useRef<THREE.Group>(null);
  const blocking = useRef<THREE.Mesh>(null);
  const opened = useRef<number | null>(null);
  useEffect(() => () => { shell.dispose(); blocker.dispose(); }, [shell, blocker]);
  useFrame((_, dt) => {
    const group=root.current, lock=blocking.current;
    if (!group || !lock) return;
    const progress=getGame().progress;
    const open = transitionOpen(passage,end,gatesOf(progress));
    // Initial saved clears start fully open. Subsequent first clears withdraw
    // the blocker smoothly, leaving the opaque physical chamber untouched.
    if(opened.current===null)opened.current=open?1:0;
    opened.current += ((open?1:0)-opened.current)*Math.min(1,dt*6);
    group.visible = progress.act2.started && rt.player.climbY===null && cb.zones.current===end.zone;
    lock.visible = opened.current < .995;
    lock.position.y = -opened.current*3.8;
    lock.scale.y = Math.max(.01,1-opened.current);
  });
  const yaw=Math.atan2(end.nx,end.nz);
  return (
    <group ref={root} name={`passage:${passage.id}:${end.zone}`} position={[end.x,groundY(end.x,end.z),end.z]} rotation={[0,yaw,0]}>
      <mesh name="opaque-passage-shell" geometry={shell} material={flatMat} />
      <mesh name="passage-blocker" ref={blocking} geometry={blocker} material={flatMat} />
    </group>
  );
}

export function StagePassages() {
  return <>{TRANSITIONS.map(passage=><group key={passage.id}>
    <PassageEnd passage={passage} end={passage.a} />
    <PassageEnd passage={passage} end={passage.b} />
  </group>)}</>;
}
