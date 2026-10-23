import type { MonsterId } from "../game/types";

/**
 * Journal portraits, drawn to match the 3D models. `silhouette` draws the
 * same shape in one dark colour for monsters not met yet.
 */

function Eyes({ y, dx, r = 6 }: { y: number; dx: number; r?: number }) {
  return (
    <>
      {[-1, 1].map((s) => (
        <g key={s}>
          <ellipse cx={50 + s * dx} cy={y} rx={r} ry={r * 1.15} fill="#fff" />
          <ellipse cx={50 + s * dx} cy={y + 1} rx={r * 0.62} ry={r * 0.72} fill="#1d1712" />
          <circle cx={50 + s * dx + r * 0.25} cy={y - r * 0.35} r={r * 0.22} fill="#fff" />
        </g>
      ))}
    </>
  );
}

function Leafy({ dark }: { dark?: string }) {
  const c = (x: string) => dark ?? x;
  return (
    <g>
      <path d="M50 30 Q51 20 52 14" stroke={c("#3a8a2e")} strokeWidth="3" fill="none" />
      <ellipse cx="40" cy="14" rx="12" ry="5" transform="rotate(-30 40 14)" fill={c("#6fd24f")} />
      <ellipse cx="62" cy="13" rx="12" ry="5" transform="rotate(28 62 13)" fill={c("#58c040")} />
      <ellipse cx="26" cy="62" rx="6" ry="11" transform="rotate(25 26 62)" fill={c("#4fb43f")} />
      <ellipse cx="74" cy="62" rx="6" ry="11" transform="rotate(-25 74 62)" fill={c("#4fb43f")} />
      <ellipse cx="50" cy="58" rx="25" ry="30" fill={c("#5cc24a")} />
      {!dark && (
        <>
          <ellipse cx="50" cy="66" rx="17" ry="18" fill="#c9f08a" />
          <Eyes y={48} dx={9} />
          <ellipse cx="36" cy="58" rx="4" ry="2.5" fill="#ff9a8a" />
          <ellipse cx="64" cy="58" rx="4" ry="2.5" fill="#ff9a8a" />
          <path d="M45 60 Q50 65 55 60" stroke="#2a5a1e" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        </>
      )}
      <ellipse cx="40" cy="88" rx="8" ry="4.5" fill={c("#3f9a35")} />
      <ellipse cx="60" cy="88" rx="8" ry="4.5" fill={c("#3f9a35")} />
    </g>
  );
}

function Bubbo({ dark }: { dark?: string }) {
  const c = (x: string) => dark ?? x;
  return (
    <g>
      {[-1, 1].map((s) =>
        [0, 1, 2].map((i) => (
          <ellipse
            key={`${s}${i}`}
            cx={50 + s * (34 + i * 2)}
            cy={44 + i * 9}
            rx="9"
            ry="4"
            transform={`rotate(${s * (-30 + i * 25)} ${50 + s * (34 + i * 2)} ${44 + i * 9})`}
            fill={c("#ff7eb0")}
          />
        ))
      )}
      <path d="M50 76 Q86 80 92 64 Q84 86 50 84z" fill={c("#3f9fe8")} />
      <ellipse cx="50" cy="62" rx="34" ry="22" fill={c("#3f9fe8")} />
      <circle cx="38" cy="40" r="9" fill={c("#3f9fe8")} />
      <circle cx="62" cy="40" r="9" fill={c("#3f9fe8")} />
      {!dark && (
        <>
          <ellipse cx="50" cy="70" rx="24" ry="12" fill="#b9e4ff" />
          <Eyes y={40} dx={12} r={6} />
          <path d="M38 62 Q50 72 62 62" stroke="#1d4f7a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <ellipse cx="30" cy="62" rx="4" ry="2.5" fill="#ff9ec0" />
          <ellipse cx="70" cy="62" rx="4" ry="2.5" fill="#ff9ec0" />
          <circle cx="40" cy="52" r="2.5" fill="#7cc4ff" />
          <circle cx="66" cy="50" r="2.5" fill="#7cc4ff" />
        </>
      )}
      <ellipse cx="30" cy="84" rx="7" ry="4" fill={c("#2f86cc")} />
      <ellipse cx="70" cy="84" rx="7" ry="4" fill={c("#2f86cc")} />
    </g>
  );
}

function Puff({ dark }: { dark?: string }) {
  const c = (x: string) => dark ?? x;
  return (
    <g>
      {/* Two big feathered wings, a fluffy round body, a curly tuft and little feet: no tail. */}
      {[-1, 1].map((s) =>
        [0, 1, 2].map((i) => (
          <ellipse
            key={`${s}${i}`}
            cx={50 + s * (30 + i * 2)}
            cy={44 + i * 8}
            rx="15"
            ry="6"
            transform={`rotate(${s * (-28 + i * 22)} ${50 + s * (30 + i * 2)} ${44 + i * 8})`}
            fill={c(["#c9a6ff", "#b48cf5", "#9f74e8"][i])}
          />
        ))
      )}
      <path d="M50 26 Q48 16 54 14 Q60 14 58 20" stroke={c("#7f4fcc")} strokeWidth="3" fill="none" strokeLinecap="round" />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const a = (i / 8) * Math.PI * 2;
        return <circle key={i} cx={50 + Math.cos(a) * 21} cy={54 + Math.sin(a) * 21} r="8" fill={c(i % 2 ? "#9a66dc" : "#ad80ea")} />;
      })}
      <circle cx="50" cy="54" r="24" fill={c("#a070e0")} />
      <path d="M44 80 L42 90 M56 80 L58 90" stroke={c("#ffb347")} strokeWidth="2.5" strokeLinecap="round" />
      {!dark && (
        <>
          <ellipse cx="50" cy="62" rx="15" ry="13" fill="#e6d4ff" />
          <Eyes y={48} dx={9} r={6} />
          <path d="M47 57 L53 57 L50 62z" fill="#ffb347" />
          <ellipse cx="35" cy="57" rx="4" ry="2.5" fill="#ff9ec0" />
          <ellipse cx="65" cy="57" rx="4" ry="2.5" fill="#ff9ec0" />
        </>
      )}
    </g>
  );
}

