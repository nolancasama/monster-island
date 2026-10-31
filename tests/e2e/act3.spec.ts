import { expect, test, type Page } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { boot, chooseMode, hook, state, tap, waitFor, type MiState } from "./helpers";
import { newProgress } from "../../src/game/logic/progress";
import { newAct3, type Act3 } from "../../src/game/logic/act3";
import { BEACON, CANOPY_GLIDE, CLOUD_ENEMY_SPAWNS, CLOUD_PUZZLE_BARRIERS, CLOUD_PUZZLE_RULES, CLOUD_ELECTRIC_PANELS, CLOUD_ROUTE_GATES, CLOUD_SPAWNS, OBSERVATORY, ROUTE_MOUTHS, type CloudPuzzleId } from "../../src/game/world/cloudisle";
import { BEACON_PYLONS, type BeaconState, type PylonPhase } from "../../src/game/logic/beacon";

type CloudState = MiState & { progress: MiState["progress"] & { act3: Act3 }; act3: { world: string; scene: string; drawing: boolean; zone: string; voyage: {active:boolean;stage:string}; mountedWorlds: string[]; squallLift:number; beacon: BeaconState; electricPanels: Array<{active:boolean;phase:number}> } };
const cloudState = (page: Page) => state(page) as Promise<CloudState>;
const folder = ".tmp/shots/act3";

function harborSave(voyageDone = false) {
  const p = newProgress();
  for (const id of ["leafy","bubbo","puff","ember","lumo"] as const) p.monsters[id] = {discovered:true,friend:true,asked:{},canKnown:{},described:{name:true,size:true,part:true},invited:true};
  p.active = "leafy"; p.metMaple = true; p.endings = 3; p.bag = {fish:5,apples:5};
  p.solved = ["fallenPalm","river","bridge","cliff","lava","cave","gateLeaf","gateDrop","gateWing","gateFlame"];
  p.act2 = {...p.act2,started:true,lumoTaken:true,descended:true,portFound:true,harbor:true,bought:true,checkpoint:"port",zone:"port",cleared:["forest1","grove","canopy","causeway","coast"],tutorial:["attack","coins","special","eat","rest","switch"]};
  p.act3.voyageDone = voyageDone;
  return JSON.stringify({v:4,progress:p,player:{x:76,z:-328,yaw:Math.PI},seconds:3000});
}

async function seed(page: Page, voyageDone = false) {
  await page.addInitScript(save => {
    if (!sessionStorage.getItem("act3-seeded")) {localStorage.setItem("mi.save.v4",save);localStorage.setItem("mi.debug.save",save);sessionStorage.setItem("act3-seeded","1");}
  },harborSave(voyageDone));
}
async function use(page: Page, name: string, touch: boolean) {
  await hook(page,"goTo",name,1.25);
  await waitFor(page,s=>s.mode === "explore" && s.focus?.id === name,30_000,`focus ${name}`);
  if (touch) await page.getByTestId("touch-action").click();
  else await page.keyboard.press("KeyE");
}

async function openShip(page: Page) {
  await hook(page,"openCloudShip",true);
  await waitFor(page,s=>s.cloudIsleOpen,5_000,"HARNESS_PRECONDITION_FAILED: e2e ship hook");
}
async function openShipFromDebugMenu(page: Page) {
  await page.keyboard.press("Control+Shift+KeyD");
  await expect(page.getByTestId("debug-cloud-ship"), "HARNESS_PRECONDITION_FAILED: debug ship control").toHaveText("Cloud Isle ship: locked");
  await page.getByTestId("debug-cloud-ship").click();
  await expect(page.getByTestId("debug-cloud-ship")).toHaveText("Cloud Isle ship: open");
  await page.keyboard.press("Escape");
}
async function defeat(page: Page, i: number, touch: boolean) {
  for (let n=0;n<30;n++) {
    const s=await state(page), e=s.act2.enemies.find(e=>e.i===i);
    if (e && (e.state==="ko" || e.state==="gone")) return;
    await hook(page,"nearEnemy",i,1.4); await hook(page,"setHp",100);
    if (touch) {await page.getByTestId("btn-basic").dispatchEvent("pointerdown");await page.waitForTimeout(650);await page.getByTestId("btn-basic").dispatchEvent("pointerup");}
    else {await page.keyboard.down("KeyJ");await page.waitForTimeout(650);await page.keyboard.up("KeyJ");}
  }
  throw new Error(`Cloud enemy ${i} survived 30 real attack attempts`);
}

