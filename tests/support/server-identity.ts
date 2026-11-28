import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const normalise = (html: string) => html.replace(/\r\n?/g, "\n").split("\n").map((line) => line.trimEnd()).join("\n").trimEnd();

/** Playwright 1.63's createGlobalSetupTasks runs webServer plugin setup before globalSetup. */
export async function checkServerIdentity(baseURL: string, projectRoot = process.cwd()) {
  if (process.env.BASE_URL) return; // Explicit external servers have no local build identity.
  const url = new URL(baseURL);
  const expected = resolve(projectRoot, "dist/index.html");
  const fail = (reason: string) => new Error(`WRONG_SERVER: port ${url.port || (url.protocol === "https:" ? "443" : "80")}; expected ${expected}: ${reason}`);
  let local: string;
  try {
    local = await readFile(expected, "utf8");
  } catch {
    throw fail("local build is missing or unreadable; build this checkout first");
  }
  let served: string;
  try {
    const response = await fetch(baseURL, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    served = await response.text();
  } catch (error) {
    throw fail(`could not read served index.html (${String(error)})`);
  }
  if (normalise(served) !== normalise(local)) throw fail("served index.html differs from this checkout's current build");
}
