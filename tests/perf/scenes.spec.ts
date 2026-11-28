import { writeFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { test, expect } from "@playwright/test";
import { boot, chooseMode, hook, state, tap, waitFor } from "../e2e/helpers";

type Scene = { name: string; jump?: string; at?: [number, number]; profile?: string; voyage?: string };

// The forest base/garden were close to the triangle budget in the November
// decisions; include both high-layer scenery and enclosed, town and sea views.
const scenes: Scene[] = [
  { name: "forest-base", jump: "forestEntrance", at: [75, -176], profile: "forest-base" },
  { name: "volcano-slope", jump: "volcano", at: [58, -94], profile: "ember-slope" },
  { name: "sanctuary-garden", jump: "lumo", at: [64, -137], profile: "sanctuary-garden" },
  { name: "upper-canopy", jump: "upperRopeTop" },
  { name: "cave-interior", jump: "caveChamber" },
  { name: "grotto-interior", jump: "cloud:thunderGrotto" },
  { name: "port-town", jump: "market" },
  { name: "voyage-storm", voyage: "storm" }
];

async function place(page: Page, scene: Scene) {
  await page.keyboard.press("Control+Shift+KeyD");
  await expect(page.getByTestId("debug-menu")).toBeVisible();
  if (scene.voyage) {
    await page.getByTestId(`debug-voyage-${scene.voyage}`).click();
    if (await page.getByTestId("debug-menu").isVisible()) await page.keyboard.press("Escape");
    // The checkpoint opens with the authored storm introduction and help ask.
    // Answer it so sampling measures the moving barrels in free play.
    await tap(page, "leafyHelp");
    await waitFor(page, s => s.progress.act3.voyage.stage === scene.voyage && s.mode === "explore", 60_000, "voyage checkpoint");
  } else {
    await page.getByTestId(`debug-jump-${scene.jump}`).click();
    if (await page.getByTestId("debug-menu").isVisible()) await page.keyboard.press("Escape");
    await waitFor(page, s => s.screen === "game" && s.mode === "explore", 60_000, "debug destination");
  }
  await hook(page, "timeScale", 1);
  if (scene.at) {
    await hook(page, "teleport", ...scene.at, Math.PI, true);
    await hook(page, "renderFrames", 1);
    await waitFor(page, s => s.camera.profile === scene.profile, 60_000, `${scene.name} camera`);
    const player = (await state(page)).player;
    expect(Math.hypot(player.x - scene.at[0], player.z - scene.at[1]), "requested scene reached").toBeLessThan(.4);
  }
  await page.waitForTimeout(2_000); // Exclude load/teleport/camera handoff from steady-state sampling.
}

async function sample(page: Page) {
  return page.evaluate(async () => {
    type BrowserState = { perf?: { calls?: number; triangles?: number } };
    const api = (window as unknown as { __mi: { state(): BrowserState } }).__mi;
    const memory = () => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null;
    const canvas = document.querySelector("canvas");
    const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    const renderer = gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "not available";
    const longTasks: number[] = [];
    const longTaskSupported = PerformanceObserver.supportedEntryTypes.includes("longtask");
    const observer = longTaskSupported ? new PerformanceObserver(list => {
      for (const entry of list.getEntries()) longTasks.push(entry.duration);
    }) : null;
    observer?.observe({ type: "longtask" });
    const frameMs: number[] = [], calls: number[] = [], triangles: number[] = [];
    const heapStart = memory();
    let heapPeak = heapStart;
    const start = performance.now();
    let last: number | null = null;
    try {
      await new Promise<void>(resolve => {
        const frame = (now: number) => {
          if (last !== null) frameMs.push(now - last);
          last = now;
          const perf = api.state().perf;
          if (Number.isFinite(perf?.calls)) calls.push(perf!.calls!);
          if (Number.isFinite(perf?.triangles)) triangles.push(perf!.triangles!);
          const heap = memory();
          if (heap !== null) heapPeak = Math.max(heapPeak ?? 0, heap);
          if (now - start >= 5_000) resolve();
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      // Include records queued at the final animation frame before disconnect.
      for (const entry of observer?.takeRecords() ?? []) longTasks.push(entry.duration);
    } finally { observer?.disconnect(); }
    const average = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
    const p95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1];
    return {
      renderer, samplingWindowMs: performance.now() - start, frames: frameMs.length,
      frameTimeMs: { average: average(frameMs), p95: p95(frameMs) },
      // FPS equivalent of the slow (p95) frame time, rather than a misleading
      // high percentile of instantaneous FPS.
      fps: { average: 1000 / average(frameMs), atP95FrameTime: 1000 / p95(frameMs) },
      longTasks: longTaskSupported ? { count: longTasks.length, totalMs: longTasks.reduce((a, b) => a + b, 0), maxMs: Math.max(0, ...longTasks) } : "not available",
      jsHeapBytes: heapStart === null ? "not available" : { start: heapStart, end: memory(), peak: heapPeak },
      drawCalls: calls.length ? { average: average(calls), peak: Math.max(...calls) } : "not available",
      triangles: triangles.length ? { average: average(triangles), peak: Math.max(...triangles) } : "not available"
    };
  });
}

for (const scene of scenes) {
  test(`${scene.name}: desktop benchmark`, async ({ page }, testInfo) => {
    const errors = await boot(page, "debug=1");
    await chooseMode(page, "tap");
    await place(page, scene);
    const measurement = await sample(page);
    // This PC's GPU (GTX 1080) is far faster than the Chromebook's. FPS here is never a Chromebook figure;
    // the draw-call and triangle budgets are the renderer-independent Chromebook guard.
    const label = "desktop benchmark (this PC's GPU, not a Chromebook figure)";
    const callsPeak = typeof measurement.drawCalls === "string" ? null : measurement.drawCalls.peak;
    const trianglesPeak = typeof measurement.triangles === "string" ? null : measurement.triangles.peak;
    const report = {
      scene: scene.name, label, ...measurement,
      rendererCaveat: /swiftshader/i.test(measurement.renderer)
        ? "SwiftShader software renderer: FPS is not representative of any device"
        : null,
      budgets: { minimumFps: 30, drawCallsMaximum: 150, trianglesTargetRange: [50_000, 150_000] },
      comparison: {
        drawCalls: callsPeak === null ? "not available" : callsPeak <= 150 ? "pass" : "FAIL",
        triangles: trianglesPeak === null ? "not available" : trianglesPeak <= 150_000 ? "pass" : "FAIL",
        fps: measurement.fps.average >= 30 && measurement.fps.atP95FrameTime >= 30 ? "pass" : "warning: below 30 FPS on the desktop benchmark"
      }
    };
    const path = testInfo.outputPath(`${scene.name}.json`);
    await writeFile(path, JSON.stringify(report, null, 2));
    await testInfo.attach(`${scene.name} performance`, { path, contentType: "application/json" });
    console.log(`${scene.name}: ${label}; renderer=${measurement.renderer}`);
    if (report.rendererCaveat) console.warn(`${scene.name}: ${report.rendererCaveat}`);
    console.table([{
      scene: scene.name, "avg ms": measurement.frameTimeMs.average.toFixed(2), "p95 ms": measurement.frameTimeMs.p95.toFixed(2),
      "avg FPS": measurement.fps.average.toFixed(1), "FPS at p95": measurement.fps.atP95FrameTime.toFixed(1),
      "peak calls (<=150)": callsPeak ?? "not available", "peak triangles (50k-150k target)": trianglesPeak ?? "not available",
      "calls budget": report.comparison.drawCalls, "triangles budget": report.comparison.triangles, "FPS (>=30)": report.comparison.fps
    }]);
    if (report.comparison.fps !== "pass") console.warn(`${scene.name}: ${report.comparison.fps}`);
    expect(measurement.frames, "sampling captured rendered frames").toBeGreaterThan(0);
    if (callsPeak !== null) expect(callsPeak, "draw call budget").toBeLessThanOrEqual(150);
    if (trianglesPeak !== null) expect(trianglesPeak, "triangle budget").toBeLessThanOrEqual(150_000);
    expect(errors, "browser errors").toEqual([]);
  });
}
