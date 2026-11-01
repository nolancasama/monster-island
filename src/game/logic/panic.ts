import type { EnemyKind, EnemyDef } from "../data/combat";

export interface Panic {
  t0: number;
  until: number;
  turnAt: number;
  hx: number;
  hz: number;
  blocked: number;
}

type Weight = EnemyDef["weightClass"];

/** Authored turn rates give each kind a distinct, readable run. */
export const PANIC_TURN: Record<EnemyKind, number> = {
  gloomlet: .42, forestSpitter: .45, snapjaw: .35,
  shellback: .7, thunderBeetle: .65, stormCrab: .5,
  raiderShooter: .55, raiderDrone: .38, windSprite: .35,
};

export const panicDuration = (weight: Weight) => weight === "heavy" ? 2 : 2.5;
export const panicSpeedScale = (weight: Weight) => weight === "heavy" ? 1.2 : 1.7;
export const endPanicResistance = (now: number) => now + 4;

export function canStartPanic(now: number, resistUntil: number, current: Panic | null, alive: boolean, controlled: boolean): boolean {
  return alive && !controlled && current === null && now >= resistUntil;
}

/** Only creation allocates; a running panic is always updated in place. */
export function startPanic(weight: Weight, now: number): Panic {
  return { t0: now, until: now + panicDuration(weight), turnAt: now, hx: 0, hz: 1, blocked: 0 };
}

/** Deterministic heading only. Collision, zone and hazard checks belong to stepTo. */
export function updatePanicHeading(
  panic: Panic, kind: EnemyKind, i: number, now: number,
  x: number, z: number, homeX: number, homeZ: number,
  playerX: number, playerZ: number, leash: number,
): void {
  if (now < panic.turnAt) return;
  const homeDx = homeX - x, homeDz = homeZ - z;
  const homeDistance = Math.hypot(homeDx, homeDz);
  let dx = x - playerX, dz = z - playerZ;
  const awayDistance = Math.hypot(dx, dz);
  if (awayDistance > 1e-6) { dx /= awayDistance; dz /= awayDistance; }
  else { dx = Math.sin(i * 2.399963); dz = Math.cos(i * 2.399963); }
  if (panic.blocked >= 3 && homeDistance > .05) {
    panic.hx = homeDx / homeDistance;
    panic.hz = homeDz / homeDistance;
  } else {
    if (homeDistance > leash * .7) {
      // A stronger home bias wins over fleeing near the leash edge.
      dx += homeDx / homeDistance * 2.5;
      dz += homeDz / homeDistance * 2.5;
    }
    const turn = Math.sin(i * 1.73 + (now - panic.t0) * 9) * 1.2
      + panic.blocked * 1.15;
    const angle = Math.atan2(dx, dz) + turn;
    panic.hx = Math.sin(angle);
    panic.hz = Math.cos(angle);
  }
  panic.turnAt = now + PANIC_TURN[kind];
}

/** A blocked move retries a different heading on the very next simulation step. */
export function recordPanicStep(panic: Panic, moved: number, expected: number, now: number): void {
  if (expected > 0 && moved < expected * .1) {
    panic.blocked++;
    panic.turnAt = now;
  } else panic.blocked = 0;
}
