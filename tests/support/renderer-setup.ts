import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type FullConfig } from "@playwright/test";

/** Probe the same browser/channel/launch options as the selected test profile. */
export default async function rendererSetup(config: FullConfig) {
  const { use } = config.projects[0];
  console.log(`[Playwright workers] ${config.workers}`);
  const browser = await chromium.launch({ ...use.launchOptions, channel: use.channel, headless: true });
  try {
    const page = await browser.newPage({ viewport: use.viewport, deviceScaleFactor: use.deviceScaleFactor });
    const renderer = await page.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl");
      const ext = gl?.getExtension("WEBGL_debug_renderer_info");
      return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "not available";
    });
    process.env.CB_WEBGL_RENDERER = renderer;
    console.log(`[WebGL UNMASKED_RENDERER] ${renderer}`);
    await mkdir(resolve(".tmp"), { recursive: true });
    await writeFile(resolve(".tmp/renderer.txt"), renderer + "\n");
    if (process.env.CB_SWIFTSHADER !== "1" && /swiftshader/i.test(renderer)) {
      console.warn("WARNING: GPU profile received SwiftShader. Functional tests continue; do not quote FPS from this run.");
    }
  } finally {
    await browser.close();
  }
}
