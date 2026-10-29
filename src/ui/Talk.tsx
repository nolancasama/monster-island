import { useGame, type Speaker } from "../game/store";
import { cancelAsk, choose, micPress, micUsable, nextLine, replay } from "../game/flow/ask";
import { MONSTERS } from "../game/data/monsters";
import { Icon } from "./icons";
import { MaplePortrait, NpcPortrait, Portrait, SelfPortrait } from "./Portraits";
import { NPCS, type NpcId } from "../game/data/town";
import { UI } from "./i18n";
import type { MonsterId } from "../game/types";
import { FAMILY, type FamilyId } from "../game/data/family";

export function Ja({ children }: { children: React.ReactNode }) {
  const on = useGame((s) => s.settings.japanese);
  if (!on || !children) return null;
  return (
    <small className="ja" lang="ja">
      {children}
    </small>
  );
}

const NAME: Record<string, string> = { maple: "Professor Maple", self: "You", game: "" };
export const speakerName = (by: Speaker) => NAME[by] ?? FAMILY[by as FamilyId]?.name ?? NPCS[by as NpcId]?.name ?? MONSTERS[by as MonsterId]?.name ?? "";

export function SpeakerFace({ by, size }: { by: Speaker; size: number }) {
  if (by in FAMILY) {
    const f = FAMILY[by as FamilyId];
    return <svg width={size} height={size} viewBox="0 0 64 64" aria-label={f.name}><circle cx="32" cy="32" r="31" fill={f.color}/><path d="M10 63 Q12 42 32 43 Q52 42 54 63" fill={f.color}/><ellipse cx="32" cy="28" rx="18" ry="21" fill="#d8a27a"/><path d="M14 26 Q10 4 32 5 Q54 5 50 26 L43 16 19 19Z" fill={f.hair}/><circle cx="25" cy="29" r="2"/><circle cx="39" cy="29" r="2"/><path d="M26 38 Q32 42 38 38" fill="none" stroke="#713e35" strokeWidth="2"/>{by === "bo" && <path d="M17 38 Q32 60 47 38 L32 46Z" fill={f.hair}/>}</svg>;
  }
  if (by === "maple") return <MaplePortrait size={size} />;
  if (by in NPCS) return <NpcPortrait id={by as NpcId} size={size} />;
  if (by === "self") return <SelfPortrait size={size} />;
  if (by === "game")
    return (
      <span className="face-game" style={{ width: size, height: size }}>
        <Icon id="journal" size={size * 0.8} />
      </span>
    );
  return <Portrait id={by as MonsterId} size={size} />;
}

