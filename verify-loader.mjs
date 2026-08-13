// Verify the loader's origin guards, on synthetic hosts.
//
// `?local=<url>` and `?env=local` name an origin, and the loader injects what
// they name as a module script. So it runs first-party. Two guards protect it:
// a dev host only, and a loopback or LocalCan host only. This script proves
// both, because a unit test cannot set location.hostname.
//
// Every request except the document is blocked, and the hosts do not exist, so
// nothing real loads and nothing here touches the live site.
//
//   node verify-loader.mjs
//
// It exits non-zero on any failure.

import pw from "playwright";
import { readFileSync } from "node:fs";
const { chromium } = pw;
const LOADER = readFileSync(new URL("./loader.js", import.meta.url), "utf8");
const cases = [
  ["https://guard.webflow.io/p?env=local&local=https://evil.example", "DEV + foreign origin", "local", "http://localhost:5500"],
  ["https://guard.webflow.io/p?dev=0&env=local&local=https://evil.example", "DEV + foreign + dev=0", "local", "http://localhost:5500"],
  ["https://guard.webflow.io/p?env=local&local=http://localhost:5500", "DEV + loopback (must work)", "local", "http://localhost:5500"],
  ["https://guard.webflow.io/p?env=local&local=https://x.localcan.dev", "DEV + localcan (must work)", "local", "https://x.localcan.dev"],
  ["https://guard.example.com/p?env=local&local=https://evil.example", "PROD + foreign origin", "live", "http://localhost:5500"],
  ["https://guard.example.com/p?dev=1&env=local&local=https://evil.example", "PROD + dev=1", "live", "http://localhost:5500"],
  ["https://guard.example.com/p?commit=abc123", "PROD + ?commit (must still work)", "live", "http://localhost:5500"],
];
const b = await chromium.launch();
let fails = 0;
for (const [url, label, wantEnv, wantBase] of cases) {
  const ctx = await b.newContext();
  await ctx.route("**/*", (r) => r.request().resourceType() === "document"
    ? r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html><head></head><body></body></html>" })
    : r.abort());
  const p = await ctx.newPage();
  const warns = [];
  p.on("console", (m) => warns.push(m.text()));
  await p.goto(url, { waitUntil: "load" });
  const r = await p.evaluate((src) => { try { eval(src); } catch (e) { return { err: String(e.message) }; }
    return { boot: window.el?.boot ?? null }; }, LOADER);
  const boot = r.boot || {};
  const leak = JSON.stringify(boot).includes("evil.example");
  const ok = boot.env === wantEnv && boot.localBase === wantBase && !leak;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  console.log(`        env=${boot.env}  localBase=${boot.localBase}  localSrc=${boot.localSrc}`);
  const w = warns.find((x) => x.includes("[el]"));
  if (w) console.log(`        ${w}`);
  await ctx.close();
}
await b.close();
console.log(`\n${fails === 0 ? "ALL PASS (7/7)" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
