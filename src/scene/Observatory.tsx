import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { rt } from "../game/runtime";
import { useGame } from "../game/store";
import { COMPANION_IDS, type CompanionId } from "../game/data/combat";
import { BEACON, CLOUD_OBSTACLE_PLACE, OBSERVATORY, cloudY } from "../game/world/cloudisle";
import { flatMat, additiveSprite } from "./materials";
import { PartBuilder } from "./partBuilder";
import { lumoParts } from "./models/monsters";
import { addKit, observatoryBay, observatoryGear, shelterRoofPatch } from "./models/cloudKit";

const colors: Record<CompanionId,string> = {leafy:"#91df73",bubbo:"#6adcf4",puff:"#e7ceff",ember:"#ffb467"};
const brass = "#b49b59", stone = "#8d9897";

function observatoryGeometry() {
  const b = new PartBuilder();
  b.box(19,.65,22,0,21.35,(OBSERVATORY.z + 7),stone);
  // The surviving tall window frames open directly onto the clouds. The
  // camera-side facade is ruined, keeping the fixed follow view unobstructed.
  for (const x of [-9,9]) for (const z of [(OBSERVATORY.z - 1),(OBSERVATORY.z + 5),(OBSERVATORY.z + 11),(OBSERVATORY.z + 17)]) {
    if (z===(OBSERVATORY.z - 1) || z===(OBSERVATORY.z + 17)) b.box(.65,7,.8,x,22,z,stone);
    if (z<(OBSERVATORY.z + 17) && z!==(OBSERVATORY.z + 5)) { b.box(.8,.6,5.3,x,28.5,z+3,stone); b.box(.5,.15,5.3,x,23.5,z+3,brass); }
  }
  for (const x of [-6,-2,2,6]) b.box(.65,6,.8,x,22,(OBSERVATORY.z + 17),stone);
  b.box(17,.6,.9,0,28,(OBSERVATORY.z + 17),stone);
  b.torus(3,.18,[0,22.12,(OBSERVATORY.dial.z - .5)],[Math.PI/2,0,0],brass);
  b.cyl(2.7,2.8,.14,0,22,(OBSERVATORY.dial.z - .5),"#3b5863",24);
  b.cyl(.1,.12,.2,0,22.1,(OBSERVATORY.dial.z - .5),brass,6);
  for (let i=0;i<12;i++) {
    const a=i*Math.PI/6;
    b.boxAt(.15,.05,.4,[Math.sin(a)*2.3,22.19,(OBSERVATORY.dial.z - .5)+Math.cos(a)*2.3],[0,a,0],brass);
  }
  // Broken upper walkways and fallen brass gear teeth establish the ruin.
  for (const side of [-1,1]) {
    addKit(b, observatoryBay(side), [side*9,22,(OBSERVATORY.dial.z - .5)]);
    for (let i=0;i<4;i++) b.boxAt(.9,.3,.7,[side*(7-i*.4),22.2,(OBSERVATORY.z - 1)+i*.3],[.1,i*.4,.15],stone);
    addKit(b, observatoryGear(), [side*7,25.35,(OBSERVATORY.z + 13)], side*.2);
    b.box(1.2,1.1,1.1,side*7.4,22,(OBSERVATORY.z + 1),"#766044");
    b.add(new THREE.TorusGeometry(.22,.05,4,12,Math.PI*1.45),"#eadc9c",[side*7.4,22.7,OBSERVATORY.z + .43],[0,0,-.7]);
  }
  // The forecourt where both routes arrive.
  b.box(32,.3,7,0,21.85,(OBSERVATORY.entrance.z + .5),"#8f8d7f");
  for (const side of [-1,1]) {
    // A side terrace (its mechanism stands on the outer edge) with a broken balustrade.
    b.box(18,.65,12,side*17,21.35,(OBSERVATORY.z + 8),stone);
    for (let i=0;i<6;i++) if (i!==2) {
      const z=(OBSERVATORY.z + 3)+i*2.2, h=.6+(i%3)*.25;
      b.box(.55,h,1.6,side*25.7,22+h/2-.05,z,stone);
      b.box(.7,.14,1.8,side*25.7,22+h,z,brass);
    }
    // A plank walkway to a broken tower on its round platform.
    b.boxAt(3.4,.25,6.6,[side*22,21.95,(OBSERVATORY.z + 16.5)],[0,side*-.67,0],"#9d875f");
    b.cyl(6.5,6.8,.65,side*24,21.35,(OBSERVATORY.z + 21),stone,12);
    // The tower's surviving north wall: staggered courses, broken at the top.
    for (let i=0;i<7;i++) {
      const a=-.2+i*.5, h=5+((i*37)%5)*1.6, x=side*24+Math.sin(a)*side*6, z=(OBSERVATORY.z + 21)+Math.cos(a)*6;
      b.boxAt(2.4,h,1.1,[x,22+h/2,z],[0,side*a,0],i%2?stone:"#7e8778");
    }
    b.box(.6,.2,6,side*24,22.1,(OBSERVATORY.z + 21),brass);
  }
  b.box(2.3,.15,2.3,OBSERVATORY.rest.x,22,OBSERVATORY.rest.z,"#dac79e");
  b.cyl(.35,.5,1,OBSERVATORY.rest.x+1,22,OBSERVATORY.rest.z,"#7c916b",6);
  return b.build();
}