/** Pause in the frame that shows the beat, before a CPU screenshot can miss it. */
async function pauseAt(page: Page, wanted: {scene?: string; attack?: BeaconState["attack"]; pylon?: {i:number;phase:PylonPhase}; panel?: "safe"|"warning"|"active"; minShipZ?:number; minSquallLift?:number}) {
  await page.waitForFunction(w => {
    const api=(window as unknown as {__mi:{state():CloudState;timeScale(k:number):void}}).__mi;
    const s=api.state(), b=s.act3.beacon, phase=s.act3.electricPanels[0]?.phase;
    const matches=(!w.scene || s.act3.scene===w.scene) && (!w.attack || b.attack===w.attack) &&
      (!w.pylon || b.pylons[w.pylon.i].phase===w.pylon.phase) &&
      (!w.panel || (w.panel==="safe" ? phase<1.8 : w.panel==="warning" ? phase>=1.8 && phase<2.4 : phase>=2.4)) &&
      (w.minShipZ===undefined || s.act2.ship.z>=w.minShipZ) &&
      (w.minSquallLift===undefined || s.act3.squallLift>=w.minSquallLift);
    if(matches) {api.timeScale(0);return true;}
    return false;
  },wanted,{polling:"raf",timeout:60_000});
}

async function attack(page: Page, touch: boolean) {
  if(touch) {
    await page.getByTestId("btn-basic").dispatchEvent("pointerdown");
    await page.waitForTimeout(650);
    await page.getByTestId("btn-basic").dispatchEvent("pointerup");
  } else {
    await page.keyboard.down("KeyJ"); await page.waitForTimeout(650); await page.keyboard.up("KeyJ");
  }
}

