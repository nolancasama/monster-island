import type { FullConfig } from "@playwright/test";
import { checkServerIdentity } from "./server-identity.ts";
import rendererSetup from "./renderer-setup.ts";

export default async function globalSetup(config: FullConfig) {
  await checkServerIdentity(config.projects[0].use.baseURL!);
  await rendererSetup(config);
}
