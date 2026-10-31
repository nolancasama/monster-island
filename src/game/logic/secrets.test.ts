import { describe, expect, it } from "vitest";
import { newProgress, type Progress } from "./progress";
import { newAct2, openChest } from "./act2";
import { decodeSave, encodeSave } from "./save";
import { secretEvent, tickSecrets, type SecretProgress } from "./secrets";
import { ELEMENT_OBJECTS, SECRET_IDS, SECRET_SITES, type ElementEvent, type SecretId } from "../world/elementObjects";
import { CHESTS, ENEMY_SPAWNS, STAGES, zoneAt } from "../world/lowland";
import { PLAYER_R, gatesOf, isWalkable, moveCircle } from "../world/collision";

function ready(): Progress {
  const p = newProgress();
  for (const m of Object.values(p.monsters)) { m.discovered = m.friend = true; }
  p.monsters.ember.invited = true;
  p.endings = 3;
  p.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame"];
  p.act2 = { ...newAct2(), started: true, lumoTaken: true, cleared: [...STAGES] };
  return p;
}
const fresh = (): SecretProgress => ({ secrets: [], objects: {} });
const away = { x: 0, z: 0 };
const roundTrip = (p: Progress) => decodeSave(encodeSave(p, { x: 76, z: -191, yaw: 0 }, 123))!;

function solveSecret(id: SecretId): SecretProgress {
  let p = fresh();
  switch (id) {
    case "emberThicket": return tickSecrets(secretEvent(id, "burn", p), 1.5, away);
    case "bubboLedgeKey": return secretEvent(id, "lift", p);
    case "leafyStatues": return secretEvent("leafyStatuesEast", "grab", secretEvent(id, "grab", p));
    case "puffLeaves": return tickSecrets(secretEvent(id, "wind", p), 0, ELEMENT_OBJECTS.find(o => o.id === id)!);
    case "comboCrateLift": return secretEvent(id, "lift", secretEvent(id, "grab", p));
    case "comboFurnace":
      p = tickSecrets(secretEvent(id, "burn", p), 7.99, away);
      return secretEvent(id, "wind", p);
  }
}

