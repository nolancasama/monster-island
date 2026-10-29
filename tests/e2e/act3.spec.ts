import { expect, test, type Page } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { boot, chooseMode, hook, state, tap, waitFor, type MiState } from "./helpers";
import { newProgress } from "../../src/game/logic/progress";
import { newAct3, type Act3 } from "../../src/game/logic/act3";
import { CLOUD_ENEMY_SPAWNS, CLOUD_PUZZLE_RULES, CLOUD_ELECTRIC_PANELS, type CloudPuzzleId } from "../../src/game/world/cloudisle";

type CloudState = MiState & { progress: MiState["progress"] & { act3: Act3 }; act3: { world: string; scene: string; drawing: boolean; zone: string; voyage: {active:boolean;stage:string}; mountedWorlds: string[]; electricPanels: Array<{active:boolean}> } };
const cloudState = (page: Page) => state(page) as Promise<CloudState>;
const folder = ".tmp/shots/act3";

function harborSave() {
  const p = newProgress();
  for (const id of ["leafy","bubbo","puff","ember","lumo"] as const) p.monsters[id] = {discovered:true,friend:true,asked:{},canKnown:{},described:{name:true,size:true,part:true},invited:true};
  p.active = "leafy"; p.metMaple = true; p.endings = 3; p.bag = {fish:5,apples:5};
  p.solved = ["fallenPalm","river","bridge","cliff","lava","cave","gateLeaf","gateDrop","gateWing","gateFlame"];
  p.act2 = {...p.act2,started:true,lumoTaken:true,descended:true,portFound:true,harbor:true,bought:true,checkpoint:"port",zone:"port",cleared:["forest1","grove","canopy","causeway","coast"],tutorial:["attack","coins","special","eat","rest","switch"]};
  return JSON.stringify({v:4,progress:p,player:{x:76,z:-328,yaw:Math.PI},seconds:3000});
}

