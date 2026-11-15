import { debugEnabled } from "./debugAccess";
import { useDebug } from "./debugState";

export const CLOUD_ISLE_RELEASED = false;

/** The ship override requires explicit opt-in, including on the dev server. */
export function cloudIsleShipDebugEnabled(): boolean {
  return debugEnabled && typeof location !== "undefined" && new URLSearchParams(location.search).get("debug") === "1";
}

let e2eShipOpen = false;
/** Browser tests (?e2e=1 hook only) open the ship without debug mode's script changes. */
export function setE2eCloudIsleShipOpen(open: boolean): void { e2eShipOpen = open; }

/** Session memory only; the override never belongs to progress or saved data. */
export function cloudIsleOpen(): boolean {
  return CLOUD_ISLE_RELEASED || e2eShipOpen || (cloudIsleShipDebugEnabled() && useDebug.getState().cloudIsleShipOpen);
}

let e2ePirateVoyage = false;
/** Browser tests (?e2e=1 hook only) choose the pirate voyage for Gull's first trip. */
export function setE2ePirateVoyage(on: boolean): void { e2ePirateVoyage = on; }

/**
 * The pirate voyage (docs/PIRATE_VOYAGE.md) is a debug-menu preview: only the
 * debug menu's switch (session memory, `?debug=1`) or the e2e hook replaces
 * Gull's original crossing with it. Students never reach it.
 */
export function pirateVoyageOpen(): boolean {
  return e2ePirateVoyage || (cloudIsleShipDebugEnabled() && useDebug.getState().pirateVoyage);
}

export function setCloudIsleShipOpen(open: boolean): void {
  if (cloudIsleShipDebugEnabled()) useDebug.setState({ cloudIsleShipOpen: open });
}

export const CLOUD_ISLE_SOON = { en: "Cloud Isle — Coming Soon!", ja: "クラウドじま — もうすぐ！" };
export const CLOUD_ISLE_SHIP_SOON = {
  en: "The ship to Cloud Isle isn't ready yet. Coming soon!",
  ja: "クラウドじまへの ふねは まだ じゅんびちゅうだよ。もうすぐ いけるよ！"
};

/** First visits reveal the lead even while departure is locked. */
export function harborDecision(leadHeard: boolean): "lead" | "locked" | "sail" {
  return !leadHeard ? "lead" : cloudIsleOpen() ? "sail" : "locked";
}