function Mechanism({friend,solved}:{friend:CompanionId;solved:boolean}) {
  const id = `obs${friend[0].toUpperCase()}${friend.slice(1)}` as "obsLeafy"|"obsBubbo"|"obsPuff"|"obsEmber";
  const p = CLOUD_OBSTACLE_PLACE[id];
  const rotor=useRef<THREE.Group>(null);
  const geo=useMemo(()=>{
    const b=new PartBuilder();
    b.cyl(1.2,1.4,.25,0,0,0,"#596d76",8);
    b.cyl(.35,.5,1,0,.25,0,brass,8);
    if(friend==="leafy") { b.box(.8,.2,.65,0,1.1,0,brass); b.cyl(.1,.1,1,0,1.2,0,"#71915e",6); }
    if(friend==="bubbo") { b.box(2.3,.2,1.3,0,.25,0,"#78b4c5"); b.cyl(.1,.1,2.4,0,.4,0,brass,6); }
    if(friend==="puff") b.cyl(.14,.23,2.6,0,.25,0,brass,7);
    if(friend==="ember") { b.sphere(.8,0,.95,0,"#80634d",[1,1.2,1],8); b.cyl(.16,.2,1.2,.7,1,0,brass,6); }
    return b.build();
  },[friend]);
  const blades=useMemo(()=>{
    const b=new PartBuilder();
    b.torus(friend==="bubbo"?.95:.45,.07,[0,0,0],[0,0,0],brass);
    for(let i=0;i<4;i++) {
      const a=i*Math.PI/2;
      b.boxAt(.24,1,.12,[Math.sin(a)*.6,Math.cos(a)*.6,0],[0,0,-a],colors[friend]);
    }
    return b.build();
  },[friend]);
  const glow=useMemo(()=>additiveSprite(colors[friend],.6),[friend]);
  useFrame(()=>{
    if(!rotor.current)return;
    rotor.current.rotation.z = friend==="leafy" ? (solved?-.7:.5) : friend==="ember" ? (solved?Math.PI/2:0) : rt.time*(solved?1.2:.08);
  });
  return <group position={[p.face.x,22,p.face.z]}>
    <mesh geometry={geo} material={flatMat}/>
    <group ref={rotor} position={[0,friend==="puff"?2.65:1.25,-.15]}><mesh geometry={blades} material={flatMat}/></group>
    <sprite material={glow} position={[0,.7,0]} scale={solved?[2,2,1]:[.35,.35,1]}/>
  </group>;
}

export function Observatory() {
  const a=useGame(s=>s.progress.act3);
  const geo=useMemo(observatoryGeometry,[]);
  const needle=useRef<THREE.Mesh>(null);
  const details=useRef<THREE.Group>(null);
  const platform=useRef<THREE.Mesh>(null);
  const lift=useMemo(()=>{
    const b=new PartBuilder();
    for(let z=(OBSERVATORY.z + 17);z<(BEACON.z - 8);z+=.4) for(const x of [-1.65,1.65]) b.box(.18,.25,.5,x,cloudY(0,z)-.26,z,brass);
    for(const x of [-2.3,2.3]) b.cyl(.12,.12,16,x,22,OBSERVATORY.lift.z,brass,6);
    return b.build();
  },[]);
  useFrame(()=>{
    if(needle.current)needle.current.rotation.y=rt.time*.16;
    if(details.current)details.current.visible=Math.hypot(rt.camera.pos.x,rt.camera.pos.z-(OBSERVATORY.dial.z - .5))<46;
    if(platform.current) {
      const z=rt.player.z>=(OBSERVATORY.z + 16) && rt.player.z<=(OBSERVATORY.z + 23.5) ? Math.max((OBSERVATORY.z + 17),Math.min((OBSERVATORY.z + 23),rt.player.z)) : (OBSERVATORY.z + 17);
      platform.current.position.set(0,cloudY(0,z)-.12,z);
    }
  });
  return <>
    <mesh geometry={geo} material={flatMat}/>
    <group ref={details}>
    {COMPANION_IDS.map((id,i)=><group key={id}>
      <Mechanism friend={id} solved={a.observatoryLamps.includes(id)}/>
      <mesh position={[Math.sin(i*Math.PI/2)*1.5,22.3,(OBSERVATORY.dial.z - .5)+Math.cos(i*Math.PI/2)*1.5]}>
        <sphereGeometry args={[.25,8,6]}/><meshBasicMaterial color={a.observatoryLamps.includes(id)?colors[id]:"#26353c"}/>
      </mesh>
    </group>)}
    <mesh ref={needle} position={[0,22.25,(OBSERVATORY.dial.z - .5)]}><boxGeometry args={[.12,.06,3.5]}/><meshBasicMaterial color="#f9e4a2"/></mesh>
    {a.observatoryLamps.length===4 && <><mesh geometry={lift} material={flatMat}/><mesh ref={platform}><boxGeometry args={[3.2,.24,2.2]}/><meshLambertMaterial color="#c7ad70"/></mesh></>}
    </group>
  </>;
}

