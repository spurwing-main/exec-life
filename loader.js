// Exec-Life loader.
//
// This is the ONLY file Webflow references. Put one tag in Project Settings →
// Custom Code → Head (or Footer):
//
//   <script src="https://cdn.jsdelivr.net/gh/spurwing-main/exec-life@main/loader.js"></script>
//
// The loader decides where to load the site bundle (`dist/bundle.js`) from,
// injects it, and — in dev — shows a small floating control panel. All logic
// lives here in the repo, not pasted into Webflow.
//
// Resolution order (first match wins):
//   1. URL params      ?env=local | ?env=live | ?commit=<sha> | ?local=<url> | ?dev=1 | ?dev=0
//   2. Persisted dev   localStorage el_dev_enabled === "true" (+ el_env / el_local / el_commit)
//   3. Auto-probe      on dev hosts (localhost / *.webflow.io) or when dev is on:
//                      quietly check if LocalCan is up and switch to it, else CDN.
//   4. Default         live → pinned CDN bundle.
//
// Real visitors on the production domain never probe and go straight to the CDN.

(() => {
  "use strict";

  const root = document.documentElement;
  const params = new URLSearchParams(location.search);

  const DEFAULTS = {
    owner: "spurwing-main",
    project: "exec-life",
    commit: "main", // pin to a SHA for cache-stable prod, or leave "main"
    // Your LocalCan HTTPS tunnel for `npm run dev`. Swap for your real tunnel URL.
    // Plain http://localhost:5500 also works, but only in Chrome (mixed content
    // blocks http from an https Webflow page in Safari/Firefox).
    localBase: "http://localhost:5500",
    probeTimeout: 900, // ms to wait for LocalCan before falling back to CDN
    unhideTimeout: 4000, // ms safety net so content never stays hidden
  };

  const KEYS = {
    devEnabled: "el_dev_enabled",
    env: "el_env",
    local: "el_local",
    commit: "el_commit",
  };

  const el = (window.el = window.el || {});
  el.functions = el.functions || {};

  // -- storage helpers -------------------------------------------------------
  const store = {
    get(k) {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, v);
      } catch {}
    },
    del(k) {
      try {
        localStorage.removeItem(k);
      } catch {}
    },
  };

  const param = (name) => {
    const v = params.get(name);
    return v && v.trim() ? v.trim() : null;
  };

  // -- resolve config --------------------------------------------------------
  const devEnabled = store.get(KEYS.devEnabled) === "true";
  const isDevHost = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || /\.webflow\.io$/.test(location.hostname);

  const devParam = param("dev") || param("mode");
  let devMode;
  if (devParam) devMode = /^(1|true|dev|on)$/i.test(devParam);
  else devMode = devEnabled || isDevHost || Boolean(param("env") || param("local") || param("commit"));

  const persisted = (k) => (devEnabled ? store.get(k) : null);

  const owner = DEFAULTS.owner;
  const project = DEFAULTS.project;
  const commit = param("commit") || persisted(KEYS.commit) || DEFAULTS.commit;
  const localBase = (param("local") || persisted(KEYS.local) || DEFAULTS.localBase).replace(/\/$/, "");

  // env: "local" | "live" | "auto"  (auto = probe LocalCan, pick whatever is up)
  let env = param("env") || persisted(KEYS.env);
  if (env !== "local" && env !== "live") env = devMode ? "auto" : "live";

  const cdnSrc = `https://cdn.jsdelivr.net/gh/${owner}/${project}@${commit}/dist/bundle.js`;
  const localSrc = `${localBase}/bundle.js`;

  el.boot = { owner, project, commit, env, localBase, cdnSrc, localSrc, devMode };

  // -- anti-FOUC safety ------------------------------------------------------
  // bundle.js adds `el-ready` itself on boot; this only guarantees content is
  // never trapped hidden if the bundle fails to load. Gate CSS on `.el-ready`.
  const unhide = () => root.classList.add("el-ready");
  const unhideTimer = setTimeout(unhide, DEFAULTS.unhideTimeout);

  // -- probe + inject --------------------------------------------------------
  probe().then((source) => {
    inject(source);
    if (devMode) mountPanel(source);
  });

  // Decide the source, probing LocalCan when needed.
  async function probe() {
    if (env === "live") return { url: cdnSrc, kind: "live", localUp: null };
    if (env === "local") {
      const up = await isLocalUp();
      if (up) return { url: localSrc, kind: "local", localUp: true };
      console.warn("[el] LocalCan not reachable — falling back to CDN:", localSrc);
      return { url: cdnSrc, kind: "live", localUp: false };
    }
    // auto
    const up = await isLocalUp();
    return up
      ? { url: localSrc, kind: "local", localUp: true }
      : { url: cdnSrc, kind: "live", localUp: false };
  }

  function isLocalUp() {
    return new Promise((resolve) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => {
        ctrl.abort();
        resolve(false);
      }, DEFAULTS.probeTimeout);
      fetch(localSrc, { method: "GET", mode: "cors", cache: "no-store", signal: ctrl.signal })
        .then((r) => {
          clearTimeout(t);
          resolve(r.ok);
        })
        .catch(() => {
          clearTimeout(t);
          resolve(false);
        });
    });
  }

  function inject(source) {
    const s = document.createElement("script");
    s.type = "module";
    s.src = source.url;
    s.onload = () => {
      clearTimeout(unhideTimer);
      console.log("[el] loaded", source.kind, source.url);
    };
    s.onerror = () => {
      console.error("[el] bundle failed:", source.url);
      unhide();
      // Last-ditch: if a local load failed at runtime, try the CDN once.
      if (source.kind === "local") {
        const fb = document.createElement("script");
        fb.type = "module";
        fb.src = cdnSrc;
        document.head.appendChild(fb);
      }
    };
    document.head.appendChild(s);
  }

  // -- dev control panel -----------------------------------------------------
  function mountPanel(source) {
    if (document.querySelector("[data-el-panel]")) return;

    const style = document.createElement("style");
    style.textContent = `
      [data-el-panel]{position:fixed;left:16px;bottom:16px;z-index:2147483647;
        width:232px;font:500 12px/1.4 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
        color:#e8eaf0;background:rgba(18,20,28,.82);border:1px solid rgba(255,255,255,.10);
        border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.35);backdrop-filter:blur(14px);
        -webkit-backdrop-filter:blur(14px);overflow:hidden;user-select:none}
      [data-el-panel] *{box-sizing:border-box}
      [data-el-head]{display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:default}
      [data-el-dot]{width:9px;height:9px;border-radius:50%;flex:none;box-shadow:0 0 0 3px rgba(255,255,255,.06)}
      [data-el-dot][data-s="local"]{background:#37d67a}
      [data-el-dot][data-s="live"]{background:#4c8dff}
      [data-el-dot][data-s="down"]{background:#f5a623}
      [data-el-title]{font-weight:700;letter-spacing:.02em;flex:1}
      [data-el-x]{cursor:pointer;opacity:.5;font-size:15px;line-height:1;padding:2px 4px;border-radius:6px}
      [data-el-x]:hover{opacity:1;background:rgba(255,255,255,.08)}
      [data-el-body]{padding:0 12px 12px}
      [data-el-seg]{display:flex;background:rgba(255,255,255,.06);border-radius:9px;padding:3px;margin-bottom:9px}
      [data-el-seg] button{flex:1;border:0;background:transparent;color:#c4c8d4;font:inherit;font-weight:600;
        padding:6px 0;border-radius:7px;cursor:pointer;transition:.12s}
      [data-el-seg] button[aria-pressed="true"]{background:rgba(255,255,255,.14);color:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25)}
      [data-el-meta]{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;margin-bottom:10px;
        font-size:11px;color:#9aa0b0}
      [data-el-meta] b{color:#e8eaf0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      [data-el-persist]{display:flex;align-items:center;gap:7px;cursor:pointer;font-size:11px;color:#c4c8d4}
      [data-el-persist] input{accent-color:#4c8dff}
    `;
    document.head.appendChild(style);

    const statusState = source.kind === "local" ? "local" : source.localUp === false ? "down" : "live";
    const statusLabel =
      source.kind === "local" ? "LocalCan · connected" : source.localUp === false ? "LocalCan down · on CDN" : "CDN · live build";
    const shortCommit = commit.length > 10 ? commit.slice(0, 10) : commit;

    const panel = document.createElement("div");
    panel.setAttribute("data-el-panel", "");
    panel.innerHTML = `
      <div data-el-head>
        <span data-el-dot data-s="${statusState}"></span>
        <span data-el-title>Exec-Life JS</span>
        <span data-el-x title="Hide">×</span>
      </div>
      <div data-el-body>
        <div data-el-seg>
          <button data-env="local" aria-pressed="${env === "local"}">Local</button>
          <button data-env="auto"  aria-pressed="${env === "auto"}">Auto</button>
          <button data-env="live"  aria-pressed="${env === "live"}">Live</button>
        </div>
        <div data-el-meta>
          <span>status</span><b>${statusLabel}</b>
          <span>source</span><b title="${source.url}">${source.kind === "local" ? localBase : "jsDelivr"}</b>
          <span>commit</span><b>${shortCommit}</b>
        </div>
        <label data-el-persist>
          <input type="checkbox" ${devEnabled ? "checked" : ""}/> Keep dev mode on this browser
        </label>
      </div>
    `;
    root.appendChild(panel);

    // switch env → persist + reload
    panel.querySelectorAll("[data-env]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = btn.getAttribute("data-env");
        store.set(KEYS.devEnabled, "true"); // switching implies dev
        if (next === "auto") store.del(KEYS.env);
        else store.set(KEYS.env, next);
        const url = new URL(location.href);
        url.searchParams.delete("env");
        location.href = url.toString();
      });
    });

    // persist toggle
    panel.querySelector("[data-el-persist] input").addEventListener("change", (e) => {
      if (e.target.checked) {
        store.set(KEYS.devEnabled, "true");
      } else {
        store.del(KEYS.devEnabled);
        store.del(KEYS.env);
        store.del(KEYS.local);
        store.del(KEYS.commit);
      }
    });

    // hide for this pageview
    panel.querySelector("[data-el-x]").addEventListener("click", () => panel.remove());
  }
})();
