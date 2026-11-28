# Chromebook Hardware Target and Performance Testing

This game is played by elementary school students in Matsubara City, Osaka, Japan,
on school Chromebooks. Design, budget and test for that device, not for the
development PC.

## 1. Target hardware

| | |
|---|---|
| Model | Lenovo 500e Chromebook Gen 4 |
| CPU | Intel N100-class, 4 cores / 4 threads, ~6 W (low sustained power) |
| GPU | Integrated Intel UHD Graphics (roughly 15–20× weaker than the dev PC's GTX 1080) |
| RAM | Assume 4 GB |
| Storage | eMMC (slow asset loading) |
| Display | 1366 × 768, 60 Hz, device pixel ratio 1 |
| OS / browser | ChromeOS, Google Chrome |
| Input | Touchpad, touchscreen, keyboard. No mouse, no dedicated GPU |

The exact CPU and RAM have not been confirmed yet. Treat the above as a
conservative baseline. Once confirmed (`chrome://system` on a school device),
update this table.

## 2. Performance targets

- Minimum: stable 30 FPS. Preferred: 60 FPS where practical.
- No noticeable stutter, freezes or input delay, including over long sessions.
- Leave headroom for ChromeOS, other tabs and background processes.

Initial budgets (adjust from profiling):

- Visible triangles: 50,000–150,000
- Draw calls: preferably below 100–150
- Textures: generally 512 × 512 or 1024 × 1024
- Internal render resolution: adaptive between 960 × 540 and native
- Keep real-time shadows, dynamic lights and post-processing minimal

Never reduce English-learning content, essential mechanics, collision
reliability or important NPC interactions to gain performance. Reduce render
resolution and decorative effects first.

## 3. When adding features

Consider the Chromebook cost of every new environment, NPC, asset or mechanic:
reuse and instance geometry/materials, cull what is not visible, dispose of
resources on scene change, stagger NPC/AI updates, avoid per-frame work and DOM
churn, never block the main thread during speech recognition, loading or scene
transitions, and pause work when the tab is hidden.

## 4. How testing relates to the real device

The development PC (i7-6700K + GTX 1080) cannot reproduce the Chromebook
exactly. Know what each measurement means:

| Measurement | Transfers to the Chromebook? |
|---|---|
| Draw calls, triangles, texture sizes, JS heap, listener/timer leaks | **Yes.** Renderer-independent; compare directly against the budgets. |
| Long tasks, frame time on this PC | **No, only as a relative signal.** CPU throttling is not used: it does not reproduce the Chromebook's integrated GPU, and the machine-wide workflow rules it out. Compare before/after on the same PC instead. |
| FPS on the GTX 1080 | **No.** Far too optimistic for GPU-bound scenes. |
| FPS under SwiftShader (CPU rendering) | **No.** Usually too pessimistic. Earlier SwiftShader FPS notes in DESIGN_DECISIONS are not Chromebook numbers. |
| FPS on a real school Chromebook | **Yes. This is the only real FPS number.** |

Always label performance results as "desktop benchmark" (this PC) or "Chromebook measured"
(the real device, with the `chrome://gpu` renderer, scene and date noted).

## 5. Test tiers

Follow the machine-wide workflow (`~/.claude/testing/TESTING_WORKFLOW.md`); the
scripts and test map are in `AGENTS.md`.

- **Functional** (`npm run e2e`, `tests/e2e/`): new headless Chromium on the GPU,
  1366 × 768, DPR 1. Routine development and regression tests, including the
  draw-call and triangle budget checks.
- **Visual** (`npm run e2e:visual`, `tests/visual/`): the `zz-*-shots` evidence
  captures. Run when rendering, art, camera or layout changes.
- **Performance** (`npm run e2e:perf`, `tests/perf/`): frame times, long tasks,
  JS heap, draw calls and triangles for the most demanding scenes. FPS is a
  desktop benchmark; the budgets are the Chromebook guard.
- **SwiftShader** (`npm run e2e:compat`, `CB_SWIFTSHADER=1`): compatibility runs
  or a machine without a usable GPU. Not the default and never a Chromebook proxy.

Each run logs the WebGL renderer it actually got. Never assume GPU acceleration.

Soak tests (15–30 minutes of continuous play, checking for degradation) are
run before releases, not on every change.

## 6. Local test efficiency

- Run targeted tests while developing; the full suite after significant changes.
- One Playwright worker by default (two at most).
- Screenshots and traces only on failure. No video unless debugging.
- Close browsers, pages and dev servers after testing; check for orphaned
  Playwright Chromium processes (only under the `ms-playwright` install path,
  never the user's own Chrome).
