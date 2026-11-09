import { useEffect, useState } from "react";
import { getGame, saveSettings, setGame, useGame, type Speaker } from "../game/store";
import { cancelAsk, choose, discardSpeech, micPress, micUsable, nextLine, replay } from "../game/flow/ask";
import { recognition, requestMicPermission } from "../audio/recognition";
import { MONSTERS } from "../game/data/monsters";
import { Icon } from "./icons";
import { MaplePortrait, NpcPortrait, Portrait, SelfPortrait } from "./Portraits";
import { NPCS, type NpcId } from "../game/data/town";
import { UI } from "./i18n";
import type { MonsterId } from "../game/types";
import { FAMILY, type FamilyId } from "../game/data/family";
import "./Talk.css";

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
  const micEnabled = useGame((s) => s.settings.mic);
  const micState = useGame((s) => s.micState);
  const [requesting, setRequesting] = useState(false);
  useEffect(() => () => discardSpeech(), []);
  useEffect(() => {
    if (!micEnabled || micState === "blocked" || micState === "unsupported") discardSpeech();
  }, [micEnabled, micState]);
  if (!p) return null;
  const mic = micUsable();
  const showChoices = p.buttons || !mic;
  const listening = p.status === "listening";
  const processing = p.status === "processing";
  const activity = p.soundDetected || p.speechDetected;
  const level = Math.max(0, Math.min(1, p.inputLevel ?? (activity ? 0.75 : 0)));
  const blocked = micEnabled && (micState === "blocked" || micState === "unsupported" || !recognition.supported);
  const enableMic = async () => {
    if (requesting) return;
    setRequesting(true);
    const settings = { ...getGame().settings, mic: true };
    saveSettings(settings);
    setGame({ settings });
    const permission = await requestMicPermission();
    setGame({ micState: !recognition.supported || permission === "unavailable" ? "unsupported" : permission === "denied" ? "blocked" : permission === "granted" ? "ready" : "unknown" });
    setRequesting(false);
  };
  const status =
    !micEnabled
      ? { en: "Microphone OFF", ja: "マイク オフ" }
      : blocked
        ? { en: "Microphone unavailable. Tap an answer!", ja: "マイクが つかえないよ。こたえを タップしてね！" }
        : listening
      ? { en: "Listening... Speak now!", ja: "きいているよ！ はなしてね！" }
      : processing
        ? { en: "Checking...", ja: "かくにんちゅう…" }
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
            : p.speechHint
              ? { en: "Let's try! Tap the mic and speak.", ja: "もういちど！ マイクを おして はなそう！" }
              : { en: "Tap the mic and speak!", ja: "マイクを おして はなそう！" };
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
          {!showChoices && p.frame && (
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
          {!showChoices && !p.frame && (
            <ol className={`sentences ${p.sentences.length > 1 ? "many" : "one"}`}>
              {p.sentences.map((s) => (
                <li key={s.id} className={`sentence ${p.matched === s.id ? "matched" : ""} ${p.reading ? "reading" : ""}`} data-testid="sentence">
                  {s.icon && <Icon id={s.icon} size={34} />}
                  {s.en}
                </li>
              ))}
            </ol>
          )}
          {showChoices && (
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
              <button className={`mic prompt-mic ${listening ? "on" : ""}`} onClick={() => micPress()} aria-label={listening ? "Stop listening" : processing ? "Checking speech" : "Speak"} disabled={processing || requesting} data-testid="mic">
                <Icon id="mic" size={30} />
                <span className="mic-label">{listening ? "Stop" : processing ? "…" : "Speak"}</span>
                {listening && <Ja>とめる</Ja>}
                {!touch && !listening && <kbd>SPACE</kbd>}
              </button>
            )}
            {!mic && p.status !== "correct" && (
              <span className="mic-unavailable" aria-hidden="true"><Icon id="mic" size={34} /><span className="mic-slash" /></span>
            )}
            {!micEnabled && p.status !== "correct" && (
              <button className="enable-mic" onClick={() => void enableMic()} disabled={requesting} data-testid="enable-mic">
                {requesting ? "Checking..." : "Turn on mic"}<Ja>{requesting ? "かくにんちゅう…" : "マイクを オンにする"}</Ja>
              </button>
            )}
            <button className="speaker" onClick={() => void replay()} aria-label="Listen again" data-testid="replay">
              <Icon id="speaker" size={26} />
            </button>
            <div className="prompt-status" data-testid="prompt-status" role="status" aria-live="polite">
              {p.status === "correct" ? (
                <span className="good">
                  <Icon id="check" size={26} /> Great!
                </span>
              ) : (
                <>
                  <span>{status.en}</span>
                  <Ja>{status.ja}</Ja>
                  {p.status === "ready" && mic && p.help && <Ja>{p.help}</Ja>}
                  {listening && (
                    <>
                      <span className={`mic-level ${activity ? "detected" : ""}`} role="meter" aria-label="Microphone sound level" aria-valuemin={0} aria-valuemax={1} aria-valuenow={level} data-testid="mic-level">
                        {[0.12, 0.3, 0.48, 0.66, 0.84].map((threshold, i) => <i key={threshold} className={level >= threshold ? "lit" : ""} style={{ height: `${7 + i * 3}px` }} />)}
                      </span>
                      <span className="mic-auto-hint">Just speak! It stops automatically.<Ja>はなすだけで OK！</Ja></span>
                    </>
                  )}
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
