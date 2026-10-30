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
