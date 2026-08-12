// Exec-Life loader.
//
// This is the only file that Webflow references. Add one tag in Project
// Settings, in Custom Code, in the Head section or the Footer section. Pin
// the tag to a commit SHA (Secure Hash Algorithm value):
//
//   <script src="https://cdn.jsdelivr.net/gh/spurwing-main/exec-life@<SHA>/loader.js"></script>
//
// Run `npm run tag` to show the exact tag for the current commit.
//
// Why a SHA and not @main:
//   A commit-pinned URL is immutable on jsDelivr, which caches it forever.
//   You never purge the cache and the content never goes stale. Release by
//   changing the SHA in the Webflow tag and publishing. Roll back by changing
//   it back. The pin lives in Webflow, not in this file: Webflow serves fresh
//   HTML on each request, jsDelivr caches this file.
//
// The loader reads its own commit from the <script src> attribute and loads
// `dist/bundle.js` from that same commit, so the two never drift apart.
//
// Resolution order. The loader checks these in order and uses the first match:
//   1. URL params      ?env=local | ?env=live | ?commit=<sha> | ?local=<url>
//                      ?dev (with no value) or ?dev=1 turns dev mode on and
//                      shows the panel. ?dev=0 forces dev mode off.
//                      ?on=anim or ?off=anim,faq sets feature flags for this
//                      pageview only.
//   2. Persisted dev   sessionStorage key el_env, and el_flags for feature
//                      toggles.
//   3. Auto-probe      On a dev host (localhost or *.webflow.io), or when dev
//                      mode is on: the loader checks if LocalCan is up. If
//                      LocalCan is up, the loader uses it. If not, the loader
//                      uses the CDN.
//   4. Default         Live. The loader uses the bundle from its own commit.
//
// A visitor on the production domain never triggers the auto-probe. The
// loader goes straight to the CDN.