function Ember({ dark }: { dark?: string }) {
  const c = (x: string) => dark ?? x;
  return (
    <g>
      <path d="M74 70 Q92 60 88 40 Q96 54 86 46 Q90 34 82 30 Q84 50 72 62z" fill={c("#ffcf3a")} />
      <ellipse cx="50" cy="62" rx="24" ry="24" fill={c("#ff8a2a")} />
      <circle cx="50" cy="38" r="17" fill={c("#ff8a2a")} />
      <path d="M40 24 L44 14 L48 24z M52 24 L56 12 L60 24z" fill={c("#ffcf3a")} />
      {!dark && (
        <>
          <ellipse cx="50" cy="68" rx="15" ry="14" fill="#ffd9a0" />
          <Eyes y={36} dx={8} r={5} />
          <path d="M44 46 Q50 50 56 46" stroke="#7a2a10" strokeWidth="2" fill="none" />
        </>
      )}
      <ellipse cx="38" cy="88" rx="8" ry="4" fill={c("#d0601a")} />
      <ellipse cx="62" cy="88" rx="8" ry="4" fill={c("#d0601a")} />
    </g>
  );
}

const DRAW: Record<MonsterId, (p: { dark?: string }) => React.ReactElement> = { leafy: Leafy, bubbo: Bubbo, puff: Puff, ember: Ember };

export function Portrait({ id, size = 64, silhouette = false }: { id: MonsterId; size?: number; silhouette?: boolean }) {
  const D = DRAW[id];
  return (
    <svg className={`portrait ${silhouette ? "silhouette" : ""}`} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <D dark={silhouette ? "#3a3550" : undefined} />
    </svg>
  );
}

/** Professor Maple's face for dialogue. */
export function MaplePortrait({ size = 64 }: { size?: number }) {
  return (
    <svg className="portrait" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <ellipse cx="50" cy="96" rx="34" ry="20" fill="#7f9a5a" />
      <circle cx="50" cy="54" r="26" fill="#e8b48a" />
      <path d="M24 52 Q26 26 50 26 Q74 26 76 52 Q70 40 50 38 Q30 40 24 52z" fill="#a0522d" />
      <ellipse cx="50" cy="30" rx="40" ry="6" fill="#e3cf98" />
      <path d="M28 30 Q30 8 50 8 Q70 8 72 30z" fill="#e3cf98" />
      <rect x="28" y="24" width="44" height="5" fill="#7f9a5a" />
      <circle cx="40" cy="54" r="7" fill="none" stroke="#4a3220" strokeWidth="2.5" />
      <circle cx="60" cy="54" r="7" fill="none" stroke="#4a3220" strokeWidth="2.5" />
      <path d="M47 54h6" stroke="#4a3220" strokeWidth="2.5" />
      <circle cx="40" cy="54" r="2.5" fill="#1d1712" />
      <circle cx="60" cy="54" r="2.5" fill="#1d1712" />
      <path d="M42 66 Q50 72 58 66" stroke="#8a3a2a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <ellipse cx="33" cy="63" rx="4" ry="2.5" fill="#ff9a8a" />
      <ellipse cx="67" cy="63" rx="4" ry="2.5" fill="#ff9a8a" />
    </svg>
  );
}

/** The player's own face (their thoughts). */
export function SelfPortrait({ size = 64 }: { size?: number }) {
  return (
    <svg className="portrait" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <ellipse cx="50" cy="98" rx="32" ry="20" fill="#3f9fe0" />
      <circle cx="50" cy="56" r="26" fill="#f3c9a1" />
      <path d="M24 50 Q28 26 50 28 Q72 26 76 50 Q66 40 50 42 Q34 40 24 50z" fill="#3a261a" />
      <path d="M22 40 Q26 18 50 18 Q74 18 78 40z" fill="#ef5b3a" />
      <path d="M50 38 Q80 36 86 44 Q70 46 50 42z" fill="#ef5b3a" />
      <circle cx="41" cy="56" r="3.5" fill="#1d1712" />
      <circle cx="59" cy="56" r="3.5" fill="#1d1712" />
      <path d="M43 67 Q50 72 57 67" stroke="#8a3a2a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <ellipse cx="34" cy="64" rx="4" ry="2.5" fill="#ff9a8a" />
      <ellipse cx="66" cy="64" rx="4" ry="2.5" fill="#ff9a8a" />
    </svg>
  );
}
