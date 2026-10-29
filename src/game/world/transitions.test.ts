import { describe, expect, it } from 'vitest';
import { gatesOf, isWalkable, moveCircle } from './collision';
import { ENEMY_SPAWNS, lowlandY, STAGES, zoneAt } from './lowland';
import { TRANSITIONS, TRIGGER_DEPTH, passageLocal, passagePoint, passageWalkable, passageFollowerTarget, transitionApproach, transitionLanding, transitionTrigger, transitionEntry, transitionOpen, normalizePassagePosition } from './transitions';
const gates={act2:true,solved:['groveLilies','canopyVines','canopyRope','causewayGate'] as const,cleared:STAGES};

describe('physical stage passage topology',()=>{
 it('has nine independent connections and no direct branch crossover',()=>{
  expect(TRANSITIONS).toHaveLength(9);
  expect(TRANSITIONS.some(t=>[t.a.zone,t.b.zone].includes('grove')&&[t.a.zone,t.b.zone].includes('canopy'))).toBe(false);
  expect(TRANSITIONS.filter(t=>t.a.zone==='camp').map(t=>t.b.zone).sort()).toEqual(['canopy','grove','oldTrail']);
 });
 it('every mouth has valid approach, trigger and landing points, even mounted',()=>{
  for(const def of TRANSITIONS)for(const end of [def.a,def.b])for(const r of [.35,.8])for(const [label,p]of [['approach',transitionApproach(end)],['trigger',transitionTrigger(end)],['landing',transitionLanding(end)]]as const){
   expect.soft(isWalkable(p.x,p.z,gates,r),`${def.id}:${end.zone}:${label}:${r} ${p.x},${p.z}`).toBe(true);
   expect.soft(zoneAt(p.x,p.z),`${def.id}:${label}`).toBe(end.zone);
  }
 });
 it('forward clears gate entry; reverse retreat stays possible; shortcut is separate',()=>{
  const closed={...gates,cleared:[]};
  for(const def of TRANSITIONS){
   expect(transitionOpen(def,def.a,closed),def.id).toBe(!def.clear);
   expect(transitionOpen(def,def.b,closed),`${def.id} return`).toBe(true);
   if(def.obstacle)for(const end of [def.a,def.b])expect(transitionOpen(def,end,{...gates,solved:[]})).toBe(false);
  }
 });
 it('walking cannot cross the opaque backing or bypass zones',()=>{
  for(const def of TRANSITIONS)for(const end of [def.a,def.b])for(const r of [.35,.8]){
   const start=transitionApproach(end),target=passagePoint(end,8);
   const moved=moveCircle(start.x,start.z,target.x,target.z,r,gates);
   expect(zoneAt(moved.x,moved.z),`${def.id}:${end.zone}`).toBe(end.zone);
   expect(passageLocal(end,moved.x,moved.z).depth).toBeLessThanOrEqual(2.8-r+.01);
   expect.soft(passageLocal(end,moved.x,moved.z).depth,`${def.id}:${end.zone}:${r}`).toBeGreaterThanOrEqual(TRIGGER_DEPTH);
   expect.soft(transitionEntry(moved.x,moved.z,end.zone,gates)?.def.id,`${def.id}:${end.zone}:${r}`).toBe(def.id);
  }
 });
 it('a reverse arrival permits retreat through only that uncleared mouth, including cached collision gates',()=>{
  for(const def of TRANSITIONS.filter(t=>t.clear)){
   const p={solved:[],endings:2,act2:{started:true,cleared:[],retreat:`${def.id}:a`}};
   const permitted=gatesOf(p),locked=gatesOf({...p,act2:{...p.act2,retreat:null}});
   expect(transitionOpen(def,def.a,permitted)).toBe(true);
   expect(transitionOpen(def,def.a,locked)).toBe(false);
   for(const other of TRANSITIONS.filter(t=>t.clear&&t!==def))expect(transitionOpen(other,other.a,permitted)).toBe(false);
  }
  const shortcut=TRANSITIONS.find(t=>t.obstacle)!;
  expect(transitionOpen(shortcut,shortcut.a,{solved:[],retreat:`${shortcut.id}:a`})).toBe(false);
 });
 it('the entire interior floor stays level with its own entrance',()=>{
  for(const def of TRANSITIONS)for(const end of [def.a,def.b])for(const depth of [.1,1,2.5])for(const lateral of [-1,0,1]){
   const p=passagePoint(end,depth,lateral);
   expect(lowlandY(p.x,p.z),`${def.id}:${end.zone}`).toBeCloseTo(lowlandY(end.x,end.z),6);
  }
 });
 it('locked forward mouths stop walkers before the automatic trigger',()=>{
  for(const def of TRANSITIONS.filter(t=>t.clear))for(const r of [.35,.8]){
   const start=transitionApproach(def.a),target=transitionTrigger(def.a);
   const p=moveCircle(start.x,start.z,target.x,target.z,r,{...gates,cleared:[]});
   expect(passageLocal(def.a,p.x,p.z).depth,def.id).toBeLessThan(TRIGGER_DEPTH);
   expect(transitionEntry(p.x,p.z,def.a.zone,{...gates,cleared:[]})).toBeNull();
  }
 });
 it('exterior side walls and the back cap are solid from every approach',()=>{
  for(const def of TRANSITIONS)for(const end of [def.a,def.b])for(const r of [.35,.8]){
   for(const lateral of [-2.8,2.8])for(const depth of [0,1.5,2.8]){
    const p=passagePoint(end,depth,lateral);
    expect(passageWalkable(p.x,p.z,gates,r),`${def.id}:${end.zone}:side`).toBe(false);
   }
   const back=passagePoint(end,3.1);
   expect(passageWalkable(back.x,back.z,gates,r),`${def.id}:${end.zone}:back`).toBe(false);
  }
 });
 it('normalizes saved entrance positions without crossing to the next stage',()=>{
  for(const t of TRANSITIONS)for(const end of [t.a,t.b]){
   const inside=transitionTrigger(end),p=normalizePassagePosition(inside.x,inside.z);
   expect(p).toEqual(transitionLanding(end));expect(zoneAt(p.x,p.z)).toBe(end.zone);
  }
 });
 it('all required enemy homes remain on their stage floor',()=>{
  for(const e of ENEMY_SPAWNS){expect(isWalkable(e.x,e.z,gates,.5),`${e.zone}: ${e.x},${e.z}`).toBe(true);expect(zoneAt(e.x,e.z)).toBe(e.zone);}
 });
 it('arrival followers gather on their stage floor instead of inside the chamber',()=>{
  for(const def of TRANSITIONS)for(const end of [def.a,def.b]){
   const player=transitionLanding(end),inside=passagePoint(end,.7,.8);
   const target=passageFollowerTarget(end.zone,player,inside);
   expect(passageLocal(end,target.x,target.z).depth).toBeLessThan(-3);
   expect(isWalkable(target.x,target.z,gates,.55),`${def.id}:${end.zone}`).toBe(true);
   const normal=passagePoint(end,-4);
   expect(passageFollowerTarget(end.zone,player,normal)).toEqual(normal);
  }
 });
});
