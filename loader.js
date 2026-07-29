// Exec-Life loader.
//
// This is the ONLY file Webflow references. Put one tag in Project Settings →
// Custom Code → Head (or Footer), PINNED TO A COMMIT SHA:
//
//   <script src="https://cdn.jsdelivr.net/gh/spurwing-main/exec-life@<SHA>/loader.js"></script>
//
// Run `npm run tag` to print the exact tag for the current commit.
//
// WHY A SHA, NOT @main:
//   A commit-pinned URL is immutable on jsDelivr → cached forever → you never
//   purge anything, and nothing ever goes stale. To release, you change the SHA
//   in the Webflow tag and publish. To roll back, change it back. The pin lives
//   in Webflow (which serves fresh HTML), not in this cached file.
//
// The loader reads its OWN commit from the <script src> and loads the matching
// `dist/bundle.js` from the same commit, so loader and bundle can never drift.
//
// Resolution order (first match wins):
//   1. URL params      ?env=local | ?env=live | ?commit=<sha> | ?local=<url>
//                      ?dev (bare) | ?dev=1 → dev on + panel;  ?dev=0 → force off
//                      ?on=anim | ?off=anim,faq → feature flags for this pageview
//   2. Persisted dev   sessionStorage el_env (+ el_flags for feature toggles)
//   3. Auto-probe      on dev hosts (localhost / *.webflow.io) or when dev is on:
//                      quietly check if LocalCan is up and switch to it, else CDN.
//   4. Default         live → the bundle from this loader's own commit.
//
// Real visitors on the production domain never probe and go straight to the CDN.