for (const size of [{width:1366,height:768},{width:1280,height:800}]) {
  const label=`${size.width}x${size.height}`, touch=size.width===1280;
  test(`Act 3 full chapter, both routes, boss retry, ending and return travel ${label}${touch ? " touch only" : ""}`,async({page})=>{
    test.setTimeout(Number(process.env.MI_LONG_TIMEOUT ?? 900_000));
    await page.setViewportSize(size); await seed(page);
    const errors=await boot(page); await chooseMode(page,"tap");
    await page.getByTestId("btn-continue").click();
    await waitFor(page,s=>s.mode==="explore");
    if(touch) await hook(page,"set",{touch:true});
    const report: Array<{name:string;calls:number;triangles:number;fps:number}> = [];
    const shot=async(name:string)=>{
      await mkdir(folder,{recursive:true}); await hook(page,"snapCamera"); await hook(page,"renderFrames",3);
      const s=await cloudState(page);
      await page.screenshot({path:`${folder}/${name}-${label}.png`});
      report.push({name:`${name}-${label}`,...s.perf});
      expect(s.perf.calls,`${name} calls`).toBeLessThanOrEqual(120);
      expect(s.perf.triangles,`${name} triangles`).toBeLessThanOrEqual(140_000);
      expect(s.act3.mountedWorlds).toHaveLength(1);
    };
    const solve = async (id: CloudPuzzleId) => {
      const rule = CLOUD_PUZZLE_RULES[id];
      await hook(page,"set",{progress:{...(await cloudState(page)).progress,active:rule.friend}});
      await hook(page,"setMp",rule.friend,0);
      await use(page,id,touch); await tap(page,"canHelp");
      await waitFor(page,s=>Boolean(s.prompt?.choices.includes(rule.command)));
      await shot(`${id}-before`);
      // Freeze regeneration at the command itself to prove the free ability
      // works at exactly zero MP, regardless of SwiftShader frame duration.
      await hook(page,"timeScale",0);
      try {
        await hook(page,"setMp",rule.friend,0);
        expect((await state(page)).act2.mp[rule.friend]).toBe(0);
        await tap(page,rule.command);
      } finally { await hook(page,"timeScale",1); }
      await tap(page,"thankYou");
      await waitFor(page,s=>s.mode==="explore");
      if(id.startsWith("obs")) expect((await cloudState(page)).progress.act3.observatoryLamps).toContain(rule.friend);
      else expect((await cloudState(page)).progress.act3.puzzles).toContain(id);
      await shot(`${id}-after`);
    };
    const move = async (x: number,z: number) => {
      const at = await hook(page,"moveTo",x,z) as {x:number;z:number};
      expect(Math.hypot(at.x-x,at.z-z),`walk to ${x},${z}`).toBeLessThan(.1);
      await hook(page,"renderFrames",3);
    };
    const clearBand = async (area: string,minZ: number,maxZ: number) => {
      for (const [i,e] of CLOUD_ENEMY_SPAWNS.entries()) if(e.zone===area && e.z>=minZ && e.z<maxZ) {
        await defeat(page,i,touch);
        expect((await state(page)).micState).not.toBe("listening");
      }
    };

    await openShip(page);
    await use(page,"harbor",touch); await tap(page,"yesLetsGo");
    for(const beat of ["raiseSail","turnLeft"]){await waitFor(page,s=>Boolean(s.prompt?.choices.includes(beat)));await shot(beat);await tap(page,beat);}
    await waitFor(page,s=>Boolean(s.prompt?.choices.includes("itsWindy"))); await shot("weather");
    await tap(page,"itsSunny"); await tap(page,"itsWindy");
    // Observe and pause in the renderer's own frame: fast-mode reveal lasts only
    // a few frames, so a round trip after tapping Look can miss the airship.
    // At SwiftShader's .1s clock cap the centre crossing can be one frame;
    // slow only this capture so the RAF observer has several matching frames.
    await hook(page,"timeScale",.1);
    const reveal = page.waitForFunction(() => {
      const api=(window as unknown as {__mi:{state():CloudState;timeScale(k:number):void}}).__mi;
      const s=api.state();
      if(s.act3.voyage.stage==="reveal" && s.act2.ship.visible && Math.abs(s.act2.ship.x)<15) {api.timeScale(0);return true;}
      return false;
    },undefined,{polling:"raf",timeout:60_000});
    try {await tap(page,"look"); await reveal; await shot("reveal");}
    finally {await hook(page,"timeScale",1);}
    await waitFor(page,s=>s.mode==="explore" && (s as CloudState).progress.act3.world==="cloud",60_000,"landed on Cloud Isle");
    expect((await cloudState(page)).progress.act3.voyageDone).toBe(true); await shot("dock");
    await hook(page,"cloudArea","stormbreakCoast");
    await waitFor(page,s=>s.mode==="explore" && (s as CloudState).act3.zone==="stormbreakCoast"); await shot("coast");
    await clearBand("stormbreakCoast",0,158);
    await waitFor(page,s=>(s as CloudState).progress.act3.cleared.includes("stormbreakCoast"));
    await hook(page,"cloudArea","hiddenHollow");
    await waitFor(page,s=>Boolean(s.prompt?.choices.includes("imAFriend"))); await shot("discovery"); await tap(page,"imAFriend");
    await waitFor(page,s=>Boolean(s.prompt?.choices.includes("yesItIs"))); await shot("trust"); await tap(page,"yesItIs"); await tap(page,"yesICan");
    await waitFor(page,s=>Boolean(s.prompt?.choices.includes("whereLumo"))); await expect(page.getByTestId("lumo-drawing")).toBeVisible(); await shot("drawing"); await tap(page,"whereLumo");
    await waitFor(page,s=>s.mode==="explore" && (s as CloudState).progress.act3.family.tunnelOpen);
    await shot("hollow");
    await hook(page,"setHp",2); await hook(page,"setMp","puff",0); await use(page,"hollowRest",touch);
    await waitFor(page,s=>s.mode==="explore" && (s as CloudState).progress.act3.checkpoint==="hollow");
    expect((await state(page)).act2.hp).toBe(100); await shot("rest");
    await use(page,"bo",touch); await tap(page,"yesIDo"); await waitFor(page,s=>s.mode==="explore");
    expect((await cloudState(page)).progress.act3.stew).toBe(1);
    await hook(page,"setHp",40); await page.getByTestId("bag-stew").click(); expect((await state(page)).act2.hp).toBeGreaterThanOrEqual(90);

    // Both coast puzzles retain the existing Can-you exchange and are free at 0 MP.
    for(const [friend,puzzle,verb] of [["puff","coastWindmill","cmdBlow"],["leafy","coastCrate","cmdPull"]]) {
      await hook(page,"set",{progress:{...(await cloudState(page)).progress,active:friend}}); await hook(page,"setMp",friend,0);
      await use(page,puzzle,touch); await tap(page,"canHelp"); await tap(page,verb); await tap(page,"thankYou"); await waitFor(page,s=>s.mode==="explore");
    }
    await use(page,"kikoBag",touch); await hook(page,"cloudArea","hiddenHollow"); await use(page,"kiko",touch); await waitFor(page,s=>s.mode==="explore");
    await hook(page,"cloudArea","backTunnel"); await shot("tunnel");
    await hook(page,"cloudArea","windfallJunction"); await waitFor(page,s=>(s as CloudState).act3.zone==="windfallJunction"); await shot("junction");
    await use(page,"cloudJunctionChest",touch); await waitFor(page,s=>s.mode==="explore");
    for(const pickup of ["junctionWood1","junctionWood2","junctionWood3","canopyMouthMoss"]) await use(page,pickup,touch);
    await hook(page,"cloudArea","hiddenHollow"); await use(page,"tala",touch); await waitFor(page,s=>s.mode==="explore");
    expect((await cloudState(page)).progress.act3.errands).toMatchObject({bagRewarded:true,firewoodRewarded:true,mossRewarded:true}); await shot("hollow-upgraded");

    for(const route of [
      {area:"skyrootCanopy",mouth:ROUTE_MOUTHS[0],first:"canopyVine",second:"canopyGlide",moss:"canopyMoss",wood:"canopyWood",chest:"cloudCanopyChest",
        firstBefore:{x:-34,z:309},firstAfter:{x:-36,z:315},middle:{x:-50,z:332},secondBefore:CANOPY_GLIDE.from,secondAfter:CANOPY_GLIDE.to,
        bands:[290,310,350,390],far:{x:-26,z:395},gate:CLOUD_ROUTE_GATES[0],
        upper:[[-38,361],[-49,377],[-42,389],[-28,394],[-26,395]],exit:[[-20,400],[0,402]],lower:[[-36,315],[-30,301],[-30,298]]},
      {area:"thunderGrotto",mouth:ROUTE_MOUTHS[1],first:"grottoRaft",second:"grottoBoiler",moss:"grottoMoss",wood:"grottoWood",chest:"cloudCrystalChest",
        // Entry chamber, the lake's raft channel, the machinery chamber's boiler
        // gate, the electric corridor, and the last cave point before the exit gate.
        firstBefore:{x:52,z:319.5},firstAfter:{x:52,z:325},middle:{x:52,z:336},secondBefore:{x:38.3,z:358},secondAfter:{x:36,z:364.5},
        bands:[290,305,340,360],far:{x:25,z:387},gate:CLOUD_ROUTE_GATES[1],
        upper:[[30,374],[28,384],[25,387]],exit:[[10,401],[0,402]],lower:[[52,325],[52,318],[48,312],[40,306],[28,298]]},
    ] as const) {
      await hook(page,"cloudArea","windfallJunction");
      // Route mouths are immediately open; no Junction clear or gate is needed.
      await move(route.mouth.x,route.mouth.z); await move(CLOUD_SPAWNS[route.area].x,CLOUD_SPAWNS[route.area].z);
      await waitFor(page,s=>(s as CloudState).act3.zone===route.area); await shot(route.area);
      await use(page,route.wood,touch); await clearBand(route.area,route.bands[0],route.bands[1]);
      await hook(page,"teleport",route.firstBefore.x,route.firstBefore.z);
      await waitFor(page,s=>!(s as CloudState).progress.act3.puzzles.includes(route.first) && Math.hypot(s.player.x-route.firstBefore.x,s.player.z-route.firstBefore.z)<.1,15_000,"HARNESS_PRECONDITION_FAILED: first puzzle unresolved at its near lip");
      const firstBlocked=await hook(page,"moveTo",route.firstAfter.x,route.firstAfter.z) as {z:number}; expect(firstBlocked.z).toBeLessThan(CLOUD_PUZZLE_BARRIERS.find(b=>b.puzzle===route.first)!.z0);
      await solve(route.first); await move(route.firstAfter.x,route.firstAfter.z); await move(route.middle.x,route.middle.z);
      await clearBand(route.area,route.bands[1],route.bands[2]); await use(page,route.moss,touch);
      await hook(page,"teleport",route.secondBefore.x,route.secondBefore.z);
      await waitFor(page,s=>!(s as CloudState).progress.act3.puzzles.includes(route.second) && Math.hypot(s.player.x-route.secondBefore.x,s.player.z-route.secondBefore.z)<.1,15_000,"HARNESS_PRECONDITION_FAILED: second puzzle unresolved at its near lip");
      const secondBlocked=await hook(page,"moveTo",route.secondAfter.x,route.secondAfter.z) as {z:number}; expect(secondBlocked.z).toBeLessThan(CLOUD_PUZZLE_BARRIERS.find(b=>b.puzzle===route.second)!.z0);
      await solve(route.second);
      if(route.area==="skyrootCanopy") {
        const s=await state(page); expect(s.player.z).toBeGreaterThan(CANOPY_GLIDE.to.z-1.1);
        expect(s.player.riding).toBe(false); expect(s.player.climbing).toBe(false);
      }
      await move(route.secondAfter.x,route.secondAfter.z);
      for(const [x,z] of route.upper) await move(x,z);
      await waitFor(page,s=>!(s as CloudState).progress.act3.cleared.includes(route.area) && Math.hypot(s.player.x-route.far.x,s.player.z-route.far.z)<.1,15_000,"HARNESS_PRECONDITION_FAILED: route uncleared at its far gate");
      const gateBlocked=await hook(page,"moveTo",route.exit[0][0],route.exit[0][1]) as {z:number}; expect(gateBlocked.z).toBeLessThan(route.gate.z);
      await clearBand(route.area,route.bands[2],route.bands[3]);
      await waitFor(page,s=>(s as CloudState).progress.act3.cleared.includes(route.area));
      if(route.area==="skyrootCanopy") await solve("canopyGust");
      await use(page,route.chest,touch); await waitFor(page,s=>s.mode==="explore");
      expect((await cloudState(page)).progress.act3.chests).toContain(route.chest);
      if(route.area==="thunderGrotto") {
        // Defeated enemies cannot interfere with this stationary panel probe.
        const panel=CLOUD_ELECTRIC_PANELS[0];
        await hook(page,"teleport",panel.x,panel.z); await hook(page,"setHp",100);
        await pauseAt(page,{panel:"safe"});
        try {await shot("electric-safe");} finally {await hook(page,"timeScale",1);}
        await pauseAt(page,{panel:"warning"});
        try {await shot("electric-warning");} finally {await hook(page,"timeScale",1);}
        const before=await state(page);
        await waitFor(page,s=>s.act2.hp<before.act2.hp,15_000,"electric panel light damage");
        const after=await state(page);
        expect(before.act2.hp-after.act2.hp).toBeLessThanOrEqual(10);
        expect(Math.hypot(after.player.x-before.player.x,after.player.z-before.player.z)).toBeLessThan(.05);
        await pauseAt(page,{panel:"active"});
        try {await shot("electric-active");} finally {await hook(page,"timeScale",1);}
      }
      await hook(page,"teleport",route.far.x,route.far.z); await shot(`${route.area}-clear`);
      // Reload the actual autosave inside a solved route, with no fixture reset.
      await page.waitForTimeout(5200); await page.reload(); await page.getByTestId("btn-continue").click(); await waitFor(page,s=>s.mode==="explore");
      if(touch) await hook(page,"set",{touch:true});
      expect((await cloudState(page)).act3.zone).toBe(route.area);
      expect((await cloudState(page)).progress.act3.puzzles).toEqual(expect.arrayContaining([route.first,route.second]));
      await shot(`${route.area}-reload`);
      for(const [x,z] of route.exit) await move(x,z);
      await waitFor(page,s=>(s as CloudState).act3.zone==="observatoryApproach"); await shot(`observatory-from-${route.area}`);
      // Each permanent route gate joins the same open Observatory entrance.
      await move(0,OBSERVATORY.z-1); await move(0,OBSERVATORY.z+2);
      await waitFor(page,s=>(s as CloudState).act3.zone==="ancientObservatory");
      await shot(`observatory-entry-${route.area}`);
      // The cleared route allows walking back to the Junction without a cut.
      await move(0,OBSERVATORY.z-1); await move(OBSERVATORY.entrance.x,OBSERVATORY.entrance.z);
      for(const [x,z] of [...route.exit].reverse()) await move(x,z);
      for(const [x,z] of [...route.upper].reverse()) await move(x,z);
      if(route.area==="skyrootCanopy") {
        await use(page,"glideBack",touch);
        // The return glide is a scripted 1.8 s hop; walk on only once it has landed.
        await waitFor(page,s=>s.mode==="explore" && Math.hypot(s.player.x-CANOPY_GLIDE.from.x,s.player.z-CANOPY_GLIDE.from.z)<.1,15_000,"glide back landed");
      }
      else await move(route.secondBefore.x,route.secondBefore.z);
      await move(route.middle.x,route.middle.z);
      for(const [x,z] of route.lower) await move(x,z);
      await move(route.mouth.x,route.mouth.z); await move(0,270);
    }

    await hook(page,"cloudArea","observatoryApproach");
    await use(page,"observatoryRest",touch); await waitFor(page,s=>s.mode==="explore");
    expect((await cloudState(page)).progress.act3.checkpoint).toBe("observatory");
    await move(0,OBSERVATORY.z-1); await move(0,OBSERVATORY.z+2); await shot("observatory");
    await clearBand("ancientObservatory",OBSERVATORY.entrance.z-2,OBSERVATORY.lift.z+5);
    await waitFor(page,s=>(s as CloudState).progress.act3.cleared.includes("ancientObservatory"));
    // The lift remains closed until every friend's permanent lamp is lit.
    await hook(page,"teleport",0,OBSERVATORY.lift.z-3);
    await waitFor(page,s=>(s as CloudState).progress.act3.cleared.includes("ancientObservatory") && (s as CloudState).progress.act3.observatoryLamps.length<4 && Math.abs(s.player.z-(OBSERVATORY.lift.z-3))<.1,15_000,"HARNESS_PRECONDITION_FAILED: observatory cleared with incomplete lamps at lift");
    expect((await hook(page,"moveTo",0,OBSERVATORY.lift.z+3) as {z:number}).z).toBeLessThan(OBSERVATORY.lift.z);
    for(const id of ["obsPuff","obsLeafy","obsEmber","obsBubbo"] as const) await solve(id);
    expect((await cloudState(page)).progress.act3.observatoryLamps).toEqual(expect.arrayContaining(["leafy","bubbo","puff","ember"]));
    await hook(page,"teleport",0,OBSERVATORY.z+11); await shot("observatory-dial-complete");
    await page.waitForTimeout(5200); await page.reload(); await page.getByTestId("btn-continue").click(); await waitFor(page,s=>s.mode==="explore");
    if(touch) await hook(page,"set",{touch:true});
    expect((await cloudState(page)).act3.zone).toBe("ancientObservatory");
    expect((await cloudState(page)).progress.act3.observatoryLamps).toHaveLength(4);
    await shot("observatory-reload");

    const ascend=async()=>{
      await use(page,"beaconLift",touch);
      await waitFor(page,s=>s.mode==="explore" && (s as CloudState).act3.beacon.active,30_000,"Storm Beacon fight starts");
      expect((await state(page)).micState).not.toBe("listening");
    };
    const downPylon=async(i:number,name:string)=>{
      if((await cloudState(page)).act3.beacon.pylons[i].phase==="down") return;
      // Clicking the already-active friend's chip opens its chat, which blocks attacks.
      if((await cloudState(page)).progress.active!=="leafy") await page.getByTestId("team-leafy").click();
      const p=BEACON_PYLONS[i];
      await hook(page,"teleport",p.x,p.z-2.3,0);
      await pauseAt(page,{pylon:{i,phase:"exposed"}});
      try {await shot(`${name}-exposed`);} finally {await hook(page,"timeScale",1);}
      for(let attempt=0;attempt<6;attempt++) {
        if((await cloudState(page)).act3.beacon.pylons[i].phase==="down") return;
        await attack(page,touch);
      }
      expect((await cloudState(page)).act3.beacon.pylons[i].phase,`${name} real attack`).toBe("down");
    };
    await ascend(); await shot("beacon-arena");
    await page.getByTestId("team-puff").click();
    await hook(page,"teleport",0,(BEACON.z - 4),Math.PI/2);
    await pauseAt(page,{attack:"gustTell"});
    try {
      await shot("beacon-gust-telegraph");
      const gust=(await cloudState(page)).act3.beacon.gust;
      await hook(page,"teleport",0,(BEACON.z - 4),Math.atan2(gust.x,gust.z));
      await attack(page,touch);
      expect((await cloudState(page)).act3.beacon.gustCancelled).toBe(true);
    } finally {await hook(page,"timeScale",1);}
    await shot("beacon-gust-cancelled");
    await pauseAt(page,{attack:"lightningTell"});
    try {await shot("beacon-lightning-telegraph");} finally {await hook(page,"timeScale",1);}
    // One pylon falls, then a real marked lightning strike causes the loss.
    await downPylon(0,"beacon-retry-first-pylon");
    expect((await cloudState(page)).act3.beacon.power).toBe(2);
    await pauseAt(page,{attack:"lightningTell"});
    const ring=(await cloudState(page)).act3.beacon.rings[0];
    await hook(page,"teleport",ring.x,ring.z); await hook(page,"setHp",1);
    await hook(page,"timeScale",1);
    await waitFor(page,s=>s.mode==="explore" && s.act2.hp>=60 && s.player.z<OBSERVATORY.entrance.z+2,60_000,"wake at Observatory after lightning defeat");
    expect((await cloudState(page)).act3.beacon.power).toBe(3);
    expect((await cloudState(page)).act3.beacon.pylons.every(p=>p.phase!=="down")).toBe(true);
    expect((await cloudState(page)).progress.act3.observatoryLamps).toHaveLength(4);
    await shot("beacon-defeat-wake");

    await ascend(); await downPylon(0,"beacon-before-reload");
    await hook(page,"teleport",0,(BEACON.z - 9)); await page.waitForTimeout(5200);
    await page.reload(); await page.getByTestId("btn-continue").click(); await waitFor(page,s=>s.mode==="explore");
    if(touch) await hook(page,"set",{touch:true});
    await waitFor(page,s=>(s as CloudState).act3.beacon.active);
    expect((await cloudState(page)).act3.beacon.power).toBe(3);
    expect((await cloudState(page)).act3.beacon.pylons.every(p=>p.phase!=="down")).toBe(true);
    await shot("beacon-reload-clean");

    // Bubbo's actual Splash rewards the charge telegraph before normal exposure.
    await page.getByTestId("team-bubbo").click();
    await hook(page,"teleport",BEACON_PYLONS[0].x,BEACON_PYLONS[0].z-3,0);
    await pauseAt(page,{pylon:{i:0,phase:"charging"}});
    try {await shot("beacon-pylon-charge");} finally {await hook(page,"timeScale",1);}
    await attack(page,touch);
    expect((await cloudState(page)).act3.beacon.pylons[0].shorted).toBe(true);
    await downPylon(0,"beacon-pylon-1");
    expect((await cloudState(page)).act3.beacon.power).toBe(2); await shot("beacon-pylon-1-down");
    await downPylon(1,"beacon-pylon-2");
    expect((await cloudState(page)).act3.beacon.power).toBe(1); await shot("beacon-pylon-2-down");
    expect((await state(page)).act2.enemies.filter(e=>e.zone==="stormBeacon" && e.state!=="ko" && e.state!=="gone").length).toBeLessThanOrEqual(2);

    // Hold each actual dialogue beat; fast-mode say() otherwise advances on
    // a real 30ms timer even while the simulation is paused for screenshots.
    await page.evaluate(()=>{const url=new URL(location.href);url.searchParams.delete("fast");history.replaceState(null,"",url);});
    const resolution=(async()=>{
      for(const beat of ["powerDown","stormBreak","squallRope","lumoGlow","skyFortress","chapterClear"]) {
        await pauseAt(page,{scene:beat,...(beat==="squallRope" ? {minSquallLift:4} : {}),...(beat==="skyFortress" ? {minShipZ:405} : {})});
        try {
          await shot(`resolution-${beat}`);
          if(beat==="powerDown") await shot("beacon-pylon-3-down");
          if(beat==="lumoGlow") expect((await state(page)).act2.ship.cage).toBe(true);
        } finally {await hook(page,"timeScale",1);}
        if(beat==="stormBreak" || beat==="lumoGlow" || beat==="skyFortress") {
          await expect(page.getByTestId("next")).toBeVisible({timeout:30_000});
          await page.getByTestId("next").click();
        }
      }
    })();
    await downPylon(2,"beacon-pylon-3");
    await resolution;
    await waitFor(page,s=>s.mode==="explore" && (s as CloudState).progress.act3.skyFortressClue);
    await page.evaluate(()=>{const url=new URL(location.href);url.searchParams.set("fast","1");history.replaceState(null,"",url);});
    expect((await cloudState(page)).progress.act3.beaconDefeated).toBe(true);
    expect((await state(page)).progress.act2.lumoTaken).toBe(true);
    expect((await state(page)).objective.id).toBe("skyFortress");
    await page.getByTestId("btn-journal").click(); await page.getByTestId("journal-tab-lumo").click();
    await expect(page.getByTestId("journal-lumo-taken")).toContainText("Find the Sky Fortress");
    await page.getByTestId("journal-close").click();
    await hook(page,"cloudArea","hiddenHollow");
    await waitFor(page,s=>Boolean(s.prompt?.choices.includes("yesIWill")));
    await shot("aftermath-lumo-promise"); await tap(page,"yesIWill");
    await waitFor(page,s=>Boolean(s.prompt?.choices.includes("itsSunny")));
    await shot("aftermath-weather"); await tap(page,"itsSunny");
    await waitFor(page,s=>s.mode==="explore" && (s as CloudState).progress.act3.family.aftermathSeen);
    await shot("hollow-aftermath");
    await hook(page,"cloudArea","cloudDock"); await shot("dock-cleared-sky");

    // Autosave, Continue and boats exercise the actual persistent world, never a replay fixture.
    await page.waitForTimeout(5200); await page.reload(); await page.getByTestId("btn-continue").click(); await waitFor(page,s=>s.mode==="explore");
    if(touch) await hook(page,"set",{touch:true});
    expect((await cloudState(page)).act3.world).toBe("cloud"); expect((await cloudState(page)).act3.voyage.active).toBe(false);
    expect((await cloudState(page)).progress.act3).toMatchObject({beaconDefeated:true,skyFortressClue:true,family:{aftermathSeen:true}});
    await use(page,"cloudGull",touch); await tap(page,"yesLetsGo"); await waitFor(page,s=>s.mode==="explore" && (s as CloudState).act3.world==="home");
    await openShip(page);
    await use(page,"harbor",touch); await tap(page,"yesLetsGo"); await waitFor(page,s=>s.mode==="explore" && (s as CloudState).act3.world==="cloud");
    expect((await cloudState(page)).progress.act3.family.tunnelOpen).toBe(true);
    if(touch) await expect(page.getByTestId("joystick")).toBeVisible();
    expect(errors).toEqual([]);
    let existing: typeof report = [];
    try {existing=JSON.parse(await readFile(`${folder}/render-report.json`,"utf8")).views;} catch { /* first size */ }
    await writeFile(`${folder}/render-report.json`,JSON.stringify({budget:{calls:120,triangles:140000},views:[...existing.filter(v=>!v.name.endsWith(label)),...report]},null,2));
  });
}

