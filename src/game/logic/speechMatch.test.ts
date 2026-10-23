import { describe, expect, it } from "vitest";
import { judgeSpeech, matchesPhrase } from "./speechMatch";
import { COLOR_PHRASE, LIKE_PHRASE, PHRASES, PHRASE_IDS, type PhraseId } from "./english";
import { ISLAND_FOODS } from "../data/foods";

const P = (ids: PhraseId[]) => ids.map((id) => PHRASES[id]);
const LIKE_OPTIONS = P(ISLAND_FOODS.map((f) => LIKE_PHRASE[f]));

describe("English response matching", () => {
  it("every displayed sentence matches itself", () => {
    for (const id of PHRASE_IDS) expect(matchesPhrase(PHRASES[id].en, PHRASES[id]), id).toBe(true);
  });

  it("ignores punctuation, capitals and articles", () => {
    expect(judgeSpeech(["do you like apples"], LIKE_OPTIONS)).toMatchObject({ kind: "match", id: "likeApples" });
    expect(judgeSpeech(["DO YOU LIKE FISH!!"], LIKE_OPTIONS)).toMatchObject({ kind: "match", id: "likeFish" });
    expect(judgeSpeech(["you like the banana"], LIKE_OPTIONS)).toMatchObject({ kind: "match", id: "likeBananas" });
  });

  it("accepts Japanese-accented recogniser variants", () => {
    expect(judgeSpeech(["do you rike apple"], LIKE_OPTIONS)).toMatchObject({ id: "likeApples" });
    expect(judgeSpeech(["do you like very"], LIKE_OPTIONS)).toMatchObject({ id: "likeBerries" });
    expect(judgeSpeech(["do you like fishu"], LIKE_OPTIONS)).toMatchObject({ id: "likeFish" });
    expect(judgeSpeech(["Kenya swim"], P(["canSwim", "canFly", "canJump"]))).toMatchObject({ id: "canSwim" });
    expect(judgeSpeech(["can you fry"], P(["canSwim", "canFly", "canJump"]))).toMatchObject({ id: "canFly" });
    expect(judgeSpeech(["it's brew"], P([COLOR_PHRASE.blue]))).toMatchObject({ id: "itsBlue" });
    expect(judgeSpeech(["it's glean"], P([COLOR_PHRASE.green]))).toMatchObject({ id: "itsGreen" });
    expect(judgeSpeech(["can you health me"], P(["canHelp"]))).toMatchObject({ id: "canHelp" });
  });

  it("Phase 2 requests are told apart", () => {
    const req = P(["comeHere", "letsGo", "thankYou"]);
    expect(judgeSpeech(["come here"], req)).toMatchObject({ id: "comeHere" });
    expect(judgeSpeech(["kamu hia"], req)).toMatchObject({ id: "comeHere" });
    expect(judgeSpeech(["come hear"], req)).toMatchObject({ id: "comeHere" });
    expect(judgeSpeech(["let's go"], req)).toMatchObject({ id: "letsGo" });
    expect(judgeSpeech(["letsu go"], req)).toMatchObject({ id: "letsGo" });
    expect(judgeSpeech(["lets go"], req)).toMatchObject({ id: "letsGo" });
    expect(judgeSpeech(["thank you"], req)).toMatchObject({ id: "thankYou" });
    expect(judgeSpeech(["sankyu"], req)).toMatchObject({ id: "thankYou" });
    expect(judgeSpeech(["tenkyu"], req)).toMatchObject({ id: "thankYou" });
    // One word of a request is not the request.
    expect(judgeSpeech(["come"], req).kind).toBe("none");
    expect(judgeSpeech(["go"], req).kind).toBe("none");
  });

  it("sizes and body parts", () => {
    const size = P(["itsSmall", "itsBig"]);
    expect(judgeSpeech(["it's small"], size)).toMatchObject({ id: "itsSmall" });
    expect(judgeSpeech(["it's sumoru"], size)).toMatchObject({ id: "itsSmall" });
    expect(judgeSpeech(["it's big"], size)).toMatchObject({ id: "itsBig" });
    expect(judgeSpeech(["biggu"], size)).toMatchObject({ id: "itsBig" });
    expect(judgeSpeech(["small big"], size).kind).not.toBe("match");
    const part = P(["hasWings", "hasTail"]);
    expect(judgeSpeech(["it has wings"], part)).toMatchObject({ id: "hasWings" });
    expect(judgeSpeech(["it has wing"], part)).toMatchObject({ id: "hasWings" });
    expect(judgeSpeech(["it has wingu"], part)).toMatchObject({ id: "hasWings" });
    expect(judgeSpeech(["it has a tail"], part)).toMatchObject({ id: "hasTail" });
  });

  it("the question needs both the pattern word and the food", () => {
    expect(judgeSpeech(["apples"], LIKE_OPTIONS).kind).toBe("none");
    expect(judgeSpeech(["do you like"], LIKE_OPTIONS).kind).toBe("none");
    expect(judgeSpeech(["swim"], P(["canSwim"])).kind).toBe("none");
  });

  it("one sentence never triggers two actions", () => {
    expect(judgeSpeech(["do you like apples and fish"], LIKE_OPTIONS).kind).toBe("unclear");
    expect(judgeSpeech(["yes no"], P(["yesIDo", "noIDont"])).kind).not.toBe("match");
  });

  it("tells yes from no", () => {
    const yn = P(["yesIDo", "noIDont"]);
    expect(judgeSpeech(["yes I do"], yn)).toMatchObject({ id: "yesIDo" });
    expect(judgeSpeech(["yeah"], yn)).toMatchObject({ id: "yesIDo" });
    expect(judgeSpeech(["no I don't"], yn)).toMatchObject({ id: "noIDont" });
    expect(judgeSpeech(["no I dont"], yn)).toMatchObject({ id: "noIDont" });
    const can = P(["yesICan", "noICant"]);
    expect(judgeSpeech(["yes I can"], can)).toMatchObject({ id: "yesICan" });
    expect(judgeSpeech(["no I can't"], can)).toMatchObject({ id: "noICant" });
    // Japanese speakers often drop the t: the "no" still decides.
    expect(judgeSpeech(["no I can"], can)).toMatchObject({ id: "noICant" });
  });

  it("only the top hypothesis judges; alternatives only rescue a miss", () => {
    expect(judgeSpeech(["do you like fish", "do you like apples"], LIKE_OPTIONS)).toMatchObject({ id: "likeFish" });
    expect(judgeSpeech(["do you light hum", "do you like apples"], LIKE_OPTIONS)).toMatchObject({ id: "likeApples" });
    expect(judgeSpeech(["hello", "goodbye"], LIKE_OPTIONS).kind).toBe("none");
  });

  it("colour distractors are other colours", () => {
    for (const id of Object.values(COLOR_PHRASE)) {
      for (const d of PHRASES[id].distractors ?? []) expect(Object.values(COLOR_PHRASE)).toContain(d);
    }
  });
});
