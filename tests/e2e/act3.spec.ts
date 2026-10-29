import { expect, test, type Page } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { boot, chooseMode, hook, state, tap, waitFor, type MiState } from "./helpers";
import { newProgress } from "../../src/game/logic/progress";
import { newAct3, type Act3 } from "../../src/game/logic/act3";
import { CLOUD_ENEMY_SPAWNS } from "../../src/game/world/cloudisle";

type CloudState = MiState & { progress: MiState["progress"] & { act3: Act3 }; act3: { world: string; scene: string; drawing: boolean; zone: string; voyage: {active:boolean;stage:string}; mountedWorlds: string[] } };
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
  test(`slice A voyage, family, errands and return travel ${label}${touch ? " touch only" : ""}`,async({page})=>{
    test.setTimeout(420_000);
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

    await use(page,"harbor",touch); await tap(page,"yesLetsGo");
    for(const beat of ["raiseSail","turnLeft"]){await waitFor(page,s=>Boolean(s.prompt?.choices.includes(beat)));await shot(beat);await tap(page,beat);}
    await waitFor(page,s=>Boolean(s.prompt?.choices.includes("itsWindy"))); await shot("weather");
    await tap(page,"itsSunny"); await tap(page,"itsWindy"); await tap(page,"look");
    await waitFor(page,s=>s.mode==="explore" && (s as CloudState).progress.act3.world==="cloud",60_000,"landed on Cloud Isle");
    expect((await cloudState(page)).progress.act3.voyageDone).toBe(true); await shot("dock");
    await hook(page,"cloudArea","stormbreakCoast");
    await waitFor(page,s=>s.mode==="explore" && (s as CloudState).act3.zone==="stormbreakCoast"); await shot("coast");
    for(let i=0;i<CLOUD_ENEMY_SPAWNS.length;i++) await defeat(page,i,touch);
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
    for(const pickup of ["junctionWood1","junctionWood2","junctionWood3","canopyMouthMoss"]) await use(page,pickup,touch);
    await hook(page,"cloudArea","hiddenHollow"); await use(page,"tala",touch); await waitFor(page,s=>s.mode==="explore");
    expect((await cloudState(page)).progress.act3.errands).toMatchObject({bagRewarded:true,firewoodRewarded:true,mossRewarded:true}); await shot("hollow-upgraded");

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
