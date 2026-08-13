/**
 * Loader origin guards.
 *
 * `?local=<url>` and `?env=local` name an origin, and the loader injects what
 * they name as a module script. So it runs first-party. A crafted link on the
 * production domain used to run another site's JavaScript on ours.
 *
 * Two guards protect it, and each one covers a hole the other leaves:
 *   1. Read both parameters on a dev host only. A query parameter can never be
 *      the gate, because an attacker writes the whole query string.
 *   2. Allow a loopback or a LocalCan host only, so a dev host cannot become a
 *      proxy for any origin either.
 *
 * A unit test cannot set `location.hostname`, so each case builds its own JSDOM
 * with the host in the URL. The loader is an IIFE that reads `location` and
 * `document` when it runs, which is why it has to run inside that window.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";

// The jsdom environment gives `import.meta.url` an http scheme, so resolve from
// the project root instead. Vitest runs with the root as the working directory.
const LOADER_PATH = resolve(process.cwd(), "loader.js");
if (!existsSync(LOADER_PATH)) {
  throw new Error(`Cannot find loader.js at ${LOADER_PATH}. Run the tests from the project root.`);
}
const LOADER = readFileSync(LOADER_PATH, "utf8");
const FOREIGN = "https://evil.example";

// Run the loader in a window at `url` and give back what it resolved.
function boot(url) {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url,
    runScripts: "outside-only",
  });
  const warnings = [];
  dom.window.console.warn = (...a) => warnings.push(a.join(" "));
  // The loader probes LocalCan with fetch. Never let a test reach the network.
  dom.window.fetch = () => Promise.reject(new Error("blocked in test"));
  dom.window.eval(LOADER);
  return { ...dom.window.el.boot, warnings };
}

describe("loader origin guards", () => {
  describe("a dev host", () => {
    it("refuses a foreign ?local= and falls back to the default base", () => {
      const b = boot(`https://staging.webflow.io/p?env=local&local=${FOREIGN}`);
      expect(b.localBase).not.toContain("evil.example");
      expect(b.localSrc).not.toContain("evil.example");
      expect(b.localBase).toBe("http://localhost:5500");
      expect(b.warnings.join(" ")).toContain("?local=");
    });

    it("still refuses it when ?dev=0 is present", () => {
      // ?dev=0 is the flag every QA run appends. It must not act as a gate,
      // in either direction.
      const b = boot(`https://staging.webflow.io/p?dev=0&env=local&local=${FOREIGN}`);
      expect(b.localBase).not.toContain("evil.example");
    });

    it("keeps a loopback base, so local development is unchanged", () => {
      const b = boot("https://staging.webflow.io/p?env=local&local=http://localhost:5500");
      expect(b.localBase).toBe("http://localhost:5500");
      expect(b.env).toBe("local");
    });

    it("keeps a LocalCan base", () => {
      const b = boot("https://staging.webflow.io/p?env=local&local=https://x.localcan.dev");
      expect(b.localBase).toBe("https://x.localcan.dev");
      expect(b.env).toBe("local");
    });
  });

  describe("a production host", () => {
    it("forces env to live and refuses ?local=", () => {
      const b = boot(`https://example.com/p?env=local&local=${FOREIGN}`);
      expect(b.env).toBe("live");
      expect(b.localBase).not.toContain("evil.example");
      expect(b.warnings.join(" ")).toContain("dev host");
    });

    it("still refuses it with ?dev=1, because a parameter cannot open this", () => {
      const b = boot(`https://example.com/p?dev=1&env=local&local=${FOREIGN}`);
      expect(b.env).toBe("live");
      expect(b.localBase).not.toContain("evil.example");
    });

    it("keeps ?commit= working, because it names a commit of this repository", () => {
      const b = boot("https://example.com/p?commit=abc123");
      expect(b.commit).toBe("abc123");
      expect(b.cdnSrc).toContain("abc123");
      expect(b.env).toBe("live");
    });

    it("never puts a foreign origin in the script it chooses", () => {
      const b = boot(`https://example.com/p?env=local&local=${FOREIGN}`);
      expect(JSON.stringify(b)).not.toContain("evil.example");
    });
  });
});