/** An English prompt: say the sentence (or choose it). */
export function PromptPanel() {
  const p = useGame((s) => s.prompt);
  const touch = useGame((s) => s.touch);
  useGame((s) => s.micState); // re-render when the mic gets blocked
  if (!p) return null;
  const mic = micUsable();
  const speakHint = touch ? UI.speakTouch : UI.speakKeys;
  const status =
    p.status === "listening"
      ? UI.listening
      : p.status === "miss"
        ? p.misses === 2
          ? UI.listen
          : p.buttons && mic
            ? UI.rescue
            : UI.tryAgain
        : p.status === "unclear"
          ? UI.unclear
          : p.status === "wrong"
            ? UI.wrong
            : p.buttons
              ? UI.choose
              : speakHint;
  return (
    <div className={`panel prompt ui ${p.status}`} data-testid="prompt" role="dialog" aria-label="English">
      {p.question && (
        <div className="prompt-question">
          {p.question.by !== "game" && <SpeakerFace by={p.question.by} size={52} />}
          {/* A picture of what the question is about (a friend described from the journal). */}
          {p.picture && <Icon id={p.picture} size={52} />}
          <div className="q-text">
            {p.question.by !== "game" && <span className="who">{speakerName(p.question.by)}</span>}
            <span className="q-en" data-testid="prompt-question">
              {p.question.en}
            </span>
          </div>
        </div>
      )}
      <div className="prompt-main">
        <div className="prompt-body">
          {!p.buttons && p.frame && (
            <div className="frame" data-testid="frame">
              <span className="frame-text">{p.frame.before}</span>
              <span className="slots">
                {p.frame.slots.map((s) => (
                  <span key={s.id} className={`slot ${s.crossed ? "crossed" : ""} ${p.matched === s.id ? "matched" : ""}`} data-testid="slot">
                    {s.icon && <Icon id={s.icon} size={34} />}
                    <span>{s.en.replace(/^Do you like |\?$/g, "")}</span>
                    {s.crossed && <Icon id="cross" size={22} className="x" />}
                  </span>
                ))}
              </span>
              <span className="frame-text">{p.frame.after}</span>
            </div>
          )}
          {!p.buttons && !p.frame && (
            <ol className={`sentences ${p.sentences.length > 1 ? "many" : "one"}`}>
              {p.sentences.map((s) => (
                <li key={s.id} className={`sentence ${p.matched === s.id ? "matched" : ""} ${p.reading ? "reading" : ""}`} data-testid="sentence">
                  {s.icon && <Icon id={s.icon} size={34} />}
                  {s.en}
                </li>
              ))}
            </ol>
          )}
          {p.buttons && (
            <div className={`choices n${p.choices.length}`} role="group">
              {p.choices.map((c, i) => (
                <button
                  key={c.id}
                  className={`choice ${p.wrongId === c.id ? "wrong" : ""} ${p.matched === c.id ? "matched" : ""} ${c.crossed ? "crossed" : ""}`}
                  onClick={() => choose(c.id)}
                  data-testid="choice"
                  data-id={c.id}
                >
                  {!touch && <kbd>{i + 1}</kbd>}
                  {c.icon && <Icon id={c.icon} size={30} />}
                  <span>{c.en}</span>
                  {c.crossed && <Icon id="cross" size={18} className="x" />}
                </button>
              ))}
            </div>
          )}
          <div className="prompt-controls">
            {mic && p.status !== "correct" && (
              <button className={`mic ${p.status === "listening" ? "on" : ""}`} onClick={() => micPress()} aria-label="Speak" data-testid="mic">
                <Icon id="mic" size={30} />
                {!touch && <kbd>SPACE</kbd>}
              </button>
            )}
            <button className="speaker" onClick={() => void replay()} aria-label="Listen again" data-testid="replay">
              <Icon id="speaker" size={26} />
            </button>
            <div className="prompt-status" data-testid="prompt-status">
              {p.status === "correct" ? (
                <span className="good">
                  <Icon id="check" size={26} /> Great!
                </span>
              ) : (
                <>
                  <span>{status.en}</span>
                  <Ja>{p.status === "ready" && p.help ? p.help : status.ja}</Ja>
                </>
              )}
              {p.heard && p.status !== "ready" && (
                <span className="heard" data-testid="heard">
                  “{p.heard}”
                </span>
              )}
            </div>
          </div>
        </div>
        {p.cancellable && p.status !== "correct" && (
          <button className="close" onClick={() => cancelAsk()} aria-label="Close" data-testid="prompt-close">
            <Icon id="close" size={20} />
          </button>
        )}
      </div>
    </div>
  );
}

/** A line of dialogue (Maple, a monster, your thoughts, or the journal). */
export function DialoguePanel() {
  const line = useGame((s) => s.line);
  const touch = useGame((s) => s.touch);
  if (!line) return null;
  return (
    <div className={`panel dialogue ui by-${line.by} ${line.tone ?? ""}`} onClick={() => nextLine()} data-testid="dialogue" role="dialog">
      <SpeakerFace by={line.by} size={64} />
      <div className="dialogue-body">
        {line.by !== "game" && <span className="who">{speakerName(line.by)}</span>}
        <p className="line-en" data-testid="line">
          {line.food && <Icon id={line.food} size={34} />}
          {line.en}
        </p>
        {!line.target && <Ja>{line.ja}</Ja>}
      </div>
      <button
        className="next"
        onClick={(e) => {
          e.stopPropagation();
          nextLine();
        }}
        data-testid="next"
      >
        ▶ {UI.next.en}
        {!touch && <kbd>E</kbd>}
      </button>
    </div>
  );
}
