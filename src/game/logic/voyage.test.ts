import { describe, expect, it } from "vitest";
import { newProgress, type Progress } from "./progress";
import { decodeSave, encodeSave } from "./save";
import {
  CARGO_ITEMS, RAFT_STEER_STEPS, SHIP_STEER_STEPS, STEER_COMMANDS, VOYAGE_JOBS, allJobsDone, cargoTasks, finishJob, foodChoices, foodOfHave, handOverFood, interrogationFoods, markHatGiven,
  obstacleSide, placePhrase, putLine, readVoyage, setVoyageStage, slotFree, steer, steerAttempt, steerCall, taskDone, truthfulAnswer, voyageStage, whereChoices,
  type CargoState, type CargoTask, type Lane,
} from "./voyage";
import type { MonsterId } from "../types";

/** A finished prologue, Act 2 done up to the harbour's lead: the voyage may begin. */
function ready(): Progress {
  const p = newProgress();
  for (const id of ["leafy", "bubbo", "puff", "ember", "lumo"] as MonsterId[])
    p.monsters[id] = { discovered: true, asked: {}, friend: true, canKnown: {}, described: { name: id === "lumo", size: true, part: true }, ...(id === "ember" ? { invited: true } : {}) };
  p.active = "leafy"; p.metMaple = true; p.endings = 3;
  p.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame"];
  p.act2 = { ...p.act2, started: true, lumoTaken: true, descended: true, portFound: true, bought: true, harbor: true, upgrades: ["leafy"] };
  return p;
}
const roundTrip = (p: Progress) => decodeSave(encodeSave(p, { x: 76, z: -470, yaw: 0 }, 99))!.progress;
const first = () => 0;

describe("the food interrogation is always truthful", () => {
  it("asks about a food the player has and one they don't, never twice", () => {
    const bag = { apples: 2, fish: 1 };
    const foods = interrogationFoods(bag, first);
    expect(foods).toHaveLength(3);
    expect(new Set(foods).size).toBe(3);
    expect(foods.some((f) => (bag as Record<string, number>)[f] > 0)).toBe(true);
    expect(foods.some((f) => !(bag as Record<string, number>)[f])).toBe(true);
    for (const f of foods) expect(truthfulAnswer(bag, f)).toBe((bag as Record<string, number>)[f] ? "yesIDo" : "noIDont");
  });

  it("works for an empty bag and a full one", () => {
    expect(interrogationFoods({}, first).every((f) => truthfulAnswer({}, f) === "noIDont")).toBe(true);
    const full = { apples: 1, bananas: 1, fish: 1, berries: 1, meat: 1 };
    expect(interrogationFoods(full, first).every((f) => truthfulAnswer(full, f) === "yesIDo")).toBe(true);
  });

  it("'What food do you have?' offers only held foods, or the honest no-food answer", () => {
    expect(foodChoices({ bananas: 1, meat: 3 })).toEqual(["iHaveBananas", "iHaveMeat"]);
    expect(foodChoices({ apples: 0 })).toEqual(["noFood"]);
    expect(foodOfHave("iHaveMeat")).toBe("meat");
    expect(foodOfHave("noFood")).toBeNull();
  });

  it("the pirates take exactly one food, once", () => {
    const p = { ...ready(), bag: { fish: 3 } };
    const after = handOverFood(p, "fish");
    expect(after.bag.fish).toBe(2);
    expect(after.act3.voyage.interrogated).toBe(true);
    expect(handOverFood(after, "fish")).toBe(after);
    expect(roundTrip(setVoyageStage(after, "captured")).bag.fish).toBe(2);
    expect(handOverFood({ ...ready(), bag: {} }, null).bag).toEqual({});
  });
});

