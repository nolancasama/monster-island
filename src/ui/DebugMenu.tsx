import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { debugEnabled } from "../game/debugAccess";
import { cloudIsleShipDebugEnabled, setCloudIsleShipOpen } from "../game/release";
import { useDebug } from "../game/debugState";
import { debugHeal, debugKillZone, debugUnlockFriends, resetDebugSave, setDebugNoclip } from "../game/debugActions";
import { DEBUG_DESTINATIONS, jumpDebug, switchDebugWorld, teleportDebug } from "../game/debugTravel";
import { rt } from "../game/runtime";
import { getGame, setGame, useGame } from "../game/store";
import { combatZoneAt } from "../game/combat";
import { BAG_MAX, FOODS } from "../game/data/foods";
import { gatesOf, isWalkable, standY } from "../game/world/collision";
import type { FoodId } from "../game/types";
import "./debug.css";

const BOUNDS = {
  home: { x0: -40, x1: 125, z0: -345, z1: 20 },
  cloud: { x0: -38, x1: 38, z0: -12, z1: 184 }
};

function usePosition() {
  const read = () => ({ x: rt.player.x, y: rt.player.y, z: rt.player.z, world: rt.world, zone: combatZoneAt(rt.player.x, rt.player.z) ?? rt.camera.profile });
  const [position, setPosition] = useState(read);
  useEffect(() => {
    const timer = window.setInterval(() => setPosition(read()), 200);
    return () => window.clearInterval(timer);
  }, []);
  return position;
}

function TravelMap({ position }: { position: ReturnType<typeof usePosition> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const progress = useGame(s => s.progress);
  const [cursor, setCursor] = useState({ x: position.x, z: position.z });
  const b = BOUNDS[position.world];
  const width = 180, height = 360;
  const pixel = (x: number, z: number) => ({ x: (x - b.x0) / (b.x1 - b.x0) * width, y: (position.world === "cloud" ? b.z1 - z : z - b.z0) / (b.z1 - b.z0) * height });
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const gates = gatesOf(progress);
    const image = ctx.createImageData(width, height);
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const x = b.x0 + px / width * (b.x1 - b.x0);
        const z = position.world === "cloud" ? b.z1 - py / height * (b.z1 - b.z0) : b.z0 + py / height * (b.z1 - b.z0);
        const walk = isWalkable(x, z, gates);
        const shade = walk ? Math.min(75, Math.max(0, standY(x, z, progress.solved))) : 0;
        const i = (py * width + px) * 4;
        image.data[i] = walk ? 75 + shade : 30;
        image.data[i + 1] = walk ? 130 + shade : 58;
        image.data[i + 2] = walk ? 83 + shade : 75;
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }, [progress, position.world, b]);
  const dot = pixel(position.x, position.z), cross = pixel(cursor.x, cursor.z);
  return <div className="debug-map-section">
    <div className="debug-map" style={{ aspectRatio: `${width}/${height}` }}>
      <canvas ref={canvas} width={width} height={height} role="button" tabIndex={0} aria-label="Travel map: click to teleport; arrow keys move cursor, Enter teleports" onClick={e => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = b.x0 + (e.clientX - rect.left) / rect.width * (b.x1 - b.x0);
        const fraction = (e.clientY - rect.top) / rect.height;
        const z = position.world === "cloud" ? b.z1 - fraction * (b.z1 - b.z0) : b.z0 + fraction * (b.z1 - b.z0);
        setCursor({ x, z });
        teleportDebug(x, z);
      }} onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); teleportDebug(cursor.x, cursor.z); }
        const moves: Record<string, [number, number]> = { ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, position.world === "cloud" ? 2 : -2], ArrowDown: [0, position.world === "cloud" ? -2 : 2] };
        const move = moves[e.key];
        if (move) { e.preventDefault(); setCursor(p => ({ x: Math.max(b.x0, Math.min(b.x1, p.x + move[0])), z: Math.max(b.z0, Math.min(b.z1, p.z + move[1])) })); }
      }} />
      <span className="debug-map-cursor" style={{ left: `${cross.x / width * 100}%`, top: `${cross.y / height * 100}%` }}>+</span>
      <span className="debug-map-player" style={{ left: `${dot.x / width * 100}%`, top: `${dot.y / height * 100}%` }} />
      <span className="debug-map-north">N ↑</span>
    </div>
    <p>Green: walkable terrain. White dot: player. Click to travel; blocked points snap to ground.</p>
    <p>Keyboard: focus map, arrows to aim, Enter to travel.</p>
  </div>;
}

