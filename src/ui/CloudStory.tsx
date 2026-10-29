import { useGame } from "../game/store";
import { Ja } from "./Talk";

/** Kiko's crayon drawing stays beside the speech/Tap exchange. It never
 * blocks those controls or requires a separate keyboard-only dismissal. */
export function CloudStory() {
  const drawing = useGame(s => s.drawing);
  if (!drawing) return null;
  return <aside className="lumo-drawing panel ui" data-testid="lumo-drawing" aria-label="Kiko's drawing of Lumo in a raider cage">
    <b>Kiko's drawing<Ja>キコが かいた え</Ja></b>
    <svg viewBox="0 0 340 230" role="img" aria-label="Shining yellow Lumo in a cage under a crescent airship">
      <defs><filter id="crayon"><feTurbulence baseFrequency=".12" numOctaves="2" result="noise" seed="4"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="1.4"/></filter></defs>
      <rect x="1" y="1" width="338" height="228" rx="5" fill="#f5e7c3"/>
      <g filter="url(#crayon)" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 201 58 145 83 185 121 130 176 197 236 120 320 203" fill="none" stroke="#8a9c86" strokeWidth="5"/>
        <path d="M65 54Q157-9 281 45L263 72 80 76Z" fill="#788894" stroke="#586578" strokeWidth="5"/>
        <path d="M166 23Q139 48 177 57Q157 39 180 24" fill="#d9c585" stroke="#e2ce91" strokeWidth="3"/>
        <path d="M143 76V104m57-28v28" stroke="#807b76" strokeWidth="4"/>
        <path d="M147 156q-14-37 10-45 20-16 36 5 20 11 4 40l-8 14h-33Z" fill="#f3d353" stroke="#d2ab32" strokeWidth="4"/>
        <path d="m150 126-16-12 6 28m57-16 17-12-7 27" fill="#f3d353" stroke="#d2ab32" strokeWidth="3"/>
        <circle cx="162" cy="138" r="3" fill="#66514a"/><circle cx="184" cy="138" r="3" fill="#66514a"/>
        <path d="m167 152 6-3 7 3M155 110l-3-17m38 16 5-16m-68 43-12-3m105 3 13-4" fill="none" stroke="#e8bd3e" strokeWidth="3"/>
        <path d="M126 105H220V177H126ZM129 179H218M141 105V177m16-72v72m17-72v72m17-72v72m16-72v72" fill="none" stroke="#6f7380" strokeWidth="4"/>
        <path d="m30 30 5-12 4 12 12 4-12 3-4 12-5-12-12-3Z" fill="none" stroke="#d1b857" strokeWidth="3"/>
      </g>
      <text x="137" y="214" fontSize="19" fill="#766449" fontFamily="cursive">LUMO!</text>
    </svg>
  </aside>;
}
