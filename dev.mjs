import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";

const PORT = parseInt(process.env.PORT || "5500", 10);
const ROOT = resolve(".");

// Serves source ES modules directly. Deployed output is still compiled by npm run build.
// The loader (loader.js, referenced in Webflow) probes this server and injects
// http://localhost:${PORT}/bundle.js when it's up.

const MIME = {
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function serve(req, res) {
  const path = decodeURIComponent(req.url.split("?")[0]);
  const filePath = resolve(ROOT, path === "/" ? "bundle.js" : `.${path}`);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  readFile(filePath)
    .then((data) => {
      const ext = extname(path).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      });
      res.end(data);
    })
    .catch(() => {
      res.writeHead(404);
      res.end("Not found");
    });
}

createServer(serve).listen(PORT, () => {
  console.log(`Serving on http://localhost:${PORT}`);
});