/** A hollow, moving ring: individually readable puffs with large gaps, never
 * a solid dome. One instanced draw, one flicker draw, no lights or shadows. */
export function SummitWeather() {
  const defeated=useGame(s=>s.progress.act3.beaconDefeated);
  const puffs=useRef<THREE.InstancedMesh>(null), lightning=useRef<THREE.Mesh>(null);
  const dummy=useMemo(()=>new THREE.Object3D(),[]);
  const spread=useRef(defeated?1:0);
  const bolts=useMemo(()=>{
    const b=new PartBuilder();
    for(let i=0;i<4;i++) {
      const a=i*Math.PI/2+.4,x=Math.sin(a)*18,z=BEACON.z+Math.cos(a)*18;
      b.boxAt(.09,1.7,.08,[x,39,z],[0,0,-.4],"#c1e9ff");
      b.boxAt(.09,1.3,.08,[x+.4,37.8,z],[0,0,.4],"#e2f5ff");
    }
    return b.build();
  },[]);
  useFrame((_,dt)=>{
    spread.current=THREE.MathUtils.damp(spread.current,defeated?1:0,1.2,dt);
    if(puffs.current) {
      puffs.current.visible=spread.current<.98;
      for(let i=0;i<36;i++) {
        const a=i*Math.PI*2/36+rt.time*.035, radius=18+(i%3)*1.5+spread.current*18;
        dummy.position.set(Math.sin(a)*radius,38+Math.sin(a*3+i)*1.2+spread.current*6,BEACON.z+Math.cos(a)*radius);
        dummy.scale.set(2.4,1.2,1.7);dummy.scale.multiplyScalar(1-spread.current);
        dummy.updateMatrix();puffs.current.setMatrixAt(i,dummy.matrix);
      }
      puffs.current.instanceMatrix.needsUpdate=true;
    }
    if(lightning.current)lightning.current.visible=!defeated && Math.sin(rt.time*2.7)>.985;
  });
  return <><instancedMesh ref={puffs} args={[undefined,undefined,36]} frustumCulled={false}><icosahedronGeometry args={[1,1]}/><meshLambertMaterial color="#65758a"/></instancedMesh><mesh ref={lightning} geometry={bolts} material={flatMat}/></>;
}

export function SkyFortress() {
  const defeated=useGame(s=>s.progress.act3.beaconDefeated);
  const geo=useMemo(()=>{
    const b=new PartBuilder();
    b.add(new THREE.DodecahedronGeometry(9,0),"#7189a5",[0,64,(BEACON.z + 101)],[0,.2,0],[2,.5,1]);
    for(const [x,h] of [[-10,7],[-5,10],[0,14],[6,9],[11,6]]) {
      b.box(3,h,4,x,66,(BEACON.z + 101),"#61758f");b.cone(2,h*.3,x,66+h,(BEACON.z + 101),"#50657f",5);
    }
    return b.build();
  },[]);
  return defeated?<mesh geometry={geo} material={flatMat}/>:null;
}

/** The original cage renderer stays in CombatScene. Only its passenger is
 * posed here, using Lumo's existing model, so no rescue state is introduced. */
export function CagedLumo() {
  const ref=useRef<THREE.Group>(null);
  const parts=useMemo(lumoParts,[]);
  const glow=useMemo(()=>additiveSprite("#fff7a1",.7),[]);
  useFrame(()=>{
    if(!ref.current)return;
    const c=rt.ship.cage;
    ref.current.visible=c.visible && rt.world==="cloud";
    ref.current.position.set(c.x,c.y+.15,c.z);ref.current.rotation.y=Math.PI;
  });
  return <group ref={ref} visible={false}>
    <mesh geometry={parts.body} material={flatMat}/>
    <mesh geometry={parts.eyes} material={flatMat} position={[0,parts.eyeY,0]}/>
    {parts.parts.map(p=><mesh key={p.name} geometry={p.geo} material={flatMat} position={p.pivot}/>)}
    <sprite material={glow} position={[0,1,0]} scale={[2.8,2.8,1]}/>
  </group>;
}

export function HollowAftermath() {
  const defeated=useGame(s=>s.progress.act3.beaconDefeated);
  const geo=useMemo(()=>{
    const b=new PartBuilder();
    // Fresh planks patch the family's own roof; a warm pool marks the sun
    // reaching through the waterfall entrance, without an extra light.
    addKit(b, shelterRoofPatch(), [-14 + 3.5*.65,14.3,199]);
    b.add(new THREE.CircleGeometry(3.2,24),"#cfc49a",[-10,4.015,193],[-Math.PI/2,0,0],[1,1.3,1]);
    return b.build();
  },[]);
  return defeated?<mesh geometry={geo} material={flatMat}/>:null;
}
