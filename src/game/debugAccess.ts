/** Explicit opt-in; preview/production students never receive debug controls. */
export const debugEnabled = import.meta.env.DEV ||
  (typeof location !== "undefined" && new URLSearchParams(location.search).get("debug") === "1");
