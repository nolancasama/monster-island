import type { ObstacleId } from '../types';
import type { StageId, ZoneId } from './lowland';

/** Physical, closed-backed stage entrances. Coordinates are mouths, and the
 * normal points away from the stage floor into the dark passage. */
export interface TransitionEnd { zone: ZoneId; x: number; z: number; nx: number; nz: number }
export type PassageKind = 'hollow' | 'mangrove' | 'trunk' | 'roots' | 'stone' | 'rock' | 'harbor' | 'shortcut';
export interface TransitionDef {
  id: string;
  kind: PassageKind;
  a: TransitionEnd;
  b: TransitionEnd;
  /** Only forward travel a -> b needs this first clear; returning is free. */
  clear?: StageId;
  /** The Old Trail's existing Ember puzzle is required in both directions. */
  obstacle?: 'causewayGate';
}
export interface PassageGates {
  solved: readonly ObstacleId[];
  cleared?: readonly StageId[];
  /** The mouth used to enter an uncleared stage remains available for retreat. */
  retreat?: string | null;
}
export const PASSAGE_HALF = 1.8;
export const PASSAGE_DEPTH = 2.8;
const BACK_FRONT = PASSAGE_DEPTH - .19;
const BACK_REAR = PASSAGE_DEPTH + .23;
export const TRIGGER_DEPTH = 1.05;
export const LANDING_OFFSET = 1.5;
export const APPROACH_OFFSET = 1.8;
export const TRANSITIONS: TransitionDef[] = [
  { id: 'forest-camp', kind: 'hollow', clear: 'forest1', a: { zone:'forest1',x:76,z:-183,nx:0,nz:-1 }, b:{ zone:'camp',x:81,z:-189.5,nx:0,nz:1 } },
  { id: 'camp-grove', kind: 'mangrove', a:{ zone:'camp',x:71.5,z:-198.4,nx:-1,nz:0 }, b:{ zone:'grove',x:65.5,z:-202,nx:1,nz:0 } },
  { id: 'camp-canopy', kind: 'trunk', a:{ zone:'camp',x:81,z:-197,nx:1,nz:0 }, b:{ zone:'canopy',x:88,z:-201,nx:-1,nz:0 } },
  { id: 'grove-causeway', kind: 'roots', clear:'grove', a:{ zone:'grove',x:54,z:-238,nx:2/Math.sqrt(5),nz:-1/Math.sqrt(5) }, b:{ zone:'causeway',x:61,z:-248,nx:0,nz:1 } },
  { id: 'canopy-causeway', kind: 'stone', clear:'canopy', a:{ zone:'canopy',x:100,z:-238,nx:-2/Math.sqrt(5),nz:-1/Math.sqrt(5) }, b:{ zone:'causeway',x:94,z:-248,nx:0,nz:1 } },
  { id: 'causeway-coast', kind: 'rock', clear:'causeway', a:{ zone:'causeway',x:76,z:-261,nx:0,nz:-1 }, b:{ zone:'coast',x:73,z:-268,nx:0,nz:1 } },
  { id: 'coast-port', kind: 'harbor', clear:'coast', a:{ zone:'coast',x:76,z:-286,nx:0,nz:-1 }, b:{ zone:'port',x:76,z:-292,nx:0,nz:1 } },
  { id: 'camp-old-trail', kind: 'shortcut', a:{ zone:'camp',x:76,z:-199.4,nx:0,nz:-1 }, b:{ zone:'oldTrail',x:76,z:-205,nx:0,nz:1 } },
  { id: 'old-trail-causeway', kind: 'shortcut', obstacle:'causewayGate', a:{ zone:'oldTrail',x:76,z:-238.4,nx:0,nz:-1 }, b:{ zone:'causeway',x:76,z:-244.6,nx:0,nz:1 } }
];
export function transitionOpen(def: TransitionDef, from: TransitionEnd | ZoneId, gates: PassageGates): boolean {
  const zone = typeof from === 'string' ? from : from.zone;
  return (!def.obstacle || gates.solved.includes(def.obstacle)) &&
    (zone !== def.a.zone || !def.clear || gates.cleared?.includes(def.clear) === true || gates.retreat === `${def.id}:a`);
}
export function passageLocal(end: TransitionEnd, x: number, z: number) {
  const dx=x-end.x,dz=z-end.z;
  return { depth: dx*end.nx+dz*end.nz, lateral: -dx*end.nz+dz*end.nx };
}
export function passagePoint(end: TransitionEnd, depth: number, lateral = 0) {
  return { x:end.x+end.nx*depth-end.nz*lateral,z:end.z+end.nz*depth+end.nx*lateral };
}
export const transitionLanding = (end: TransitionEnd) => passagePoint(end,-LANDING_OFFSET);
export const transitionApproach = (end: TransitionEnd) => passagePoint(end,-APPROACH_OFFSET);
export const transitionTrigger = (end: TransitionEnd) => passagePoint(end,TRIGGER_DEPTH);