(() => {
  "use strict";

  const root = document.documentElement;
  const params = new URLSearchParams(location.search);

  const DEFAULTS = {
    // Fallbacks, used only if the loader's own <script src> can't be parsed
    // (e.g. loaded inline, or from localhost during dev). Normally owner/project/
    // commit are read from the Webflow tag URL — the SHA there IS the pin.
    owner: "spurwing-main",
    project: "exec-life",
    commit: "main",
    // Your LocalCan HTTPS tunnel for `npm run dev`. Swap for your real tunnel URL.
    // Plain http://localhost:5500 also works, but only in Chrome (mixed content
    // blocks http from an https Webflow page in Safari/Firefox).
    localBase: "http://localhost:5500",
    probeTimeout: 900, // ms to wait for LocalCan before falling back to CDN
    unhideTimeout: 4000, // ms safety net so content never stays hidden
  };

  // ONE persisted key. There used to be four; an audit found three were dead:
  //   el_dev_enabled — written, but never consulted by devMode/showPanel. Its
  //                    "Keep dev mode on this browser" checkbox did nothing.
  //   el_local       — read at localBase, but NOTHING ever wrote it.
  //   el_commit      — read at commit, but NOTHING ever wrote it.
  // `?local=` / `?commit=` remain as per-pageview URL overrides, which is all
  // they were ever actually used as.
  const KEYS = {
    env: "el_env",
    flags: "el_flags",
  };

  // -- feature flags ---------------------------------------------------------
  // ONE registry for every switchable feature. It lives in the loader, not the
  // bundle, because the loader runs FIRST: it can set the CSS gate before the
  // bundle (or a failed bundle) has any say, and the dev panel can toggle a
  // CSS-only feature even when no JS module is involved.
  //
  // Each feature gets two things:
  //   html[data-el-on~="<name>"]   the CSS gate. Embeds must gate every rule
  //                                that applies (not merely defines) styles on
  //                                this. That is what makes a feature switchable
  //                                WITHOUT commenting CSS out — see README.
  //   el.flags.enabled("<name>")   the JS gate. bundle.js skips disabled modules.
  //
  // `default: false` ships a feature dormant: the code is live and reviewable,
  // it just does nothing until someone flips it on.
  const FEATURES = {
    nav: { label: "Nav", default: true },
    tabs: { label: "Tabs", default: true },
    carousels: { label: "Carousels", default: true },
    faq: { label: "FAQ", default: true },
    anim: { label: "Motion / reveals", default: true },
    video: { label: "Video facade", default: true },
  };

  const el = (window.el = window.el || {});
  el.functions = el.functions || {};

  // -- storage helpers -------------------------------------------------------
  // sessionStorage, NOT localStorage. The env override needs to survive
  // navigation between pages (query params don't), but it must NOT outlive the
  // tab: a sticky localStorage flag set weeks ago silently changes which bundle
  // a staging page runs, which is near-impossible to spot. Session scope keeps
  // the useful half and drops the footgun.
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
      // Best-effort sweep of the retired localStorage keys so anyone carrying
      // stale state from an older loader gets cleaned up on first Reset.
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

  // Presence-style flag. `param()` deliberately returns null for an empty value
  // (right for ?env=/?commit=/?local=, which need a real value), but that made a
  // bare `?dev` a no-op — it reads as "" → null → dev never switched on. A flag
  // written without a value means ON, which is what everyone types.
  //   ?dev, ?dev=1, ?dev=true, ?dev=on, ?dev=yes  → true
  //   ?dev=0, ?dev=false, ?dev=off, ?dev=no       → false (force OFF)
  //   absent, or an unrecognised value            → null  (no opinion)
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

  // null = no opinion → fall back to the host check. An explicit ?dev=0 now wins
  // over isDevHost, so you can force a staging page to behave like production
  // (previously impossible: `isDevHost ||` short-circuited it).
  const devFlag = flag("dev") ?? flag("mode");
  const devMode = devFlag === false ? false : devFlag === true || isDevHost;

  const persisted = (k) => (devMode ? store.get(k) : null);

  // Read owner/project/commit from this loader's own tag URL, e.g.
  //   https://cdn.jsdelivr.net/gh/<owner>/<project>@<commit>/loader.js
  // The <commit> in the Webflow tag is the pin — change it there to release.
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

  // env: "local" | "live" | "auto"  (auto = probe LocalCan, pick whatever is up)
  const envOverride = param("env") || persisted(KEYS.env);
  let env = envOverride;
  if (env !== "local" && env !== "live") env = devMode ? "auto" : "live";

  // A persisted override must never be silently in effect — if session state is
  // steering which bundle loads, the panel shows so you can see it and reset.
  const hasOverride = !!(envOverride || param("commit") || param("local"));

  // -- resolve flags ---------------------------------------------------------
  // Precedence per feature: ?on= / ?off= → persisted → registry default.
  //   ?off=anim,faq      turn off for this pageview
  //   ?on=anim           turn on for this pageview
  // Persisted overrides use sessionStorage for the same reason as `env`: a flag
  // set weeks ago in localStorage silently changing what a page does is close to
  // impossible to spot. Session scope keeps the useful half.
  const flagOverrides = (() => {
    const out = {};
    const parse = (raw) =>
      (raw || "")
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);

    // Persisted first, so URL params win over it.
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
    enabled: (name) => flagState[name]?.on ?? true, // unknown feature → on, so a
    // module added before this loader ships is never silently dead.
    overridden: Object.keys(flagOverrides).length > 0,
  };

  // The CSS gate, set synchronously — before the bundle, and before paint when
  // the loader tag sits in <head>. Everything is OFF unless it is listed here,
  // which is what stops an embed hiding content it shouldn't.
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

  // -- anti-FOUC safety ------------------------------------------------------
  // bundle.js adds `el-ready` itself on boot; this only guarantees content is
  // never trapped hidden if the bundle fails to load. Gate CSS on `.el-ready`.
  const unhide = () => root.classList.add("el-ready");
  const unhideTimer = setTimeout(unhide, DEFAULTS.unhideTimeout);

  // -- probe + inject --------------------------------------------------------
  probe().then((source) => {
    inject(source);
    // An explicit ?dev asks for the panel outright — even when LocalCan is down
    // and we fell back to the CDN, because seeing "live / local unreachable" IS
    // the diagnostic. An explicit ?dev=0 suppresses it everywhere, including
    // over an active override (the documented escape hatch).
    const showPanel =
      devFlag === false
        ? false
        : devFlag === true || hasOverride || el.flags.overridden || (isDevHost && source.localUp === true);
    if (showPanel) mountPanel(source);
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

    // switch env → persist (for this tab) + reload
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

    // Toggle a module → persist for this tab + reload. A reload (rather than
    // calling the module live) is deliberate: half these features hide things
    // with CSS before JS runs, so only a fresh pageview shows the real result.
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
      // Back to the registry default → stop overriding it, rather than pinning
      // the same value as an override.
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

    // Reset: drop the session override (and sweep any stale localStorage keys
    // left by an older loader), then reload clean.
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
