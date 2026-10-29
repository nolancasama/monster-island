import { rt } from '../runtime';
import { getGame, setGame, updateProgress } from '../store';
import { cb, currentZone, enterCombatZone, hooks, playerRadius, settlePassageStance } from '../combat';
import { MONSTERS } from '../data/monsters';
import { companions } from '../logic/progress';
import { gatesOf, nearestWalkable, standY } from '../world/collision';
import { passageLocal, passagePoint, transitionEntry, transitionLanding, TRANSITIONS, type TransitionEnd } from '../world/transitions';
import { keyboardMove } from '../../input/keyboard';
import { isRunning } from './script';
import { zoneAt } from '../world/lowland';
import { saveNow } from './story';
import { audio } from '../../audio/audio';

const paint = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const delay = (ms:number) => new Promise<void>(resolve=>window.setTimeout(resolve,ms));
const endId = (id:string,side:'a'|'b') => `${id}:${side}`;

/** Normal movement enters a real chamber; the capped back can never be walked through. */
export function passageTick(): boolean {
  const g=getGame(),state=rt.passage,p=rt.player;
  if(state.active || g.screen!=="game" || g.mode!=="explore" || !g.progress.act2.started ||
    g.settingsOpen || g.journalOpen || isRunning() || cb.knockedOut || p.climbY!==null) return false;
  if(state.blockedEnd && rt.time>=state.cooldownUntil){
    const [id,side]=state.blockedEnd.split(':');
    const def=TRANSITIONS.find(d=>d.id===id),end=def?.[side as 'a'|'b'];
    const movement=keyboardMove();
    const released=Math.hypot(movement.x+rt.joy.x,movement.y+rt.joy.y)<.01;
    if(!end || passageLocal(end,p.x,p.z).depth < -2.2 || released) state.blockedEnd=null;
  }
  if(rt.time<state.cooldownUntil) return false;
  const entry=transitionEntry(p.x,p.z,currentZone(),gatesOf(g.progress));
  if(!entry) return false;
  const side=entry.from===entry.def.a?'a':'b';
  if(state.blockedEnd===endId(entry.def.id,side) || p.vx*entry.from.nx+p.vz*entry.from.nz < .05) return false;
  void travel(entry.def.id,entry.from,entry.to,side);
  return true;
}

async function travel(id:string,from:TransitionEnd,to:TransitionEnd,side:'a'|'b') {
  const state=rt.passage,p=rt.player;
  const source=transitionLanding(from);
  state.active=true;state.from=from.zone;state.to=to.zone;
  state.stable={...source,yaw:Math.atan2(-from.nx,-from.nz),zone:from.zone};
  p.frozen=true;p.vx=p.vz=0;
  setGame({mode:"busy",focus:null,passageFade:true,fade:1});
  audio.play('whoosh');
  try {
    // Let the 120 ms CSS fade start on a rendered frame before changing the scene.
    await paint();await delay(125);
    if(rt.passage!==state) return;
    const gates=gatesOf(getGame().progress),landing=transitionLanding(to);
    const safe=nearestWalkable(landing.x,landing.z,playerRadius(),gates);
    p.x=safe.x;p.z=safe.z;p.yaw=Math.atan2(-to.nx,-to.nz);p.y=standY(p.x,p.z,getGame().progress.solved);
    p.vx=p.vz=p.speed=0;cb.knock.x=cb.knock.z=0;
    rt.joy.x=rt.joy.y=0;
    state.stable={...safe,yaw:p.yaw,zone:to.zone};
    enterCombatZone(to.zone,false);
    const def=TRANSITIONS.find(d=>d.id===id)!;
    updateProgress(progress=>({...progress,act2:{...progress.act2,zone:to.zone,
      retreat:side==='b' && def.clear && !progress.act2.cleared.includes(def.clear) ? endId(id,'a') : null
    }}));
    // Relocate friends only while black. Destination hostility controls visibility immediately.
    const progress=getGame().progress;
    for(const [i,friend] of companions(progress).entries()) {
      const m=rt.monsters[friend];
      // Gather on the stage floor ahead of the arrival, never inside the
      // closed-backed chamber behind the player's new facing direction.
      const spot=passagePoint(to,-3.2-Math.floor(i/2)*.9,(i%2?1:-1)*1.1);
      const settled=nearestWalkable(spot.x,spot.z,MONSTERS[friend].radius,gatesOf(progress));
      const at=zoneAt(settled.x,settled.z)===to.zone ? settled : safe;
      m.x=at.x;m.z=at.z;m.mode=friend===progress.active?'follow':'party';m.look=null;m.target=null;m.poofT0=rt.time-1;
      m.air=m.airTarget=MONSTERS[friend].can.includes('fly')?.35:0;
    }
    rt.effects=[];
    settlePassageStance();
    rt.camera.mode='follow';rt.camera.shot=null;rt.camera.yaw=Math.atan2(to.nx,to.nz);rt.camera.snap=true;
    state.last=endId(id,side);state.blockedEnd=endId(id,side==='a'?'b':'a');
    state.cooldownUntil=rt.time+.65;
    await paint();await paint();
    if(rt.passage!==state)return;
    setGame({fade:0});await delay(125);
  } finally {
    if(rt.passage===state){
      state.active=false;state.serial++;p.frozen=false;
      setGame({mode:'explore',passageFade:false,fade:0});
      // Existing port arrival may start its own scene, so notify only after releasing ours.
      if(currentZone()===to.zone)hooks.enterZone?.(to.zone);
      saveNow();
    }
  }
}