/** Followers gather on the stage floor rather than behind an arriving player
 * inside the chamber. Their usual formation resumes once it fits outside. */
export function passageFollowerTarget(zone:ZoneId|null,player:{x:number;z:number},target:{x:number;z:number}) {
  const p=passageAt(target.x,target.z);
  if(!p || p.end.zone!==zone)return target;
  const at=passageLocal(p.end,player.x,player.z),wanted=passageLocal(p.end,target.x,target.z);
  if(at.depth>=0 || at.depth < -5.5 || Math.abs(at.lateral)>4 || wanted.depth<=-.8 || wanted.depth<=at.depth)return target;
  const depth=Math.min(-3.2,at.depth-1.7);
  // The camp has several nearby mouths. Try the other side if a formation
  // slot would put a friend against another entrance's wall.
  for(const lateral of [wanted.lateral,-wanted.lateral,0]){
    const spot=passagePoint(p.end,depth,lateral);
    if(passageWalkable(spot.x,spot.z,{solved:[]},.65)===undefined)return spot;
  }
  return passagePoint(p.end,depth,wanted.lateral);
}

/** Return the owning mouth nearest this pocket; this ownership is authoritative
 * until the fade commits the destination, even where old zone polygons overlap. */
export function passageAt(x: number, z: number): { def: TransitionDef; end: TransitionEnd; other: TransitionEnd } | null {
  let found: ReturnType<typeof passageAt> = null, score=Infinity;
  for(const def of TRANSITIONS) for(const [end,other] of [[def.a,def.b],[def.b,def.a]]) {
    const q=passageLocal(end,x,z);
    if(q.depth < -1.4 || q.depth > PASSAGE_DEPTH+.7 || Math.abs(q.lateral)>PASSAGE_HALF+.7)continue;
    const d=Math.hypot(x-end.x,z-end.z);
    if(d<score){score=d;found={def,end,other};}
  }
  return found;
}
export function passageZoneAt(x: number,z: number): ZoneId | null {
  return passageAt(x,z)?.end.zone ?? null;
}
/** Overrides only the short pocket. The lining has solid sides and a closed
 * back even when unlocked; the trigger sits comfortably before that back. */
export function passageWalkable(x:number,z:number,gates:PassageGates,r:number): boolean | undefined {
  // The exterior shell is wider than the opening. Check its complete solid
  // footprint independently of pocket ownership so a walker cannot enter the
  // wall from a broad clearing or approach the cap from behind.
  for(const def of TRANSITIONS)for(const end of [def.a,def.b]){
    const q=passageLocal(end,x,z);
    const outer=(def.kind==='stone'||def.kind==='rock'||def.kind==='harbor'?3.4:3.3)+r;
    if(q.depth < -r || q.depth > BACK_REAR+r || Math.abs(q.lateral)>outer)continue;
    if(Math.abs(q.lateral)>PASSAGE_HALF-r || q.depth>BACK_FRONT-r)return false;
  }
  const p=passageAt(x,z);
  if(!p)return undefined;
  const q=passageLocal(p.end,x,z);
  if(q.depth < -r)return undefined;
  // Beyond the front edge, side walls and cap align with the drawn shell.
  if(q.depth < 0)return Math.abs(q.lateral)<=PASSAGE_HALF-r;
  if(Math.abs(q.lateral)>PASSAGE_HALF-r || q.depth>PASSAGE_DEPTH-r)return false;
  if(!transitionOpen(p.def,p.end,gates) && q.depth > .3-r)return false;
  return true;
}
export function transitionEntry(x:number,z:number,zone:ZoneId|null,gates:PassageGates): { def:TransitionDef; from:TransitionEnd; to:TransitionEnd } | null {
  const p=passageAt(x,z);
  if(!p || p.end.zone!==zone || !transitionOpen(p.def,p.end,gates))return null;
  const q=passageLocal(p.end,x,z);
  return q.depth>=TRIGGER_DEPTH-1e-6 && q.depth<=PASSAGE_DEPTH && Math.abs(q.lateral)<=1.05 ? {def:p.def,from:p.end,to:p.other}:null;
}

/** A save never resumes halfway through a closed-backed entrance. Return the
 * stable landing on its own side; no progress flag or scene state is changed. */
export function normalizePassagePosition(x:number,z:number): {x:number;z:number} {
  const p=passageAt(x,z);
  if(!p)return {x,z};
  return passageLocal(p.end,x,z).depth>0 ? transitionLanding(p.end) : {x,z};
}
