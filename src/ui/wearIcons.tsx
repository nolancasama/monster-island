import type { ReactElement } from "react";
import { WEARABLES, type WearableId } from "../game/data/wearables";

/** Flat SVG pictures of Ms. Button's items, in the colours their 3D models use (viewBox 64×64). */
const DRAW: Record<WearableId, (c: string[]) => ReactElement> = {
  partyHat: (c) => (
    <>
      <path d="M32 6 L48 54 H16 Z" fill={c[0]} />
      <circle cx="28" cy="28" r="3" fill={c[1]} />
      <circle cx="36" cy="40" r="3" fill={c[1]} />
      <circle cx="26" cy="46" r="3" fill={c[2]} />
      <rect x="14" y="52" width="36" height="6" rx="3" fill={c[1]} />
      <circle cx="32" cy="7" r="5" fill={c[2]} />
    </>
  ),
  bigBow: (c) => (
    <>
      <path d="M32 32 L8 16 Q4 32 8 48 Z" fill={c[0]} />
      <path d="M32 32 L56 16 Q60 32 56 48 Z" fill={c[0]} />
      <path d="M28 34 L22 56 L28 52 L32 58 Z M36 34 L42 56 L36 52 L32 58 Z" fill={c[1]} />
      <rect x="26" y="25" width="12" height="14" rx="5" fill={c[1]} />
    </>
  ),
  flowerCrown: (c) => (
    <>
      <path d="M6 40 Q32 22 58 40" stroke={c[0]} strokeWidth="5" fill="none" strokeLinecap="round" />
      {[[10, 37], [21, 31], [32, 29], [43, 31], [54, 37]].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="6.5" fill={c[1]} />
          <circle cx={x} cy={y} r="2.6" fill={c[2]} />
        </g>
      ))}
    </>
  ),
  babyBonnet: (c) => (
    <>
      <path d="M10 44 Q10 12 32 12 Q54 12 54 44 Z" fill={c[0]} />
      <path d="M8 44 Q12 38 16 44 Q20 38 24 44 Q28 38 32 44 Q36 38 40 44 Q44 38 48 44 Q52 38 56 44 L56 48 H8 Z" fill={c[1]} />
      <path d="M20 48 L14 60 M44 48 L50 60" stroke={c[2]} strokeWidth="4" strokeLinecap="round" />
      <circle cx="20" cy="48" r="4" fill={c[2]} />
      <circle cx="44" cy="48" r="4" fill={c[2]} />
    </>
  ),
  bandana: (c) => (
    <>
      <path d="M6 30 Q32 14 58 30 L52 40 Q32 30 12 40 Z" fill={c[0]} />
      <path d="M54 34 L62 46 L52 44 Z M54 34 L58 52 L50 44 Z" fill={c[0]} />
      {[[20, 28], [32, 24], [44, 28], [26, 33], [38, 33]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.2" fill={c[1]} />)}
    </>
  ),
  explorerHat: (c) => (
    <>
      <ellipse cx="32" cy="44" rx="28" ry="8" fill={c[0]} />
      <path d="M16 44 Q16 18 32 18 Q48 18 48 44 Z" fill={c[0]} />
      <rect x="16" y="34" width="32" height="6" fill={c[1]} />
      <path d="M22 26 Q32 22 42 26" stroke="#fff6dc" strokeWidth="2" fill="none" opacity="0.6" />
    </>
  ),
  pirateHat: (c) => (
    <>
      <path d="M4 40 Q32 6 60 40 Q46 32 32 46 Q18 32 4 40 Z" fill={c[0]} />
      <path d="M4 40 Q18 32 32 46 Q46 32 60 40" stroke={c[1]} strokeWidth="3" fill="none" />
      <circle cx="32" cy="28" r="6" fill={c[2]} />
      <circle cx="30" cy="27" r="1.4" fill={c[0]} />
      <circle cx="34" cy="27" r="1.4" fill={c[0]} />
      <path d="M26 36 L38 30 M26 30 L38 36" stroke={c[2]} strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
  knightHelmet: (c) => (
    <>
      <path d="M30 14 Q26 2 40 4 Q34 8 34 14 Z" fill={c[1]} />
      <path d="M12 50 Q12 14 32 14 Q52 14 52 50 Z" fill={c[0]} />
      <rect x="18" y="30" width="28" height="5" rx="2.5" fill={c[2]} />
      <rect x="10" y="48" width="44" height="6" rx="3" fill={c[0]} />
      <circle cx="32" cy="22" r="2.2" fill="#ffffff" opacity="0.7" />
    </>
  ),
  crown: (c) => (
    <>
      <path d="M8 50 L10 18 L22 32 L32 12 L42 32 L54 18 L56 50 Z" fill={c[0]} />
      <rect x="8" y="46" width="48" height="8" rx="2" fill={c[0]} />
      <circle cx="32" cy="38" r="4.5" fill={c[1]} />
      <circle cx="19" cy="40" r="3.4" fill={c[2]} />
      <circle cx="45" cy="40" r="3.4" fill={c[2]} />
      <circle cx="32" cy="12" r="3" fill={c[1]} />
    </>
  ),
  mustache: (c) => (
    <path d="M32 28 Q24 22 16 28 Q10 34 4 28 Q6 40 16 40 Q26 40 32 34 Q38 40 48 40 Q58 40 60 28 Q54 34 48 28 Q40 22 32 28 Z" fill={c[0]} />
  ),
  sunglasses: (c) => (
    <>
      <path d="M6 24 H58" stroke={c[0]} strokeWidth="4" strokeLinecap="round" />
      <rect x="8" y="22" width="20" height="16" rx="7" fill={c[1]} stroke={c[0]} strokeWidth="3" />
      <rect x="36" y="22" width="20" height="16" rx="7" fill={c[1]} stroke={c[0]} strokeWidth="3" />
      <path d="M12 27 L18 27" stroke="#ffffff" strokeWidth="2" opacity="0.6" strokeLinecap="round" />
      <path d="M40 27 L46 27" stroke="#ffffff" strokeWidth="2" opacity="0.6" strokeLinecap="round" />
    </>
  ),
  heartGlasses: (c) => (
    <>
      <path d="M26 30 Q32 26 38 30" stroke={c[0]} strokeWidth="3" fill="none" />
      {[16, 48].map((x) => (
        <path key={x} d={`M${x} 44 L${x - 11} 32 Q${x - 13} 22 ${x - 5} 22 Q${x - 1} 22 ${x} 27 Q${x + 1} 22 ${x + 5} 22 Q${x + 13} 22 ${x + 11} 32 Z`} fill={c[1]} stroke={c[0]} strokeWidth="3" />
      ))}
    </>
  ),
  captainHat: (c) => (
    <>
      <path d="M44 22 Q58 4 62 10 Q54 14 48 26 Z" fill={c[2]} />
      <path d="M2 42 Q32 2 62 42 Q46 32 32 48 Q18 32 2 42 Z" fill={c[0]} />
      <path d="M2 42 Q18 32 32 48 Q46 32 62 42" stroke={c[1]} strokeWidth="3.5" fill="none" />
      <rect x="27" y="24" width="10" height="10" rx="2" fill={c[1]} transform="rotate(45 32 29)" />
    </>
  ),
  goggles: (c) => (
    <>
      <rect x="2" y="27" width="60" height="8" rx="4" fill={c[0]} />
      <circle cx="21" cy="31" r="11" fill={c[2]} />
      <circle cx="43" cy="31" r="11" fill={c[2]} />
      <circle cx="21" cy="31" r="7.5" fill={c[1]} />
      <circle cx="43" cy="31" r="7.5" fill={c[1]} />
      <path d="M17 27 L20 26" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
      <path d="M39 27 L42 26" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
};

export function WearIcon({ id, size = 48 }: { id: WearableId; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      {DRAW[id](WEARABLES[id].colors)}
    </svg>
  );
}
