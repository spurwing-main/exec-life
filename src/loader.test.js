import { afterEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const LOADER = readFileSync("loader.js", "utf8");
const loaderSource = "https://cdn.jsdelivr.net/gh/spurwing-main/exec-life@1234567890abcdef/loader.js";
const cdnSource = loaderSource.replace("/loader.js", "/dist/bundle.js");
const windows = [];

afterEach(() => { windows.splice(0).forEach((window) => window.close()); });

async function boot(url, { stored, localUp = true, defaultsBase } = {}) {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url, runScripts: "outside-only",
  });
  const window = dom.window;
  windows.push(window);
  window.console = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const fetchMock = vi.fn().mockResolvedValue({ ok: localUp });
  window.fetch = fetchMock;
  Object.defineProperty(window.document, "currentScript", { value: { src: loaderSource } });
  if (stored) window.sessionStorage.setItem("el_env", stored);
  const source = defaultsBase ? LOADER.replace('localBase: "http://localhost:5500"', `localBase: ${JSON.stringify(defaultsBase)}`) : LOADER;
  window.eval(source);
  for (let step = 0; step < 8; step += 1) await Promise.resolve();
  return {
    window, fetchMock, config: window.el.boot,
    scripts: () => [...window.document.querySelectorAll('script[type="module"]')],
  };
}

describe("loader source selection", () => {
  it.each(["example.com", "staging.webflow.io"])("ignores every commit query on %s", async (host) => {
    for (const ref of ["abcdef1234567", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "../../other/repo@main", "main/../../evil", "refs/heads/fork"]) {
      const result = await boot(`https://${host}/?dev=1&commit=${encodeURIComponent(ref)}`);
      expect(result.config.commit).toBe("1234567890abcdef");
      expect(result.scripts().map((script) => script.src)).toEqual([cdnSource]);
      expect(result.fetchMock).not.toHaveBeenCalled();
    }
  });

  it.each(["", "?env=auto", "?env=live", "?dev=1", "?mode=dev&env=auto"])(
    "never probes automatically on staging: %s", async (query) => {
      const result = await boot(`https://staging.webflow.io/${query}`);
      expect(result.fetchMock).not.toHaveBeenCalled();
      expect(result.scripts().map((script) => script.src)).toEqual([cdnSource]);
    }
  );

  it.each(["?dev=1&env=local", "?mode=dev&env=local", "?env=local&local=http://localhost:5500"])(
    "never probes on production despite URL and session Local: %s", async (query) => {
      const result = await boot(`https://example.com/${query}`, { stored: "local" });
      expect(result.fetchMock).not.toHaveBeenCalled();
      expect(result.config.env).toBe("live");
      expect(result.scripts().map((script) => script.src)).toEqual([cdnSource]);
    }
  );

  it.each(["?env=local", "?dev=0&env=local", ""])("probes after explicit URL/session Local: %s", async (query) => {
    const result = await boot(`https://staging.webflow.io/${query}`, { stored: "local" });
    expect(result.fetchMock).toHaveBeenCalledOnce();
    expect(result.scripts()[0].src).toBe("http://localhost:5500/bundle.js");
  });

  it.each(["https://evil.example", "http://localhost.attacker.test"])("rejects an outside local host: %s", async (base) => {
    const result = await boot(`https://staging.webflow.io/?env=local&local=${encodeURIComponent(base)}`);
    expect(result.config.localBase).toBe("http://localhost:5500");
    expect(result.scripts()[0].src).toBe("http://localhost:5500/bundle.js");
  });

  it.each(["http://localhost:5501", "http://127.0.0.1:5501", "http://[::1]:5501"])(
    "preserves the existing allowed local base: %s", async (base) => {
      const result = await boot(`https://staging.webflow.io/?env=local&local=${encodeURIComponent(base)}`);
      expect(result.scripts()[0].src).toBe(`${base}/bundle.js`);
    }
  );

  it.each(["https://x.localcan.dev", "javascript://localhost/evil", "ftp://localhost", "http://user:pass@localhost:5500", "http://localhost:5500/?query=1", "http://localhost:5500/#fragment", "http://localhost:5500?", "http://localhost:5500#", "//localhost:5500", "/local"])(
    "does not trust provider wildcards or invalid bases: %s", async (base) => {
      const result = await boot(`https://staging.webflow.io/?env=local&local=${encodeURIComponent(base)}`);
      expect(result.scripts()[0].src).toBe("http://localhost:5500/bundle.js");
    }
  );

  it("keeps an explicitly configured HTTPS tunnel", async () => {
    const base = "https://trusted.localcan.dev";
    const result = await boot(`https://staging.webflow.io/?env=local&local=${base}/dev`, { defaultsBase: base });
    expect(result.fetchMock).toHaveBeenCalledWith(`${base}/dev/bundle.js`, expect.any(Object));
    expect(result.scripts()[0].src).toBe(`${base}/dev/bundle.js`);
  });

  it.each(["https://other.localcan.dev", "https://trusted.localcan.dev.attacker.test", "https://trusted.localcan.dev:8443"])(
    "requires the exact configured tunnel origin: %s", async (base) => {
      const result = await boot(`https://staging.webflow.io/?env=local&local=${encodeURIComponent(base)}`, { defaultsBase: "https://trusted.localcan.dev" });
      expect(result.scripts()[0].src).toBe("https://trusted.localcan.dev/bundle.js");
    }
  );

  it.each(["javascript://localhost/evil", "https://trusted.localcan.dev?", "https://trusted.localcan.dev#"])("uses CDN when the configured base is invalid: %s", async (defaultsBase) => {
    const result = await boot("https://staging.webflow.io/?env=local", { defaultsBase });
    expect(result.fetchMock).not.toHaveBeenCalled();
    expect(result.scripts()[0].src).toBe(cdnSource);
  });

  it("falls back to the pin when the explicit local probe fails", async () => {
    const result = await boot("https://staging.webflow.io/?env=local", { localUp: false });
    expect(result.scripts().map((script) => script.src)).toEqual([cdnSource]);
    expect(result.window.document.querySelector("[data-el-panel]").textContent).toContain("LocalCan down");
  });

  it("tries the CDN once after a local module error and reveals content", async () => {
    const result = await boot("https://staging.webflow.io/?env=local");
    result.scripts()[0].onerror();
    expect(result.scripts().map((script) => script.src)).toEqual(["http://localhost:5500/bundle.js", cdnSource]);
    expect(result.scripts()[1].onerror).toBeNull();
    expect(result.window.document.documentElement.classList.contains("el-ready")).toBe(true);
  });

  it("keeps feature flags and the panel available without probing", async () => {
    const result = await boot("https://staging.webflow.io/?dev=1&off=anim,faq");
    expect(result.fetchMock).not.toHaveBeenCalled();
    expect(result.window.el.flags.enabled("anim")).toBe(false);
    expect(result.window.el.flags.enabled("faq")).toBe(false);
    expect(result.window.el.flags.enabled("nav")).toBe(true);
    expect(result.window.document.querySelector("[data-el-panel]")).not.toBeNull();
    expect(result.window.document.documentElement.getAttribute("data-el-on").split(" ")).not.toContain("anim");
  });
});