describe("cargo: in, on, under, by", () => {
  it("six put tasks use every preposition, never the same item twice in a row, with two where-questions", () => {
    for (let seed = 0; seed < 20; seed++) {
      let n = seed;
      const tasks = cargoTasks((k) => (n = (n * 7 + 3) % 101) % k);
      const puts = tasks.filter((t): t is Extract<CargoTask, { kind: "put" }> => t.kind === "put");
      expect(puts).toHaveLength(6);
      expect(new Set(puts.map((t) => t.prep))).toEqual(new Set(["in", "on", "under", "by"]));
      for (let i = 1; i < puts.length; i++) expect(puts[i].item).not.toBe(puts[i - 1].item);
      expect(tasks.filter((t) => t.kind === "where")).toHaveLength(2);
    }
  });

  it("a task is done only by the exact relation, and a spot holds one thing", () => {
    const state: CargoState = { barrel: { furniture: "table", prep: "on" }, bag: null, bottle: null };
    expect(taskDone({ kind: "put", item: "barrel", furniture: "table", prep: "on" }, state)).toBe(true);
    expect(taskDone({ kind: "put", item: "barrel", furniture: "table", prep: "under" }, state)).toBe(false);
    expect(taskDone({ kind: "put", item: "bag", furniture: "table", prep: "on" }, state)).toBe(false);
    expect(slotFree(state, "bag", { furniture: "table", prep: "on" })).toBe(false);
    expect(slotFree(state, "bag", { furniture: "table", prep: "under" })).toBe(true);
    expect(slotFree(state, "barrel", { furniture: "table", prep: "on" })).toBe(true);
    expect(putLine({ kind: "put", item: "bottle", furniture: "door", prep: "by" })).toBe("Put the green bottle by the door!");
  });

  it("'Where is …?' always includes the true answer among four", () => {
    for (const pl of [{ furniture: "shelf", prep: "under" }, { furniture: "box", prep: "in" }, { furniture: "door", prep: "by" }] as const) {
      const state: CargoState = { barrel: null, bag: pl, bottle: null };
      const choices = whereChoices(state, "bag");
      expect(choices).toHaveLength(4);
      expect(choices).toContain(placePhrase(pl));
      expect(new Set(choices).size).toBe(4);
    }
    expect(CARGO_ITEMS).toEqual(["barrel", "bag", "bottle"]);
  });
});

describe("jobs, stages and saves", () => {
  it("jobs finish in any order; the hat comes once after the last", () => {
    for (const order of [[...VOYAGE_JOBS], [...VOYAGE_JOBS].reverse(), ["cargo", "fishing", "sailing", "cooking"] as const]) {
      let p = setVoyageStage(ready(), "captured");
      for (const job of order) {
        expect(markHatGiven(p).act3.voyage.hat).toBe(false);
        p = finishJob(p, job);
        expect(p.act3.voyage.stage).toBe("jobs");
      }
      expect(allJobsDone(p.act3.voyage)).toBe(true);
      p = markHatGiven(p);
      expect(p.act3.voyage.hat).toBe(true);
      expect(markHatGiven(p)).toBe(p);
      expect(finishJob(p, "cargo")).toBe(p);
    }
  });

  it("stages only move forward", () => {
    const storm = setVoyageStage(ready(), "storm");
    expect(setVoyageStage(storm, "captured")).toBe(storm);
    expect(setVoyageStage(storm, "raft").act3.voyage.stage).toBe("raft");
  });

  it("every stage survives a reload; jobs and gifts are not repeated", () => {
    let p = finishJob(finishJob(setVoyageStage(ready(), "captured"), "fishing"), "cargo");
    p = handOverFood({ ...p, bag: { apples: 2 } }, "apples");
    const back = roundTrip(p).act3.voyage;
    expect(back).toEqual({ stage: "jobs", jobs: ["fishing", "cargo"], interrogated: true, hat: false });
    for (const stage of ["storm", "raft"] as const) {
      const v = roundTrip(markHatGiven(setVoyageStage(p, stage))).act3.voyage;
      expect(v.stage).toBe(stage);
      expect(v.jobs).toEqual([...VOYAGE_JOBS]);
    }
  });

  it("a finished crossing reads as done; a bare 'done' is not trusted", () => {
    expect(voyageStage({ voyageDone: true, voyage: readVoyage({ stage: "jobs" }, true) })).toBe("done");
    expect(voyageStage({ voyageDone: true, voyage: readVoyage(undefined, true) })).toBe("done");
    expect(readVoyage({ stage: "done" }, true).stage).toBe("done");
    expect(readVoyage({ stage: "done" }, false).stage).toBe("raft");
    expect(readVoyage({ stage: "warp", jobs: ["teleport"] }, false)).toEqual({ stage: "none", jobs: [], interrogated: false, hat: false });
    expect(readVoyage({ stage: "captured", jobs: ["sailing"] }, false).stage).toBe("jobs");
    expect(readVoyage({ stage: "jobs", jobs: ["fishing"], hat: true }, false).hat).toBe(false);
  });

  it("an old save without a voyage reads as not started; nothing before the harbour's lead", () => {
    expect(roundTrip(ready()).act3.voyage.stage).toBe("none");
    const early = setVoyageStage({ ...ready(), act2: { ...ready().act2, harbor: false } }, "jobs");
    expect(roundTrip(early).act3.voyage.stage).toBe("none");
  });
});

