// Visual evidence only. The controller owns behavioral acceptance.
import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import { routeDist } from "./lib/dist-route.mjs";

const directory = ".tmp/shots/expansion/x1";
fs.mkdirSync(directory, { recursive:true });
const report = { status:"incomplete", mode:"disk-route", budget:{ calls:120, triangles:140000 },
  semanticState:"window.__mi.state().progress.act3 (cloudLayout, area, cleared, family, puzzles); act3.scene and act3.beacon",
  views:[], failures:[] };
const flush = () => fs.writeFileSync(directory+"/render-report.json",JSON.stringify(report,null,2)+"\n");
const source = fs.readFileSync("tests/e2e/stubs.ts","utf8");
const stubs = source.slice(source.indexOf("`")+1,source.lastIndexOf("`"));
const friends = Object.fromEntries(["leafy","bubbo","puff","ember","lumo"].map(id=>[id,{
  discovered:true,friend:true,invited:true,asked:{},canKnown:{},described:{name:true,size:true,part:true}
}]));
const seed = JSON.stringify({ v:4, seconds:3000, player:{x:0,z:1,yaw:Math.PI}, progress:{
  monsters:friends,active:"leafy",metMaple:true,endings:3,bag:{fish:5},said:[],
  solved:["fallenPalm","river","bridge","cliff","lava","cave","gateLeaf","gateDrop","gateWing","gateFlame"],
  act2:{started:true,lumoTaken:true,descended:true,portFound:true,harbor:true,bought:true,checkpoint:"port",zone:"port",
    hp:100,mp:{leafy:100,bubbo:100,puff:100,ember:100},coins:25,items:{},upgrades:[],trained:[],chests:[],
    cleared:["forest1","grove","canopy","causeway","coast"],tutorial:["attack","coins","special","eat","rest","switch"]},
  act3:{cloudLayout:2,world:"cloud",voyageDone:true,area:"cloudDock",hollowFound:true,
    family:{met:true,trusted:true,drawingSeen:true,tunnelOpen:true,aftermathSeen:false},
    cleared:["stormbreakCoast","skyrootCanopy","thunderGrotto","ancientObservatory"],
    puzzles:["coastWindmill","coastCrate","canopyVine","canopyGlide","canopyGust","grottoRaft","grottoBoiler","obsLeafy","obsBubbo","obsPuff","obsEmber"],
    observatoryLamps:["leafy","bubbo","puff","ember"],chests:[],errands:{pickups:[]},checkpoint:"hollow"}
}});
let browser;
try {
  browser = await chromium.launch({ args:["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"] });
  for (const [width,height] of [[1366,768],[1280,800]]) {
    const context = await browser.newContext({ viewport:{width,height},deviceScaleFactor:1 });
    const origin = await routeDist(context,"dist");
    const page = await context.newPage();
    page.on("pageerror",e=>report.failures.push(e.message));
    await page.addInitScript(stubs);
    await page.addInitScript(save=>{
      localStorage.setItem("mi.save.v4",save);
      localStorage.setItem("mi.settings.v1",JSON.stringify({mic:false}));
    },seed);
    const call = (name,...args)=>page.evaluate(([n,a])=>window.__mi[n](...a),[name,args]);
    const state = ()=>page.evaluate(()=>window.__mi.state());
    const until = (label,fn)=>expect.poll(async()=>fn(await state()),{timeout:60000,message:"HARNESS_PRECONDITION_FAILED: "+label}).toBe(true);
    await page.goto(origin+"/?e2e=1");
    await expect(page.getByTestId("btn-continue"),"HARNESS_PRECONDITION_FAILED: X1 seed").toBeVisible();
    await page.getByTestId("btn-continue").click();
    await until("cloud exploration",s=>s.mode==="explore" && s.act3.world==="cloud");
    await call("set",{mode:"busy"});
    // One view's failure is recorded and never hides the remaining views.
    async function capture(...args) {
      try { await captureView(...args); }
      catch(error) { report.failures.push(args[0]+": "+String(error).split("\n")[0]); flush(); }
    }
    async function captureView(name,x,z,profile,shot) {
      await call("timeScale",1); await call("teleport",x,z,Math.PI); await call("follow");
      await call("renderFrames",2);
      await until(name+" player placement",s=>Math.hypot(s.player.x-x,s.player.z-z)<.1);
      await until(name+" camera settled",s=>s.camera.profile===profile && s.camera.settled);
      if(shot) {
        await call("look",shot[0],shot[1]);
        await until(name+" overlook camera",s=>Math.hypot(s.camera.pos.x-shot[0][0],s.camera.pos.y-shot[0][1],s.camera.pos.z-shot[0][2])<.001);
      }
      await call("timeScale",0); await call("renderFrames",4);
      const perf = await page.evaluate(async()=>{
        const samples=[],times=[]; let before=performance.now();
        for(let i=0;i<8;i++) {await window.__mi.renderFrames(1); const now=performance.now();times.push(now-before);before=now;samples.push(window.__mi.state().perf);}
        return {calls:Math.max(...samples.map(s=>s.calls)),triangles:Math.max(...samples.map(s=>s.triangles)),frameMs:times.reduce((a,b)=>a+b,0)/times.length};
      });
      const file = name+"-"+width+"x"+height+".png";
      await page.screenshot({path:directory+"/"+file});
      const s = await state();
      report.views.push({name,width,height,file,perf,player:s.player,camera:s.camera});
      if(perf.calls>120 || perf.triangles>140000) report.failures.push(file+": render budget exceeded");
      flush();
    }
    await capture("dock-gameplay",0,1,"cloud");
    await capture("coast-beach",3,27,"cloud");
    await capture("coast-wreck",-21,66,"cloud");
    await capture("coast-supply-camp",27,113,"cloud");
    await capture("coast-waterfall-view",0,156,"cloud");
    await capture("coast-sea-cave",-49,70,"cloud-sea-cave");
    await capture("coast-side-cove",48,129,"cloud");
    await capture("hollow-approach",-27,180,"cloud-hollow");
    await capture("hollow-gameplay",-13,195,"cloud-hollow");
    await capture("back-tunnel-gameplay",-29,230,"cloud-back-tunnel");
    await capture("coast-west-overlook",-34,100,"cloud-overlook",[[-34,12,100],[0,3,52]]);
    await capture("coast-east-overlook",25,151,"cloud-overlook",[[25,17,151],[-10,4,100]]);
    await capture("hollow-overlook",-27,180,"cloud-hollow",[[-37,23,168],[-13,5,194]]);
    await capture("tunnel-overlook",-7,261,"cloud-back-tunnel",[[-2,21,260],[-17,7,230]]);
    await context.close();
  }
  report.status = report.failures.length ? "capture-failed" : "captured";
  flush();
  if(report.failures.length) process.exitCode=1;
} catch(error) {
  report.status="blocked"; report.failures.push("HARNESS_PRECONDITION_FAILED: "+String(error));flush();throw error;
} finally { await browser?.close(); }
