import { debugEnabled } from "./debugAccess";
import { useDebug } from "./debugState";
import { jumpDebug } from "./debugTravel";
import { cloudIsleShipDebugEnabled, setCloudIsleShipOpen } from "./release";
import { getGame, setGame } from "./store";
import { resetVoyageRt } from "./voyageRt";
import { resumeVoyage } from "./flow/voyage";
import { newVoyage, VOYAGE_JOBS, type VoyageStage } from "./logic/voyage";

/**
 * The pirate voyage preview, reachable only from the debug menu (`?debug=1`).
 * Turning it on also opens the Cloud Isle ship; with it off, Gull's first trip
 * is the original crossing.
 */
export function setDebugPirateVoyage(on: boolean) {
  if (!cloudIsleShipDebugEnabled()) return;
  useDebug.setState({ pirateVoyage: on });
  if (on) setCloudIsleShipOpen(true);
}

export type DebugVoyageStart = "gull" | Extract<VoyageStage, "captured" | "jobs" | "storm" | "raft">;
export const DEBUG_VOYAGE_STARTS: ReadonlyArray<{ id: DebugVoyageStart; label: string }> = [
  { id: "gull", label: "Talk to Gull (departure)" },
  { id: "captured", label: "Captured (free roam)" },
  { id: "jobs", label: "Jobs (none done)" },
  { id: "storm", label: "Storm" },
  { id: "raft", label: "Raft" },
];

/** Jump to Port dock with the voyage switched on, at its start or a checkpoint (as a reload would). */
export function startDebugVoyage(start: DebugVoyageStart): string {
  if (!debugEnabled || !cloudIsleShipDebugEnabled()) return "Needs ?debug=1";
  setDebugPirateVoyage(true);
  jumpDebug("voyage");
  const g = getGame();
  const late = start === "storm" || start === "raft";
  const voyage = start === "gull" ? newVoyage()
    : { ...newVoyage(), stage: start, interrogated: true, jobs: late ? [...VOYAGE_JOBS] : [], hat: late };
  setGame({ progress: { ...g.progress, act3: { ...g.progress.act3, voyageDone: false, voyage } } });
  resetVoyageRt();
  if (start === "gull") return "Pirate voyage on: talk to Gull at the harbour";
  void resumeVoyage();
  return `Pirate voyage: ${start}`;
}
