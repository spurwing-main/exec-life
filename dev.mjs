import { context } from "esbuild";
import { createServer } from "node:http";

const PORT = parseInt(process.env.PORT || "5500", 10);

// Local dev server. Serves a *bundled* build of bundle.js (deps like embla
// resolved, inline sourcemap) at http://localhost:${PORT}/bundle.js — the same
// entry the production loader injects. It rebuilds on every request (esbuild
// incremental, sub-ms), so a page refresh always runs your latest source.
//
// The Webflow loader (loader.js) probes this port and switches to it when it's
// up — no LocalCan/tunnel required for same-machine dev in Chrome. (Safari and
// Firefox block http://localhost from an https page as mixed content; use Chrome
// for local, or a LocalCan HTTPS tunnel for cross-browser.)

const ctx = await context({
  entryPoints: ["bundle.js"],
  bundle: true,
  format: "esm",
  write: false, // keep output in memory; we serve it directly
  sourcemap: "inline",
});

async function buildBundle() {
  const result = await ctx.rebuild();
  return result.outputFiles[0].text;
}

createServer(async (req, res) => {
  const path = req.url.split("?")[0];
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Methods": "GET, OPTIONS" });
    res.end();
    return;
  }

  if (path === "/" || path === "/bundle.js") {
    try {
      const code = await buildBundle();
      res.writeHead(200, { "Content-Type": "application/javascript" });
      res.end(code);
    } catch (err) {
      // Surface build errors in the browser console instead of a dead script.
      const msg = (err && err.message) || String(err);
      console.error("[dev] build failed:\n" + msg);
      res.writeHead(200, { "Content-Type": "application/javascript" });
      res.end(`console.error(${JSON.stringify("[el] dev build failed — see terminal:\n" + msg)});`);
    }
    return;
  }

  res.writeHead(404);
  res.end("Not found");
}).listen(PORT, () => {
  console.log(`Serving bundled dev build on http://localhost:${PORT}/bundle.js`);
});
