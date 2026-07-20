# Exec-Life — Webflow custom code

Custom front-end code for the Exec-Life Webflow site, plus a Cloudflare Worker
shell for anything that must run server-side.

This is a clean scaffold derived from the Suttons & Robertsons client repo, with
all site-specific modules removed. Add features under `src/modules/` as you go.

This repo has **two deployable parts**:

| Part | Lives in | Runs | Deploys to |
|------|----------|------|------------|
| **Loader** | `loader.js` | The visitor's browser, referenced by Webflow | A CDN (the one tag in Webflow) |
| **Bundle** | `bundle.js` + `src/` → `dist/bundle.js` | The visitor's browser, injected by the loader | A CDN (served from `dist/bundle.js` in this repo) |
| **Worker** | `worker/` | Cloudflare edge | Cloudflare (see [`worker/README.md`](worker/README.md)) |

The **loader** is a tiny bootstrap: it picks the environment and injects the
**bundle** (your actual site code). "The loader loads the bundle."

---

## Layout

```
exec-life/
├── loader.js              The tag Webflow references — picks env, injects the bundle
├── bundle.js              Bundle entry — imports every module and boots it
├── src/
│   ├── modules/           One file (or folder) per feature (add as needed)
│   └── utils/             Shared DOM / breakpoint helpers
├── dist/bundle.js         Built, minified bundle (committed — see "Build")
├── dev.mjs                Local dev server for serving source modules
├── worker/                The Cloudflare Worker shell — see worker/README.md
└── package.json
```

---

## Prerequisites

- **Node 18+** and npm
- For the Worker: the [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm i -g wrangler`)

```bash
npm install        # also installs the git hooks (see "Build")
```

---

## Local development

Serve the **source** modules (unbundled, no build step):

```bash
npm run dev        # serves http://localhost:5500/bundle.js
```

With the loader already in Webflow, you don't touch Webflow again: the loader
auto-probes LocalCan and injects your local `bundle.js` whenever `npm run dev`
is running (see [Dev / local switching](#dev--local-switching)). Stop the dev
server and it silently falls back to the CDN.

`dev.mjs` serves files with `Cache-Control: no-store` and permissive CORS, so a
refresh always picks up your latest edit.

---

## Build

```bash
npm run build      # esbuild bundles + minifies bundle.js → dist/bundle.js
```

`dist/bundle.js` is **committed to the repo on purpose**: a git hook
(`.githooks/pre-commit` and `.githooks/post-merge`, wired up by `npm install`'s
`postinstall`) runs `npm run build` and stages `dist/bundle.js` for you.

---

## Adding it to the live Webflow site

Add **one** tag to the site-wide custom code (Project Settings → Custom Code →
Head Code), pointing at the loader:

```html
<script src="https://cdn.jsdelivr.net/gh/spurwing-main/exec-life@main/loader.js"></script>
```

[`loader.js`](loader.js) is the only thing Webflow references. It decides where
to load `dist/bundle.js` from, injects it as an ES module, and in dev shows a
small floating control panel. All that logic lives in the repo, not pasted into
Webflow.

Notes:
- The bundle attaches its init functions under `window.el.functions` and adds
  the `el-ready` class to `<html>` once boot completes, so CSS can gate on
  `.el-ready`. `loader.js` also adds `el-ready` as a safety net if the bundle
  fails to load, so content is never trapped hidden.
- `loader.js` is served over jsDelivr @main, which caches for up to ~7 days.
  After editing `loader.js`, purge it (visit the `purge/` jsDelivr URL) or pin a
  commit. (Your `bundle.js` doesn't have this problem in dev — it's pulled live
  from LocalCan.)

### Dev / local switching

`loader.js` resolves the source in this order (first match wins):

| Order | Signal | Effect |
|-------|--------|--------|
| 1 | URL params | `?env=local` · `?env=live` · `?commit=<sha>` · `?local=<url>` · `?dev=1/0` |
| 2 | Persisted dev | `localStorage el_dev_enabled === "true"` (+ `el_env` / `el_local` / `el_commit`) |
| 3 | Auto-probe | On dev hosts (`localhost`, `*.webflow.io`) or when dev is on, it quietly probes LocalCan and uses it if reachable, else the CDN |
| 4 | Default | Live → the pinned CDN bundle |

Real visitors on the production domain never probe — they go straight to the CDN.

In dev, a floating panel (bottom-left) shows the live status and lets you flip
between **Local / Auto / Live** and toggle "keep dev mode on this browser".

### Releasing (you control what's live)

The live bundle is **pinned to an exact commit** via `DEFAULTS.commit` in
[`loader.js`](loader.js) — not `@main`. Pushing new code does **not** change the
live site until you bump the pin. To ship a new bundle:

```bash
# 1. commit your bundle changes (the git hook rebuilds dist/bundle.js)
git add -A && git commit -m "…"

# 2. pin the loader to that commit
git rev-parse HEAD                       # copy the full SHA
#   → set DEFAULTS.commit = "<that SHA>" in loader.js
git commit -am "release: pin bundle to <short-sha>"
git push

# 3. purge the loader from jsDelivr so the new pin is picked up
#    https://purge.jsdelivr.net/gh/spurwing-main/exec-life@main/loader.js
```

To **roll back**, set `DEFAULTS.commit` to an older SHA and repeat steps 2–3.
The bundle at each SHA is immutable on jsDelivr, so rollbacks are exact.
Test any commit before releasing with `?commit=<sha>` on the live URL.

**LocalCan URL:** set `DEFAULTS.localBase` in [`loader.js`](loader.js) to your
LocalCan HTTPS tunnel (e.g. `https://spurwing-el-XX.beta.localcan.dev`). Plain
`http://localhost:5500` works too, but only in Chrome — Safari/Firefox block
http subresources on the https Webflow page (mixed content).

---

## Testing

```bash
npm test           # vitest run
npm run test:watch # watch mode
```
