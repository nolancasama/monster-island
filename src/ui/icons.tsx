import type { ReactNode } from "react";
import { Portrait } from "./Portraits";
import type { MonsterId } from "../game/types";

/** Inline SVG icons: no icon fonts, no downloads. */

const PATHS: Record<string, ReactNode> = {
  apples: (
    <>
      <path d="M32 18c-6-6-20-4-20 12 0 14 10 24 20 22 10 2 20-8 20-22 0-16-14-18-20-12z" fill="#e83a35" />
      <path d="M32 18c0-5 1-9 4-12" stroke="#6d4626" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M35 11c5-5 12-4 14-2-3 5-9 6-14 2z" fill="#58b447" />
      <ellipse cx="22" cy="28" rx="3.5" ry="6" fill="#ff8a80" opacity=".7" />
    </>
  ),
  bananas: (
    <>
      <path d="M12 20c2 18 16 30 38 26-4 6-18 12-30 6S8 30 12 20z" fill="#ffd23f" stroke="#c99a1a" strokeWidth="2" />
      <path d="M16 16c4 16 16 24 34 22-4 5-16 8-26 2S12 24 16 16z" fill="#ffe36b" stroke="#c99a1a" strokeWidth="2" />
      <rect x="11" y="12" width="7" height="7" rx="2" fill="#6f8a3a" />
    </>
  ),
  fish: (
    <>
      <path d="M8 32c8-12 24-16 36-8l10-8v32l-10-8C32 48 16 44 8 32z" fill="#7fb6e0" stroke="#3f7fb0" strokeWidth="2.5" />
      <circle cx="18" cy="29" r="3" fill="#1d1712" />
      <path d="M28 24c3 5 3 11 0 16" stroke="#3f7fb0" strokeWidth="2.5" fill="none" />
    </>
  ),
  berries: (
    <>
      <circle cx="22" cy="38" r="9" fill="#d6234f" />
      <circle cx="40" cy="38" r="9" fill="#8a2be2" />
      <circle cx="31" cy="26" r="9" fill="#d6234f" />
      <circle cx="19" cy="35" r="2.5" fill="#fff" opacity=".6" />
      <circle cx="37" cy="35" r="2.5" fill="#fff" opacity=".6" />
      <circle cx="28" cy="23" r="2.5" fill="#fff" opacity=".6" />
      <path d="M31 17c4-6 10-7 14-5-4 5-9 6-14 5z" fill="#58b447" />
    </>
  ),
  meat: (
    <>
      <ellipse cx="28" cy="32" rx="18" ry="13" fill="#c0503a" />
      <ellipse cx="26" cy="30" rx="10" ry="6" fill="#e07a62" />
      <rect x="42" y="28" width="14" height="7" rx="3" fill="#f5ecd8" />
      <circle cx="56" cy="28" r="4" fill="#f5ecd8" />
      <circle cx="56" cy="36" r="4" fill="#f5ecd8" />
    </>
  ),
  swim: (
    <>
      <path d="M6 44c6-5 10-5 16 0s10 5 16 0 10-5 16 0" stroke="#2f9fd8" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M6 54c6-5 10-5 16 0s10 5 16 0 10-5 16 0" stroke="#7fd0f0" strokeWidth="5" fill="none" strokeLinecap="round" />
      <circle cx="40" cy="20" r="7" fill="#f3c9a1" />
      <path d="M14 36l14-12 10 6" stroke="#f3c9a1" strokeWidth="6" fill="none" strokeLinecap="round" />
    </>
  ),
  fly: (
    <>
      <path d="M32 34C22 18 8 18 4 22c6 2 12 8 16 16zM32 34c10-16 24-16 28-12-6 2-12 8-16 16z" fill="#a070e0" />
      <ellipse cx="32" cy="38" rx="7" ry="10" fill="#c49aff" />
      <path d="M12 52h40" stroke="#7fd0f0" strokeWidth="4" strokeLinecap="round" strokeDasharray="6 6" />
    </>
  ),
  jump: (
    <>
      <path d="M32 6l-10 12h6v14h8V18h6z" fill="#ff8a2a" />
      <circle cx="32" cy="42" r="7" fill="#f3c9a1" />
      <path d="M20 58c4-6 8-8 12-8s8 2 12 8" stroke="#8a6238" strokeWidth="4" fill="none" strokeLinecap="round" />
    </>
  ),
  help: (
    <>
      <path d="M8 40c6-4 12-6 18-4l10 4c3 1 3 5 0 6l-10-2" stroke="#f3c9a1" strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M56 40c-6-4-12-6-18-4" stroke="#5cc24a" strokeWidth="7" fill="none" strokeLinecap="round" />
      <path d="M32 10c-3-4-10-3-10 3 0 6 10 11 10 11s10-5 10-11c0-6-7-7-10-3z" fill="#ff5c8a" />
    </>
  ),
  grow: (
    <>
      <path d="M32 58V28" stroke="#3a8a2e" strokeWidth="5" strokeLinecap="round" />
      <path d="M32 34C20 34 14 24 14 16c10 0 18 6 18 18zM32 28c0-12 8-20 18-20 0 10-6 20-18 20z" fill="#5cc24a" />
    </>
  ),
  fire: <path d="M32 6c4 12 18 18 18 34 0 10-8 18-18 18S14 50 14 40c0-8 6-12 8-18 2 6 6 8 6 8 0-10 4-18 4-24z" fill="#ff8a2a" />,
  mic: (
    <>
      <rect x="22" y="6" width="20" height="32" rx="10" fill="currentColor" />
      <path d="M14 30c0 10 8 18 18 18s18-8 18-18" stroke="currentColor" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M32 48v10M22 58h20" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    </>
  ),
  speaker: (
    <>
      <path d="M8 24h12l14-12v40L20 40H8z" fill="currentColor" />
      <path d="M42 22c4 4 4 16 0 20M48 16c8 8 8 24 0 32" stroke="currentColor" strokeWidth="4.5" fill="none" strokeLinecap="round" />
    </>
  ),
  close: <path d="M16 16l32 32M48 16L16 48" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />,
  check: <path d="M12 34l13 13 27-29" stroke="currentColor" strokeWidth="8" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  cross: <path d="M18 18l28 28M46 18L18 46" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />,
  journal: (
    <>
      <rect x="10" y="8" width="42" height="50" rx="5" fill="#8b4a2b" />
      <rect x="16" y="8" width="36" height="50" rx="4" fill="#c0703a" />
      <rect x="22" y="16" width="24" height="16" rx="3" fill="#f8efd8" />
      <path d="M28 26c0-4 4-6 6-6s6 2 6 6-3 4-6 4-6 0-6-4z" fill="#5cc24a" />
      <circle cx="31" cy="24" r="1.5" fill="#1d1712" />
      <circle cx="37" cy="24" r="1.5" fill="#1d1712" />
      <path d="M10 18h6M10 30h6M10 42h6" stroke="#f8efd8" strokeWidth="3" />
    </>
  ),
  gear: (
    <path
      d="M28 6h8l1.5 6.5 5 2 5.5-3.5 5.5 5.5-3.5 5.5 2 5L58 28v8l-6.5 1.5-2 5 3.5 5.5-5.5 5.5-5.5-3.5-5 2L36 58h-8l-1.5-6.5-5-2-5.5 3.5-5.5-5.5 3.5-5.5-2-5L6 36v-8l6.5-1.5 2-5L11 16l5.5-5.5 5.5 3.5 5-2zM32 22a10 10 0 100 20 10 10 0 000-20z"
      fill="currentColor"
      fillRule="evenodd"
    />
  ),
  hand: (
    <path
      d="M24 30V12a4 4 0 018 0v14V8a4 4 0 018 0v18-14a4 4 0 018 0v24c0 12-8 20-18 20-8 0-12-4-16-10l-8-12a4 4 0 016-5l4 4z"
      fill="currentColor"
    />
  ),
  star: <path d="M32 4l8 18 20 2-15 13 5 20-18-11-18 11 5-20L4 24l20-2z" fill="#ffd23f" stroke="#c99a1a" strokeWidth="2.5" strokeLinejoin="round" />,
  heart: <path d="M32 56S6 40 6 22c0-10 8-16 15-16 6 0 9 4 11 7 2-3 5-7 11-7 7 0 15 6 15 16 0 18-26 34-26 34z" fill="#ff5c8a" />,
  path: (
    <>
      <path d="M20 60c4-16 20-20 20-34 0-8-6-14-8-20" stroke="#e2c78f" strokeWidth="10" fill="none" strokeLinecap="round" />
      <path d="M20 60c4-16 20-20 20-34 0-8-6-14-8-20" stroke="#fff" strokeWidth="2" fill="none" strokeDasharray="4 6" />
    </>
  ),
  play: <path d="M18 10l36 22-36 22z" fill="currentColor" />,
  // Act 2: Monster Coins and amber (the treats' rare ingredient).
  coin: (
    <>
      <circle cx="32" cy="32" r="24" fill="#ffcf3a" stroke="#c99a1a" strokeWidth="3" />
      <circle cx="32" cy="32" r="15" fill="none" stroke="#e0a800" strokeWidth="3" />
      <path d="M26 24c4-4 12-3 12 3s-12 4-12 10 8 7 12 3" stroke="#a87400" strokeWidth="4" fill="none" strokeLinecap="round" />
    </>
  ),
  amber: (
    <>
      <path d="M32 6l20 16-6 30H18l-6-30z" fill="#ffa21f" stroke="#b86a00" strokeWidth="3" strokeLinejoin="round" />
      <path d="M24 18l8-6 10 8" stroke="#ffe0a0" strokeWidth="3" fill="none" strokeLinecap="round" />
    </>
  )
};

const MONSTER_IDS = new Set(["leafy", "bubbo", "puff", "ember"]);

export function Icon({ id, size = 32, className }: { id: string; size?: number; className?: string }) {
  if (MONSTER_IDS.has(id)) return <Portrait id={id as MonsterId} size={size} />;
  return (
    <svg className={`icon ${className ?? ""}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      {PATHS[id] ?? PATHS.star}
    </svg>
  );
}
