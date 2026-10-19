import type { Phrase, PhraseId } from "./english";

/**
 * Judges what the recogniser heard against the sentences on offer.
 *
 * - Punctuation, capitals, articles and word order are ignored: only each
 *   phrase's key words count ("do you like apple", "Do you like apples?" and
 *   "you like apples" all pass "Do you like apples?").
 * - Adjacent words are also tried joined ("can you" -> canyou, "or range" -> orrange).
 * - Only the top hypothesis judges. Later alternatives may rescue a result in
 *   which nothing matched, never overrule one that did.
 * - Matching two different sentences at once ("apples and fish") is unclear:
 *   one recognised sentence never triggers two actions.
 */

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^a-z0-9' -]+/g, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^'+|'+$/g, ""))
    .filter(Boolean);
}

/** Words heard, plus every pair of neighbours joined. */
export function heardWords(text: string): Set<string> {
  const tokens = tokenize(text);
  const out = new Set(tokens);
  for (let i = 0; i + 1 < tokens.length; i++) out.add(tokens[i] + tokens[i + 1]);
  return out;
}

export function matchesPhrase(text: string, p: Phrase): boolean {
  const words = heardWords(text);
  if (p.forbid?.some((w) => words.has(w))) return false;
  return p.keys.every((group) => group.some((w) => words.has(w.replace(/\s+/g, ""))));
}

export type Judgement =
  | { kind: "match"; id: PhraseId; heard: string }
  /** Two or more different sentences heard at once. */
  | { kind: "unclear"; heard: string }
  | { kind: "none"; heard: string };

function judgeOne(text: string, options: readonly Phrase[]): Judgement | null {
  const hits = options.filter((p) => matchesPhrase(text, p));
  if (hits.length === 1) return { kind: "match", id: hits[0].id, heard: text };
  if (hits.length > 1) return { kind: "unclear", heard: text };
  return null;
}

/** Judge one recognition result (its ranked alternatives) against the sentences on offer. */
export function judgeSpeech(alternatives: readonly string[], options: readonly Phrase[]): Judgement {
  const [top = "", ...rest] = alternatives;
  const first = judgeOne(top, options);
  if (first) return first;
  for (const alt of rest) {
    const j = judgeOne(alt, options);
    if (j?.kind === "match") return j;
  }
  return { kind: "none", heard: top };
}