function DebugDialog() {
  const debug = useDebug();
  const position = usePosition();
  const dialog = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(position.x.toFixed(2));
  const [z, setZ] = useState(position.z.toFixed(2));
  const [message, setMessage] = useState("");
  const [scale, setScale] = useState(rt.timeScale);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.focus();
    return () => previous?.focus();
  }, []);
  const run = (action: () => unknown, label: string) => {
    try { action(); setMessage(label); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Debug action failed"); }
  };
  const trapFocus = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button,input,select,[tabindex="0"]') ?? []);
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { e.preventDefault(); first?.focus(); }
  };
  return <div className="debug-back ui">
    <div ref={dialog} className="debug-dialog panel" role="dialog" aria-modal="true" aria-labelledby="debug-heading" tabIndex={-1} data-testid="debug-menu" onKeyDown={trapFocus}>
      <header><div><h1 id="debug-heading">Playtest debug menu</h1><p>Game paused · Ctrl+Shift+D / ` / Esc to close · separate debug save</p></div><button aria-label="Close debug menu" onClick={() => useDebug.setState({ open: false })}>Close</button></header>
      <output className="debug-position" data-testid="debug-position">{position.world} · {position.zone} · x {position.x.toFixed(2)} / y {position.y.toFixed(2)} / z {position.z.toFixed(2)}</output>
      <div className="debug-columns">
        <section className="debug-destinations" aria-label="Jump to"><h2>Jump to</h2><p>Sets story progress and friends for this point.</p>
          {(["Prologue", "Act 2", "Act 3"] as const).map(act => <fieldset key={act}><legend>{act}</legend><div className="debug-destination-grid">{DEBUG_DESTINATIONS.filter(d => d.act === act).map(d => <button key={d.id} data-testid={`debug-jump-${d.id}`} onClick={() => run(() => jumpDebug(d.id), `Jumped to ${d.label}`)}>{d.label}</button>)}</div></fieldset>)}
        </section>
        <section aria-label="Travel anywhere"><h2>Travel anywhere</h2>
          <label className="debug-world">World <select value={position.world} onChange={e => run(() => switchDebugWorld(e.target.value as "home" | "cloud"), "World changed")}><option value="home">Main island + lowland</option><option value="cloud">Cloud Isle</option></select></label>
          <form className="debug-coordinates" onSubmit={e => { e.preventDefault(); const nx = Number(x), nz = Number(z); if (x.trim() && z.trim() && Number.isFinite(nx) && Number.isFinite(nz)) run(() => teleportDebug(nx, nz), "Teleported to nearest walkable spot"); else setMessage("Enter finite x and z coordinates"); }}>
            <label>x<input type="number" step="any" value={x} onChange={e => setX(e.target.value)} required /></label><label>z<input type="number" step="any" value={z} onChange={e => setZ(e.target.value)} required /></label><button type="submit">Go</button><button type="button" onClick={() => { setX(position.x.toFixed(2)); setZ(position.z.toFixed(2)); }}>Use current</button>
          </form>
          <TravelMap position={position} />
        </section>
        <section className="debug-cheats" aria-label="Cheats"><h2>Cheats</h2>
          {cloudIsleShipDebugEnabled() && <button data-testid="debug-cloud-ship" aria-pressed={debug.cloudIsleShipOpen} onClick={() => setCloudIsleShipOpen(!debug.cloudIsleShipOpen)}>Cloud Isle ship: {debug.cloudIsleShipOpen ? "open" : "locked"}</button>}
          <button onClick={() => run(debugHeal, "HP and all MP restored")}>Full heal: HP + all MP</button>
          <button onClick={() => run(() => { const p = getGame().progress; setGame({ progress: { ...p, act2: { ...p.act2, coins: p.act2.coins + 100 } } }); }, "Added 100 coins")}>+100 coins</button>
          <button onClick={() => run(() => { const p = getGame().progress, bag = { ...p.bag }; for (const food of Object.keys(FOODS) as FoodId[]) bag[food] = Math.min(BAG_MAX, (bag[food] ?? 0) + 10); setGame({ progress: { ...p, bag } }); }, "Added 10 of every food (max 99)")}>+10 of every food</button>
          <button onClick={() => run(debugUnlockFriends, "All friends unlocked")}>Unlock all friends</button>
          <button onClick={() => run(debugKillZone, "Active zone enemies defeated")}>Kill active zone enemies</button>
          <label><input type="checkbox" checked={debug.invincible} onChange={e => useDebug.setState({ invincible: e.target.checked })} /> Invincibility</label>
          <label><input type="checkbox" checked={debug.collision} onChange={e => useDebug.setState({ collision: e.target.checked })} /> Collision overlay</label>
          <label><input type="checkbox" checked={debug.noclip} onChange={e => run(() => setDebugNoclip(e.target.checked), e.target.checked ? "Free fly enabled; close menu to fly" : "Dropped to walkable ground")} /> Free fly / noclip</label>
          <p>Close menu to fly. Movement keys steer; Space / Shift rise / descend. Hold Alt to fly faster.</p>
          <label>Time scale <select value={scale} onChange={e => { const k = Number(e.target.value); rt.timeScale = k; setScale(k); }}><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option></select></label>
          <button className="debug-reset" onClick={() => run(resetDebugSave, "Debug save reset")}>Reset debug save</button>
        </section>
      </div>
      <output className="debug-message" role="status">{message || "Choose a destination or set up a playtest."}</output>
    </div>
  </div>;
}

export function DebugMenu() {
  const open = useDebug(s => s.open);
  if (!debugEnabled) return null;
  return <><span className="debug-badge ui" data-testid="debug-badge">DEBUG</span>{open && <DebugDialog />}</>;
}
