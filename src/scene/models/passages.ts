import * as THREE from "three";
import { PASSAGE_DEPTH, PASSAGE_HALF } from "../../game/world/transitions";
import { PartBuilder } from "../partBuilder";
import { between, rockGeometry } from "./nature";

/** All pieces face +z into the passage. The front is open, but the walls,
 * ceiling, floor and closed back form a real chamber, not a doorway decal.
 * The brief transition moves the player before reaching the back wall. */
export type PassageStyle = "hollow" | "mangrove" | "trunk" | "roots" | "stone" | "rock" | "harbor" | "shortcut";
export const PASSAGE_INTERIOR = { half: PASSAGE_HALF, height: 3.8, depth: PASSAGE_DEPTH };

function shellRing(b: PartBuilder, color: string, radius: number, depth: number) {
  // Shared outer/inner arch profile; filled top and sides leave a genuine opening.
  const inner: Array<[number, number]> = [[-1.8, -.12], [-1.8, 2.3], [-1.25, 3.45], [0, 3.8], [1.25, 3.45], [1.8, 2.3], [1.8, -.12]];
  const outer: Array<[number, number]> = [[-radius, -.5], [-radius, 2.8], [-radius*.7, 4.9], [0, 5.8], [radius*.7, 4.9], [radius, 2.8], [radius, -.5]];
  const positions: number[] = [];
  const quad = (a: number[], c: number[], d: number[], e: number[]) => positions.push(...a, ...d, ...c, ...a, ...e, ...d);
  for(let i=0;i<inner.length-1;i++) {
    const [ix,iy]=inner[i], [jx,jy]=inner[i+1], [ox,oy]=outer[i], [px,py]=outer[i+1];
    // Outside and inside skins plus annular front/back caps, each wound outward.
    quad([ox,oy,0],[ix,iy,0],[jx,jy,0],[px,py,0]);
    quad([ox,oy,depth],[px,py,depth],[jx,jy,depth],[ix,iy,depth]);
    quad([ox,oy,0],[px,py,0],[px,py,depth],[ox,oy,depth]);
    quad([ix,iy,0],[ix,iy,depth],[jx,jy,depth],[jx,jy,0]);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  geometry.computeVertexNormals();
  b.add(geometry,color,[0,0,0]);
}

/** Exterior and opaque interior are merged into a single inexpensive mesh. */
export function passageShellGeometry(style: PassageStyle): THREE.BufferGeometry {
  const b=new PartBuilder(.1);
  const stone=style==="stone"||style==="rock"||style==="harbor";
  const bark=style==="mangrove"?"#596347":style==="shortcut"?"#596044":"#765136";
  const outer=stone? (style==="stone"?"#999783":"#79776b") : bark;
  const depth=PASSAGE_INTERIOR.depth;
  shellRing(b,outer,stone?3.4:3.3,depth);
  // The chamber has a pitched dark ceiling, thick side walls, a floor and a
  // solid rock/root end. None use alpha, screen-door fading or fog for opacity.
  const dark=stone?"#303831":"#302f22";
  // shellRing already supplies the opaque side lining. A second coplanar
  // wall would flicker against it when looking into the entrance.
  b.box(3.8,.2,depth,0,-.22,depth/2,"#494431");
  b.box(3.8,4.1,.42,0,-.15,depth+.02,dark);
  // Low-relief structure inside the back keeps the depth legible even in shade.
  for(const x of [-1.25,-.4,.45,1.3]) b.box(.12,3.2,.12,x,.1,depth-.23,stone?"#3d4439":"#3d3c28");
  if(stone) {
    for(const side of [-1,1])for(let i=0;i<3;i++) {
      if(style==="stone")b.boxAt(1.3,.95,1.2,[side*2.45,.5+i*1.03,.15],[0,side*.05,(i%2?1:-1)*.04],i%2?"#aaa58c":"#8b927c");
      else b.add(rockGeometry(.85,1.8,3300+i+(side+1)*8,0),i%2?"#727768":"#8b8c78",[side*2.85,.8+i*1.15,.1]);
    }
    for(const [x,y]of [[-1.5,4.0],[0,4.7],[1.5,4.0]])
      b.add(rockGeometry(1.1,1,3400+x*5,0),"#9c9a83",[x,y,.1]);
    if(style==="harbor") {
      // A weathered harbour post hints at the town while the opening stays dark.
      b.cyl(.13,.16,2.1,3.55,-.1,-.3,"#8d6f48",6);
      b.box(1.3,.52,.18,3.55,1.5,-.3,"#b59b65");
    }
  } else {
    // Vertical bark ribs and buttress roots distinguish a hollow living trunk
    // from a dressed-stone portal, with no additional lights or transparency.
    for(const side of [-1,1])for(let i=0;i<3;i++) {
      const x=side*(2.02+i*.42);
      between(b,[x,0,-.12],[x*.94,3.0+i*.65,.12],.22,.15,i%2?"#684c32":"#8b6742",6);
      between(b,[x,1.0,.2],[side*(3.2+i*.5),-.1,-1.0-i*.25],.3,.13,bark,6);
    }
    // Twisting root arch, made from closed low-poly cylinders.
    for(let i=0;i<5;i++) {
      const a=Math.PI*i/5, c=Math.PI*(i+1)/5;
      between(b,[Math.cos(a)*2.1,1.65+Math.sin(a)*2.55,-.12],[Math.cos(c)*2.1,1.65+Math.sin(c)*2.55,-.12],.28,.25,"#8b7043",6);
    }
    if(style==="hollow"||style==="trunk") {
      b.cyl(1.25,1.7,3.0,0,5.0,1.8,"#6b4b33",8);
      between(b,[0,6.7,1.8],[2.5,7.3,1.3],.35,.12,"#715239",6);
    }
    if(style==="mangrove"||style==="roots"||style==="shortcut") {
      for(const side of [-1,1]) {
        between(b,[side*3.1,0,-1.2],[side*2.5,3.6,1.5],.36,.22,"#5f6844",6);
        between(b,[side*2.5,3.6,1.5],[side*.6,4.8,2.3],.22,.13,"#67744a",6);
      }
    }
  }
  // Moss, ferns and a few leaves break up the silhouette. Their solid triangles
  // merge with the shell, so each endpoint still costs only one shell draw.
  for(const side of [-1,1]) {
    b.add(rockGeometry(.8,.22,3500+side,0),"#60844b",[side*2.7,3.3,-.12]);
    for(let i=0;i<3;i++)b.add(new THREE.ConeGeometry(.2,1.4,4),"#6e9851",[side*(3.0+i*.23),.35+i*.1,-.6],[side*.5,0,side*.6]);
  }
  return b.build();
}

/** Separate blocker withdraws after its existing first-clear/shortcut unlock.
 * The opaque shell and its back wall never retract with the blocker. */
export function passageBlockerGeometry(style: PassageStyle): THREE.BufferGeometry {
  const b=new PartBuilder(.1);
  if(style==="stone") {
    b.box(3.65,3.8,.36,0,-.1,.18,"#69745e");
    for(const x of [-1.1,0,1.1]) b.box(.12,3.5,.4,x,0,.18,"#92967b");
  } else if(style==="rock"||style==="harbor") {
    for(let x=-1.55;x<1.7;x+=.65)b.box(.24,3.4,.3,x,0,.12,"#7e5e3d");
    b.boxAt(3.6,.3,.35,[0,1.1,-.08],[0,0,.12],"#a27e50");
    b.boxAt(3.6,.3,.35,[0,2.1,-.08],[0,0,-.12],"#96734a");
  } else {
    for(let x=-1.7;x<1.8;x+=.6){
      between(b,[x,-.1,0],[x+.25,3.5,.1],.2,.13,style==="mangrove"?"#4a7953":"#667042",6);
      between(b,[x,.8,-.12],[x-.8,2.5,-.1],.18,.08,"#879451",5);
    }
  }
  return b.build();
}