describe("optional secrets", () => {
  it.each(SECRET_IDS)("%s completes, opens its reward once and persists as a final id only", id => {
    const solved = solveSecret(id);
    expect(solved.secrets).toEqual([id]);
    const p = ready(), chest = CHESTS.find(c => c.secret === id)!;
    expect(openChest(p, chest.id)).toBe(p);
    const next = { ...p, act2: { ...p.act2, secrets: solved.secrets } };
    const loaded = roundTrip(next);
    expect(loaded.v).toBe(4);
    expect(loaded.progress.act2.secrets).toEqual([id]);
    expect(loaded.progress.act2).not.toHaveProperty("objects");
    expect(loaded.progress.solved).toEqual(p.solved);
    expect(loaded.progress.act2.cleared).toEqual(p.act2.cleared);
    const reward = openChest(loaded.progress, chest.id);
    expect(reward.act2.coins).toBe(chest.coins);
    expect(openChest(reward, chest.id)).toBe(reward);
    expect(roundTrip(reward).progress.act2.chests).toContain(chest.id);
  });

  it("does nothing for unsupported events, including the wrong friend's element", () => {
    for (const o of ELEMENT_OBJECTS) for (const event of ["burn", "grab", "wind", "lift", "bomb"] as ElementEvent[]) {
      if (o.on?.[event]) continue;
      const p = fresh();
      expect(secretEvent(o.id, event, p)).toBe(p);
    }
    const p = fresh();
    expect(secretEvent("not-a-secret", "burn", p)).toBe(p);
  });

  it("keeps the thicket burning for 1.5 seconds without sustained fire restarting it", () => {
    let p = secretEvent("emberThicket", "burn", fresh());
    p = tickSecrets(p, 1, away);
    expect(secretEvent("emberThicket", "burn", p)).toBe(p);
    expect(tickSecrets(p, .49, away).secrets).toEqual([]);
    expect(tickSecrets(p, .5, away).secrets).toEqual(["emberThicket"]);
  });

  it("requires two distinct statue grabs in either order", () => {
    for (const [a, b] of [["leafyStatues", "leafyStatuesEast"], ["leafyStatuesEast", "leafyStatues"]]) {
      const p = secretEvent(a, "grab", fresh());
      expect(p.objects[a].state).toBe("pulled");
      expect(secretEvent(a, "grab", p).secrets).toEqual([]);
      expect(secretEvent(b, "grab", p).secrets).toEqual(["leafyStatues"]);
    }
  });

  it("requires walking onto the revealed leaf trapdoor", () => {
    const o = ELEMENT_OBJECTS.find(o => o.id === "puffLeaves")!;
    expect(tickSecrets(fresh(), 1, o).secrets).toEqual([]);
    const p = secretEvent(o.id, "wind", fresh());
    expect(tickSecrets(p, 20, away).secrets).toEqual([]);
    expect(tickSecrets(p, 0, o).secrets).toEqual([o.id]);
  });

  it("requires pulling the crate before lifting it", () => {
    const p = fresh();
    expect(secretEvent("comboCrateLift", "lift", p)).toBe(p);
    const pulled = secretEvent("comboCrateLift", "grab", p);
    expect(pulled.objects.comboCrateLift.state).toBe("onPad");
    expect(pulled.secrets).toEqual([]);
    expect(secretEvent("comboCrateLift", "lift", tickSecrets(pulled, 300, away)).secrets).toEqual(["comboCrateLift"]);
  });

  it("gives the furnace eight active seconds, allows retrying and never extends the lit clock", () => {
    const p = fresh();
    expect(secretEvent("comboFurnace", "wind", p)).toBe(p);
    const lit = tickSecrets(secretEvent("comboFurnace", "burn", p), 7, away);
    expect(secretEvent("comboFurnace", "burn", lit)).toBe(lit);
    expect(secretEvent("comboFurnace", "wind", tickSecrets(lit, .99, away)).secrets).toEqual(["comboFurnace"]);
    const cold = tickSecrets(lit, 1, away);
    expect(cold.objects.comboFurnace.state).toBe("intact");
    expect(secretEvent("comboFurnace", "wind", cold)).toBe(cold);
    expect(secretEvent("comboFurnace", "wind", secretEvent("comboFurnace", "burn", cold)).secrets).toEqual(["comboFurnace"]);
  });

  it("filters unknown, duplicate and intermediate save ids; older v4 saves default to []", () => {
    const p = ready();
    p.act2.secrets = [...SECRET_IDS, "lit", "leafyStatuesEast", "onPad", "unknown", "emberThicket"];
    expect(roundTrip(p).progress.act2.secrets).toEqual(SECRET_IDS);
    const raw = JSON.parse(encodeSave(p, { x: 76, z: -191, yaw: 0 }, 0));
    delete raw.progress.act2.secrets;
    raw.progress.act2.objects = { comboFurnace: { state: "lit", remaining: 8 } };
    const back = decodeSave(JSON.stringify(raw))!;
    expect(back.progress.act2.secrets).toEqual([]);
    expect(back.progress.act2).not.toHaveProperty("objects");
    expect(newAct2().secrets).toEqual([]);
  });
});

describe("secret placement and collision", () => {
  it.each(SECRET_IDS)("%s stays on existing land and blocks access until completion", id => {
    const p = ready(), site = SECRET_SITES[id];
    const open = { ...p, act2: { ...p.act2, secrets: [id] } };
    const closedGates = gatesOf(p), openGates = gatesOf(open);
    const reward = { x: site.chest.x, z: site.chest.z + 1.1 };
    expect(zoneAt(site.chest.x, site.chest.z)).toBe(site.stage);
    expect(isWalkable(site.approach.x, site.approach.z, closedGates, PLAYER_R)).toBe(true);
    expect(isWalkable(reward.x, reward.z, closedGates, PLAYER_R)).toBe(false);
    expect(isWalkable(reward.x, reward.z, openGates, PLAYER_R)).toBe(true);
    // Movement still uses the same gates and collision resolver.
    const stopped = moveCircle(site.approach.x, site.approach.z, reward.x, reward.z, PLAYER_R, closedGates);
    expect(Math.hypot(stopped.x - reward.x, stopped.z - reward.z)).toBeGreaterThan(.1);
    expect(gatesOf(p).secrets).toEqual([]); // completing a secret cannot poison the gate cache
    const objects = ELEMENT_OBJECTS.filter(o => o.id === id || (id === "leafyStatues" && o.id === "leafyStatuesEast"));
    for (const o of objects) {
      expect(zoneAt(o.x, o.z)).toBe(site.stage);
      expect(isWalkable(o.x, o.z, closedGates, .08)).toBe(!site.solidTarget);
      expect(isWalkable(o.x, o.z, openGates, .08)).toBe(true);
      for (const e of ENEMY_SPAWNS) expect(Math.hypot(o.x - e.x, o.z - e.z)).toBeGreaterThanOrEqual(4);
      for (const c of CHESTS) expect(Math.hypot(o.x - c.x, o.z - c.z)).toBeGreaterThanOrEqual(4);
    }
  });
});