describe("steering in three lanes", () => {
  it("commands move one lane and hold at the edges", () => {
    expect(steer(0, "turnLeft")).toBe(-1);
    expect(steer(-1, "turnLeft")).toBe(-1);
    expect(steer(1, "turnRight")).toBe(1);
    expect(steer(1, "goStraight")).toBe(1);
  });

  it("calls each obstacle relative to the vessel", () => {
    for (const lane of [-1, 0, 1] as Lane[]) for (const obstacle of [-1, 0, 1] as Lane[]) {
      expect(obstacleSide(lane, obstacle)).toBe(obstacle < lane ? "left" : obstacle > lane ? "right" : "ahead");
    }
    expect(steerCall(RAFT_STEER_STEPS[0], "A rock")).toEqual({
      en: "A barrel ahead! A rock on the left!", ja: "まえに たる! ひだりに いわ!",
    });
  });

  it.each([
    { vessel: "ship", steps: SHIP_STEER_STEPS, lanes: [-1, 0, 0, 1], commands: ["turnLeft", "turnRight", "goStraight", "turnRight"] },
    { vessel: "raft", steps: RAFT_STEER_STEPS, lanes: [1, 0, 0, -1, 0], commands: ["turnRight", "turnLeft", "goStraight", "turnLeft", "turnRight"] },
  ])("$vessel steps each have one safe command and cover all three commands", ({ steps, lanes, commands }) => {
    const used = new Set<string>();
    for (const [index, step] of steps.entries()) {
      expect(step.start).toBe(index === 0 ? 0 : lanes[index - 1]);
      const safe = STEER_COMMANDS.filter((command) => steerAttempt(step, command).hit < 0);
      expect(safe).toEqual([commands[index]]);
      if (safe[0] === "goStraight") expect(step.start).toBe(0);
      expect(steerAttempt(step, safe[0]).nextLane).toBe(lanes[index]);
      used.add(safe[0]);
    }
    expect(used).toEqual(new Set(STEER_COMMANDS));
  });

  it("a bump identifies the chosen obstacle and restores the authored start lane", () => {
    for (const step of [...SHIP_STEER_STEPS, ...RAFT_STEER_STEPS]) {
      for (const command of STEER_COMMANDS) {
        const attempt = steerAttempt(step, command);
        if (attempt.hit < 0) continue;
        expect(step.obstacles[attempt.hit].lane).toBe(attempt.lane);
        expect(attempt.nextLane).toBe(step.start);
        const retry = { ...step, start: attempt.nextLane };
        expect(steerCall(retry, "Rocks")).toEqual(steerCall(step, "Rocks"));
      }
    }
  });
});

describe("saved below deck", () => {
  it("keeps the hold floor only in free roam, and older saves load on deck", () => {
    expect(readVoyage({ stage: "jobs", jobs: ["cargo"], inHold: true }, false).inHold).toBe(true);
    expect(readVoyage({ stage: "captured", inHold: true }, false).inHold).toBe(true);
    expect(readVoyage({ stage: "jobs", jobs: ["cargo"] }, false).inHold).toBeUndefined();
    expect(readVoyage({ stage: "storm", inHold: true }, false).inHold).toBeUndefined();
    expect(readVoyage({ stage: "jobs", inHold: "yes" }, false).inHold).toBeUndefined();
  });
});