(() => {
  "use strict";

  const root = document.documentElement;
  const params = new URLSearchParams(location.search);

  const DEFAULTS = {
    // Fallback values. The loader uses these only if it cannot parse its own
    // <script src> attribute, for example when the tag is loaded inline, or
    // from localhost during development. In the normal case, the loader reads
    // the owner, the project, and the commit from the Webflow tag URL. The
    // SHA in that URL is the pin.
    owner: "spurwing-main",
    project: "exec-life",
    commit: "main",
    // The LocalCan HTTPS tunnel address for `npm run dev`. Replace this with
    // your own tunnel URL. Plain http://localhost:5500 also works, but only
    // in Chrome. Safari and Firefox block a plain HTTP request from an HTTPS
    // Webflow page as mixed content.
    localBase: "http://localhost:5500",
    probeTimeout: 900, // Time, in milliseconds, to wait for LocalCan before the loader falls back to the CDN.
    unhideTimeout: 4000, // Time, in milliseconds, after which the loader shows content even if the bundle has not loaded.
  };

  // Two keys remain of four. An audit found three dead:
  //   el_dev_enabled : written, but devMode and showPanel never read it. Its
  //                    "Keep dev mode on this browser" checkbox did nothing.
  //   el_local       : read at localBase, never written.
  //   el_commit      : read at commit, never written.
  // `?local=` and `?commit=` remain as per-pageview URL overrides, which is
  // the only way the code ever used them.
  const KEYS = {
    env: "el_env",
    flags: "el_flags",
  };

  // -- feature flags ---------------------------------------------------------
  // One registry holds every switchable feature. It lives in the loader, not
  // the bundle, for two reasons: the loader runs first, so it can set the CSS
  // gate before the bundle runs or before a failed bundle has any effect; and
  // the dev panel can toggle a CSS-only feature with no JS module involved.
  //
  // Each feature has two gates:
  //   html[data-el-on~="<name>"]   CSS gate. Each embed must gate every rule
  //                                that APPLIES styles for the feature, not
  //                                only the rule that defines them. That is
  //                                what makes a feature switchable without
  //                                commenting out CSS. See the README.
  //   el.flags.enabled("<name>")   JS gate. bundle.js skips a module when its
  //                                flag is disabled.
  //
  // A feature with `default: false` ships dormant: live and open for review,
  // doing nothing until someone turns it on.
  const FEATURES = {
    nav: { label: "Nav", default: true },
    tabs: { label: "Tabs", default: true },
    carousels: { label: "Carousels", default: true },
    faq: { label: "FAQ", default: true },
    anim: { label: "Motion / reveals", default: true },
    video: { label: "Video facade", default: true },
    calc: { label: "Tax calculator", default: true },
    "insights-toc": { label: "Insights TOC", default: true },
    "insurer-sort": { label: "Insurer sorting", default: true },
    dialogs: { label: "Modal dialogs", default: true },
  };

  const el = (window.el = window.el || {});
  el.functions = el.functions || {};

  // -- storage helpers -------------------------------------------------------
  // sessionStorage, not localStorage. The environment override must survive
  // navigation between pages, which a query parameter does not, but it must
  // not outlive the tab. A sticky localStorage flag set weeks ago would
  // silently change which bundle a staging page runs, and that fault is
  // almost impossible to find. Session scope keeps the behaviour, drops the
  // risk.
  const store = {
    get(k) {
      try {
        return sessionStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        sessionStorage.setItem(k, v);
      } catch {}
    },
    del(k) {
      try {
        sessionStorage.removeItem(k);
      } catch {}
      // Clear the retired localStorage keys on a best-effort basis. This
      // clears old state from an earlier loader version the first time
      // anyone with that state clicks Reset.
      try {
        ["el_env", "el_dev_enabled", "el_local", "el_commit"].forEach((old) =>
          localStorage.removeItem(old)
        );
      } catch {}
    },
  };

  const param = (name) => {
    const v = params.get(name);
    return v && v.trim() ? v.trim() : null;
  };

  // Presence-style flag. `param()` returns null for an empty value, which is
  // correct for ?env=, ?commit= and ?local=, since each needs a real value.
  // That same behaviour made a bare `?dev` do nothing: empty read as null and
  // dev mode never switched on. This treats a valueless parameter as ON,
  // which is what most people type.
  //   ?dev, ?dev=1, ?dev=true, ?dev=on, ?dev=yes  gives true
  //   ?dev=0, ?dev=false, ?dev=off, ?dev=no       gives false, and forces OFF
  //   an absent or an unrecognized value          gives null, meaning no opinion
  const flag = (name) => {
    if (!params.has(name)) return null;
    const v = (params.get(name) || "").trim();
    if (!v) return true;
    if (/^(1|true|dev|on|yes)$/i.test(v)) return true;
    if (/^(0|false|off|no)$/i.test(v)) return false;
    return null;
  };

  // -- resolve config --------------------------------------------------------
  const isDevHost = /\.webflow\.io$/.test(location.hostname);

  // Null means no opinion, so it falls back to the host check. An explicit
  // ?dev=0 wins over isDevHost, which lets you force a staging page to behave
  // like production. An earlier version could not: `isDevHost ||`
  // short-circuited the check.
  const devFlag = flag("dev") ?? flag("mode");
  const devMode = devFlag === false ? false : devFlag === true || isDevHost;

  const persisted = (k) => (devMode ? store.get(k) : null);

  // Read owner, project and commit from this loader's own tag URL:
  //   https://cdn.jsdelivr.net/gh/<owner>/<project>@<commit>/loader.js
  // <commit> in the Webflow tag is the pin. Change it there to release.
  const self = (() => {
    try {
      const src = document.currentScript && document.currentScript.src;
      const m = src && src.match(/\/gh\/([^/]+)\/([^@/]+)@([^/]+)\/(?:.*\/)?loader\.js/);
      return m ? { owner: m[1], project: m[2], ref: m[3] } : null;
    } catch {
      return null;
    }
  })();

  const owner = self?.owner || DEFAULTS.owner;
  const project = self?.project || DEFAULTS.project;
  const commit = param("commit") || self?.ref || DEFAULTS.commit;
  const localBase = (param("local") || DEFAULTS.localBase).replace(/\/$/, "");

  // The env value is "local", "live", or "auto". "auto" means the loader
  // probes LocalCan and picks whichever source is up.
  const envOverride = param("env") || persisted(KEYS.env);
  let env = envOverride;
  if (env !== "local" && env !== "live") env = devMode ? "auto" : "live";

  // A persisted override must never be silently in effect. When session state
  // controls which bundle loads, the panel shows, so you can see and reset it.
  const hasOverride = !!(envOverride || param("commit") || param("local"));

  // -- resolve flags ---------------------------------------------------------
  // Precedence per feature: ?on= or ?off= URL parameter, then the persisted
  // value, then the registry default.
  //   ?off=anim,faq      turns the named features off for this pageview
  //   ?on=anim           turns the named feature on for this pageview
  // Persisted overrides use sessionStorage for the same reason as `env`.
  const flagOverrides = (() => {
    const out = {};
    const parse = (raw) =>
      (raw || "")
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);

    // The code applies the persisted value first, so that a URL parameter can override it.
    parse(store.get(KEYS.flags)).forEach((entry) => {
      const [name, value] = entry.split(":");
      if (name in FEATURES) out[name] = value !== "0";
    });
    parse(param("off")).forEach((name) => {
      if (name in FEATURES) out[name] = false;
    });
    parse(param("on")).forEach((name) => {
      if (name in FEATURES) out[name] = true;
    });
    return out;
  })();

  const flagState = Object.fromEntries(
    Object.entries(FEATURES).map(([name, def]) => [
      name,
      { on: name in flagOverrides ? flagOverrides[name] : def.default, overridden: name in flagOverrides, label: def.label },
    ])
  );

  el.flags = {
    all: flagState,
    // An unknown feature name defaults to enabled. This makes sure that a
    // module added after this loader ships is never silently dead.
    enabled: (name) => flagState[name]?.on ?? true,
    overridden: Object.keys(flagOverrides).length > 0,
  };

  // This sets the CSS gate. The code sets the gate synchronously, before the
  // bundle runs, and before paint when the loader tag is in the <head>
  // section. Every feature is off unless this attribute lists it. This
  // attribute stops an embed that hides content it should not hide.
  root.setAttribute(
    "data-el-on",
    Object.entries(flagState)
      .filter(([, s]) => s.on)
      .map(([name]) => name)
      .join(" ")
  );

  const cdnSrc = `https://cdn.jsdelivr.net/gh/${owner}/${project}@${commit}/dist/bundle.js`;
  const localSrc = `${localBase}/bundle.js`;

  el.boot = { owner, project, commit, env, localBase, cdnSrc, localSrc, devMode };

  // -- anti-FOUC safety --------------------------------------------------
  // FOUC means Flash Of Unstyled Content. bundle.js adds the `el-ready` class
  // itself when it starts. This timer only makes sure that content is never
  // trapped hidden if the bundle fails to load. Gate the CSS on `.el-ready`.
  const unhide = () => root.classList.add("el-ready");
  const unhideTimer = setTimeout(unhide, DEFAULTS.unhideTimeout);

  // -- probe + inject --------------------------------------------------------
  probe().then((source) => {
    inject(source);
    // An explicit ?dev value asks for the panel outright, even when LocalCan
    // is down and the loader fell back to the CDN. The panel text itself,
    // "live" or "local unreachable", is the diagnostic. An explicit ?dev=0
    // suppresses the panel everywhere, even over an active override. This is
    // the documented escape hatch.
    const showPanel =
      devFlag === false
        ? false
        : devFlag === true || hasOverride || el.flags.overridden || (isDevHost && source.localUp === true);
    if (showPanel) mountPanel(source);
  });

  // Choose the source. Probe LocalCan when the check needs it.
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
      if (devMode) console.log("[el] loaded", source.kind, source.url);
    };
    s.onerror = () => {
      console.error("[el] bundle failed:", source.url);
      unhide();
      // This is the final try. If the local load fails at runtime, try the CDN once.
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
      [data-el-persist]{display:flex;align-items:center;justify-content:space-between;gap:8px;
        font-size:11px;color:#c4c8d4}
      [data-el-reset]{appearance:none;border:1px solid rgba(255,255,255,.14);border-radius:6px;
        background:rgba(255,255,255,.06);color:#e8eaf0;font:inherit;padding:3px 8px;cursor:pointer}
      [data-el-reset]:hover{background:rgba(255,255,255,.12)}
      [data-el-scope]{color:#9aa0b0;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      [data-el-flags]{border-top:1px solid rgba(255,255,255,.10);margin:10px -12px 9px;padding:9px 12px 0}
      [data-el-flags-title]{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#9aa0b0;margin-bottom:6px}
      [data-el-flag]{display:flex;align-items:center;gap:7px;padding:3px 0;cursor:pointer;font-size:11px;color:#c4c8d4}
      [data-el-flag]:hover{color:#fff}
      [data-el-sw]{position:relative;flex:none;width:26px;height:15px;border-radius:99px;
        background:rgba(255,255,255,.14);transition:background .14s}
      [data-el-sw]::after{content:"";position:absolute;top:2px;left:2px;width:11px;height:11px;border-radius:50%;
        background:#e8eaf0;transition:transform .14s}
      [data-el-flag][aria-pressed="true"] [data-el-sw]{background:#37d67a}
      [data-el-flag][aria-pressed="true"] [data-el-sw]::after{transform:translateX(11px)}
      [data-el-flag-name]{flex:1}
      [data-el-flag][data-overridden="true"] [data-el-flag-name]::after{content:"•";color:#f5a623;margin-left:5px;font-weight:700}
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
        <div data-el-flags>
          <div data-el-flags-title>Modules</div>
          ${Object.entries(el.flags.all)
            .map(
              ([name, st]) => `
            <div data-el-flag data-flag="${name}" role="button" tabindex="0"
                 aria-pressed="${st.on}" data-overridden="${st.overridden}"
                 title="${st.overridden ? "overridden for this tab" : "registry default"}">
              <span data-el-sw></span>
              <span data-el-flag-name>${st.label}</span>
            </div>`
            )
            .join("")}
        </div>
        <div data-el-persist>
          <button data-el-reset type="button">Reset overrides</button>
          <span data-el-scope>${
            [envOverride ? "env" : null, el.flags.overridden ? "flags" : null].filter(Boolean).join(" + ") ||
            "no override"
          }${envOverride || el.flags.overridden ? " · this tab" : ""}</span>
        </div>
      </div>
    `;
    root.appendChild(panel);

    // Switch the environment. Persist the choice for this tab, then reload.
    panel.querySelectorAll("[data-env]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = btn.getAttribute("data-env");
        if (next === "auto") store.del(KEYS.env);
        else store.set(KEYS.env, next);
        const url = new URL(location.href);
        url.searchParams.delete("env");
        location.href = url.toString();
      });
    });

    // Toggle a module. Persist the choice for this tab, then reload. The
    // reload is deliberate. The code does not call the module live, because
    // about half of these features hide content with CSS before the JS
    // runs. Only a fresh pageview shows the real result.
    const writeFlags = () => {
      const entries = Object.entries(el.flags.all)
        .filter(([, st]) => st.overridden)
        .map(([name, st]) => `${name}:${st.on ? "1" : "0"}`);
      if (entries.length) store.set(KEYS.flags, entries.join(","));
      else store.del(KEYS.flags);
    };

    const toggleFlag = (row) => {
      const name = row.getAttribute("data-flag");
      const st = el.flags.all[name];
      if (!st) return;
      const next = !st.on;
      // If the new value matches the registry default, remove the override
      // for the feature. Do not pin the same value as an override.
      st.overridden = next !== FEATURES[name].default;
      st.on = next;
      writeFlags();
      const url = new URL(location.href);
      ["on", "off"].forEach((q) => url.searchParams.delete(q));
      location.href = url.toString();
    };

    panel.querySelectorAll("[data-el-flag]").forEach((row) => {
      row.addEventListener("click", () => toggleFlag(row));
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleFlag(row);
        }
      });
    });

    // Reset. Drop the session override, clear any stale localStorage keys
    // left by an older loader, then reload with a clean state.
    panel.querySelector("[data-el-reset]").addEventListener("click", () => {
      store.del(KEYS.env);
      store.del(KEYS.flags);
      const url = new URL(location.href);
      ["env", "commit", "local", "dev", "mode", "on", "off"].forEach((p) => url.searchParams.delete(p));
      location.href = url.toString();
    });

    // hide for this pageview
    panel.querySelector("[data-el-x]").addEventListener("click", () => panel.remove());
  }
})();