for (const voyageDone of [false, true]) {
  test(`default ship lock keeps Gull at Port Town (voyageDone=${voyageDone})`, async ({ page }) => {
    await seed(page, voyageDone);
    await boot(page, "");
    await chooseMode(page, "tap");
    await expect(page.getByTestId("btn-continue"), "HARNESS_PRECONDITION_FAILED: harbour save available").toBeVisible();
    await page.getByTestId("btn-continue").click();
    await waitFor(page, s => s.mode === "explore" && s.progress.act2.harbor && !s.cloudIsleOpen, 30_000, "HARNESS_PRECONDITION_FAILED: locked harbour lead save");
    const before = await cloudState(page);
    expect(before.progress.act3).toMatchObject({ world: "home", voyageDone });
    await hook(page, "goTo", "harbor", 1.25);
    await waitFor(page, s => s.mode === "explore" && s.focus?.id === "harbor", 30_000, "HARNESS_PRECONDITION_FAILED: Gull in focus");
    const at = (await state(page)).player;
    await page.keyboard.press("KeyE");
    await expect(page.getByTestId("line")).toHaveText("The ship to Cloud Isle isn't ready yet. Coming soon!");
    expect((await state(page)).prompt).toBeNull();
    await page.screenshot({ path: `.tmp/shots/act3/coming-soon-dialogue-${voyageDone}.png` });
    await page.getByTestId("next").click();
    await waitFor(page, s => s.mode === "explore");
    const after = await cloudState(page);
    expect(after.act2.banner).toBe("Cloud Isle — Coming Soon!");
    expect(after.act3.voyage.active).toBe(false);
    expect(after.act3.world).toBe("home");
    expect(after.act2.zone).toBe("port");
    expect(after.player.x).toBe(at.x);
    expect(after.player.z).toBe(at.z);
    expect(after.progress.act3).toEqual(before.progress.act3);
    await page.screenshot({ path: `.tmp/shots/act3/coming-soon-notice-${voyageDone}.png` });
  });
}

