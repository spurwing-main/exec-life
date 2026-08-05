import { context } from "esbuild";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const PORT = parseInt(process.env.PORT || "5500", 10);

// This is the local dev server. It serves a bundled build of bundle.js at
// http://localhost:${PORT}/bundle.js. This build resolves dependencies such
// as embla, and it has an inline source map. This is the same entry point
// that the production loader injects. The server rebuilds the bundle on
// every request. The esbuild rebuild is incremental and takes under one
// millisecond, so a page refresh always runs your latest source code.
//
// The Webflow loader, in loader.js, probes this port and switches to it when
// the port is up. This same-machine setup needs no LocalCan tunnel in
// Chrome. Safari and Firefox block a plain http://localhost request from an
// https page as mixed content. Use Chrome for work on the same machine. Use
// a LocalCan HTTPS tunnel for work across different browsers.
//
// The server also serves loader.js itself, straight from disk and not
// bundled. This has a clear limit. The live site's loader is pinned to a
// commit SHA in the Webflow tag. A loader change, such as a new feature flag
// or a dev-panel change, does not reach staging until you change the tag to
// a new commit and publish the page.
//
// A bundle change is different. It reaches staging through this dev server,
// or through a redeploy of the dist folder. Serving loader.js here lets you
// test loader changes on your own machine first, against /panel.html or
// against your own page.

const ctx = await context({
  entryPoints: ["bundle.js"],
  bundle: true,
  format: "esm",
  write: false, // Keep the build output in memory. The server serves the output directly from memory.
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
      // Show build errors in the browser console instead of a dead script.
      const msg = (err && err.message) || String(err);
      console.error("[dev] build failed:\n" + msg);
      res.writeHead(200, { "Content-Type": "application/javascript" });
      res.end(`console.error(${JSON.stringify("[el] dev build failed — see terminal:\n" + msg)});`);
    }
    return;
  }

  // This serves loader.js straight from disk. It lets you test changes to
  // the loader and the dev panel on your own machine. The live tag still
  // needs a new commit tag and a publish action before it picks up those
  // changes.
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

  // A plain test page that runs the loader and the dev panel without Webflow.
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
