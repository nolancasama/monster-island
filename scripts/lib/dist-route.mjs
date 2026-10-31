import fs from "node:fs";
import path from "node:path";

/** Serve a built app without a listener (works in the no-port sandbox). */
export async function routeDist(context, directory, origin = "http://mi.local") {
  const root = fs.realpathSync(directory);
  const types = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".json":"application/json",
    ".png":"image/png", ".svg":"image/svg+xml", ".jpg":"image/jpeg", ".woff2":"font/woff2", ".mp3":"audio/mpeg", ".wav":"audio/wav" };
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    try {
      const file = fs.realpathSync(path.resolve(root, "." + decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)));
      if (!file.startsWith(root + path.sep)) return route.fulfill({ status:403, body:"Forbidden" });
      return route.fulfill({ contentType:types[path.extname(file)] ?? "application/octet-stream", body:fs.readFileSync(file) });
    } catch { return route.fulfill({ status:404, body:"Not found" }); }
  });
  return origin;
}