async function seed(page: Page) {
  await page.addInitScript(save => {
    if (!sessionStorage.getItem("act3-seeded")) {localStorage.setItem("mi.save.v4",save);sessionStorage.setItem("act3-seeded","1");}
  },harborSave());
}
async function use(page: Page, name: string, touch: boolean) {
  await hook(page,"goTo",name,1.25);
  await waitFor(page,s=>s.mode === "explore" && s.focus?.id === name,30_000,`focus ${name}`);
  if (touch) await page.getByTestId("touch-action").click();
  else await page.keyboard.press("KeyE");
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

for (const size of [{width:1366,height:768},{width:1280,height:800}]) {
  const label=`${size.width}x${size.height}`, touch=size.width===1280;
  test(`Act 3 voyage, family, both mountain routes and return travel ${label}${touch ? " touch only" : ""}`,async({page})=>{
    test.setTimeout(600_000);
    await page.setViewportSize(size); await seed(page);
    const errors=await boot(page); await chooseMode(page,"tap");
    await page.getByTestId("btn-continue").click();
    await waitFor(page,s=>s.mode==="explore");
    if(touch) await hook(page,"set",{touch:true});
    const report: Array<{name:string;calls:number;triangles:number;fps:number}> = [];
    const shot=async(name:string)=>{
      await mkdir(folder,{recursive:true}); await hook(page,"renderFrames",3);
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
      expect((await cloudState(page)).progress.act3.puzzles).toContain(id);
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

    await use(page,"harbor",touch); await tap(page,"yesLetsGo");
    for(const beat of ["raiseSail","turnLeft"]){await waitFor(page,s=>Boolean(s.prompt?.choices.includes(beat)));await shot(beat);await tap(page,beat);}
    await waitFor(page,s=>Boolean(s.prompt?.choices.includes("itsWindy"))); await shot("weather");
    await tap(page,"itsSunny"); await tap(page,"itsWindy");
    // Observe and pause in the renderer's own frame: fast-mode reveal lasts only
    // a few frames, so a round trip after tapping Look can miss the airship.
    const reveal = page.waitForFunction(() => {
      const api=(window as unknown as {__mi:{state():CloudState;timeScale(k:number):void}}).__mi;
      const s=api.state();
      if(s.act3.voyage.stage==="reveal" && s.act2.ship.visible && Math.abs(s.act2.ship.x)<15) {api.timeScale(0);return true;}
      return false;
    },undefined,{polling:"raf",timeout:60_000});
    await tap(page,"look"); await reveal;
    try {await shot("reveal");} finally {await hook(page,"timeScale",1);}
    await waitFor(page,s=>s.mode==="explore" && (s as CloudState).progress.act3.world==="cloud",60_000,"landed on Cloud Isle");
    expect((await cloudState(page)).progress.act3.voyageDone).toBe(true); await shot("dock");
    await hook(page,"cloudArea","stormbreakCoast");
    await waitFor(page,s=>s.mode==="explore" && (s as CloudState).act3.zone==="stormbreakCoast"); await shot("coast");
    await clearBand("stormbreakCoast",0,100);
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
      {area:"skyrootCanopy",x:-20,first:"canopyVine",second:"canopyGlide",moss:"canopyMoss",wood:"canopyWood",chest:"cloudCanopyChest"},
      {area:"thunderGrotto",x:20,first:"grottoRaft",second:"grottoBoiler",moss:"grottoMoss",wood:"grottoWood",chest:"cloudCrystalChest"},
    ] as const) {
      await hook(page,"cloudArea","windfallJunction");
      // Route mouths are immediately open; no Junction clear or gate is needed.
      await move(route.x/2,99); await move(route.x,106);
      await waitFor(page,s=>(s as CloudState).act3.zone===route.area); await shot(route.area);
      await use(page,route.wood,touch); await clearBand(route.area,104,110);
      await hook(page,"teleport",route.x,108);
      const firstBlocked=await hook(page,"moveTo",route.x,113) as {z:number}; expect(firstBlocked.z).toBeLessThan(110);
      await solve(route.first); await move(route.x,114);
      await clearBand(route.area,110,120); await use(page,route.moss,touch);
      await hook(page,"teleport",route.x,117);
      const secondBlocked=await hook(page,"moveTo",route.x,123) as {z:number}; expect(secondBlocked.z).toBeLessThan(119);
      await solve(route.second);
      if(route.area==="skyrootCanopy") {
        const s=await state(page); expect(s.player.z).toBeGreaterThan(120.5);
        expect(s.player.riding).toBe(false); expect(s.player.climbing).toBe(false);
      }
      await move(route.x,123);
      const gateBlocked=await hook(page,"moveTo",route.x/2,131) as {z:number}; expect(gateBlocked.z).toBeLessThan(127);
      await clearBand(route.area,120,130);
      await waitFor(page,s=>(s as CloudState).progress.act3.cleared.includes(route.area));
      if(route.area==="skyrootCanopy") await solve("canopyGust");
      await use(page,route.chest,touch); await waitFor(page,s=>s.mode==="explore");
      expect((await cloudState(page)).progress.act3.chests).toContain(route.chest);
      if(route.area==="thunderGrotto") {
        // Defeated enemies cannot interfere with this stationary panel probe.
        const panel=CLOUD_ELECTRIC_PANELS[0];
        await hook(page,"teleport",panel.x,panel.z); await hook(page,"setHp",100);
        await waitFor(page,s=>!(s as CloudState).act3.electricPanels[0].active);
        await hook(page,"timeScale",0);
        try {await shot("electric-safe");} finally {await hook(page,"timeScale",1);}
        const before=await state(page);
        await waitFor(page,s=>s.act2.hp<before.act2.hp,15_000,"electric panel light damage");
        const after=await state(page);
        expect(before.act2.hp-after.act2.hp).toBeLessThanOrEqual(10);
        expect(Math.hypot(after.player.x-before.player.x,after.player.z-before.player.z)).toBeLessThan(.05);
        await hook(page,"timeScale",0);
        try {await shot("electric-active");} finally {await hook(page,"timeScale",1);}
      }
      await hook(page,"teleport",route.x,123); await shot(`${route.area}-clear`);
      // Reload the actual autosave inside a solved route, with no fixture reset.
      await page.waitForTimeout(5200); await page.reload(); await page.getByTestId("btn-continue").click(); await waitFor(page,s=>s.mode==="explore");
      if(touch) await hook(page,"set",{touch:true});
      expect((await cloudState(page)).act3.zone).toBe(route.area);
      expect((await cloudState(page)).progress.act3.puzzles).toEqual(expect.arrayContaining([route.first,route.second]));
      await shot(`${route.area}-reload`);
      await move(route.x,124); await move(route.x/2,131); await move(0,132);
      await waitFor(page,s=>(s as CloudState).act3.zone==="observatoryApproach"); await shot(`observatory-from-${route.area}`);
      const closedEntrance=await hook(page,"moveTo",0,137) as {z:number}; expect(closedEntrance.z).toBeLessThan(135); // the closed door is at z 137
      // The cleared route allows walking back to the Junction without a cut.
      await move(0,132); await move(route.x/2,131); await move(route.x,124);
      await move(route.x,106); await move(route.x/2,99); await move(0,90);
    }

    // Autosave, Continue and boats exercise the actual persistent world, never a replay fixture.
    await page.waitForTimeout(5200); await page.reload(); await page.getByTestId("btn-continue").click(); await waitFor(page,s=>s.mode==="explore");
    if(touch) await hook(page,"set",{touch:true});
    expect((await cloudState(page)).act3.world).toBe("cloud"); expect((await cloudState(page)).act3.voyage.active).toBe(false);
    await use(page,"cloudGull",touch); await tap(page,"yesLetsGo"); await waitFor(page,s=>s.mode==="explore" && (s as CloudState).act3.world==="home");
    await use(page,"harbor",touch); await tap(page,"yesLetsGo"); await waitFor(page,s=>s.mode==="explore" && (s as CloudState).act3.world==="cloud");
    expect((await cloudState(page)).progress.act3.family.tunnelOpen).toBe(true);
    if(touch) await expect(page.getByTestId("joystick")).toBeVisible();
    expect(errors).toEqual([]);
    let existing: typeof report = [];
    try {existing=JSON.parse(await readFile(`${folder}/render-report.json`,"utf8")).views;} catch { /* first size */ }
    await writeFile(`${folder}/render-report.json`,JSON.stringify({budget:{calls:120,triangles:140000},views:[...existing.filter(v=>!v.name.endsWith(label)),...report]},null,2));
  });
}

test("Act 3 test fixtures cannot grant Cloud Isle without the harbour lead",async({page})=>{
  await boot(page); await chooseMode(page,"tap"); await page.getByTestId("btn-start").click(); await waitFor(page,s=>s.mode==="explore");
  await hook(page,"setAct3",{...newAct3(),world:"cloud",voyageDone:true});
  expect((await cloudState(page)).progress.act3.world).toBe("home");
});
