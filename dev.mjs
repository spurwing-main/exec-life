import { context } from "esbuild";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

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
//
// It ALSO serves loader.js itself, from disk, unbundled. Note what that does and
// does not buy you: the live site's loader is pinned to a commit SHA in the
// Webflow tag, so a loader change (a new feature flag, a dev-panel tweak) does
// NOT reach staging until you re-tag and publish — unlike a bundle change, which
// rides this dev server or a redeploy of dist/. Serving it here lets you test
// loader changes locally first, against /panel.html or your own page.

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

  // loader.js straight off disk. Lets you iterate on the loader and the dev
  // panel locally; the live tag still needs a re-tag + publish to pick it up.
  if (path === "/loader.js") {
    try {
      const code = await readFile(new URL("./loader.js", import.meta.url), "utf8");
      res.writeHead(200, { "Content-Type": "application/javascript" });
      res.end(code);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/javascript" });
      res.end(`console.error(${JSON.stringify("[el] loader.js unreadable: " + err.message)});`);
    }
    return;
  }

  // A bare harness page for exercising the loader + dev panel without Webflow.
  if (path === "/panel.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><meta charset="utf-8"><title>loader + dev panel</title>
<style>body{font:14px/1.5 system-ui;padding:2rem;color:#222}code{background:#eef;padding:1px 4px;border-radius:3px}</style>
<h1>Loader + dev panel harness</h1>
<p>Loaded with <code>?dev</code>. The panel should be bottom-left, with a Modules
list you can toggle. Try <code>?dev&amp;off=nav,faq</code> or <code>?dev&amp;on=anim</code>.</p>
<script src="/loader.js"></script>`);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
}).listen(PORT, () => {
  console.log(`Serving bundled dev build on http://localhost:${PORT}/bundle.js`);
});