test("the ?debug=1 ship toggle opens Gull's voyage offer for testing", async ({ page }) => {
  await seed(page);
  await boot(page, "debug=1&fast=1");
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, s => s.mode === "explore" && s.progress.act2.harbor && !s.cloudIsleOpen, 30_000, "HARNESS_PRECONDITION_FAILED: locked harbour lead save");
  await openShipFromDebugMenu(page);
  expect((await state(page)).cloudIsleOpen).toBe(true);
  await hook(page, "goTo", "harbor", 1.25);
  await waitFor(page, s => s.mode === "explore" && s.focus?.id === "harbor", 30_000, "HARNESS_PRECONDITION_FAILED: Gull in focus");
  await page.keyboard.press("KeyE");
  await waitFor(page, s => Boolean(s.prompt?.choices.includes("yesLetsGo")), 15_000, "voyage offer");
  expect((await cloudState(page)).act3.world).toBe("home");
});

test("Act 3 test fixtures cannot grant Cloud Isle without the harbour lead",async({page})=>{
  await boot(page); await chooseMode(page,"tap"); await page.getByTestId("btn-start").click(); await waitFor(page,s=>s.mode==="explore");
  await hook(page,"setAct3",{...newAct3(),world:"cloud",voyageDone:true});
  expect((await cloudState(page)).progress.act3.world).toBe("home");
});
