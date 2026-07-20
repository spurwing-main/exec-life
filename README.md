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
Head Code), pinned to a **commit SHA** (run `npm run tag` to generate it):

```html
<script src="https://cdn.jsdelivr.net/gh/spurwing-tim/exec-life@<SHA>/loader.js"></script>
```

[`loader.js`](loader.js) is the only thing Webflow references. It reads its own
commit from the tag URL, loads the matching `dist/bundle.js` from that same
commit, injects it as an ES module, and in dev shows a small floating control
panel. All that logic lives in the repo, not pasted into Webflow.

**Why a SHA and not `@main`:** a commit-pinned jsDelivr URL is **immutable —
cached forever, never purged, never stale**. The version pin lives in the
Webflow tag (Webflow serves fresh HTML), not inside a cached file. That makes
caching work *for* you: releasing is just changing the SHA and publishing.

Notes:
- The bundle attaches its init functions under `window.el.functions` and adds
  the `el-ready` class to `<html>` once boot completes, so CSS can gate on
  `.el-ready`. `loader.js` also adds `el-ready` as a safety net if the bundle
  fails to load, so content is never trapped hidden.
- Avoid `@main` in the live tag — branch URLs cache for ~7 days and go stale.
  Use a SHA. (`?commit=<sha>` still overrides per-request for testing.)

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

Nothing goes live from a `git push` alone — the live version is whichever SHA is
in the Webflow tag. To ship:

```bash
# 1. commit your changes (the git hook rebuilds dist/bundle.js) and push
git add -A && git commit -m "…" && git push

# 2. print the paste-ready tag for that commit
npm run tag
#   → <script src="…/exec-life@<SHA>/loader.js"></script>

# 3. paste it into Webflow → Custom Code → Head, and Publish. Done.
```

No jsDelivr purge, ever — commit URLs are immutable. **Roll back** by pasting an
older SHA's tag (`npm run tag -- <old-sha>`) and publishing. **Preview** any
commit on the live site without releasing via `?commit=<sha>`.

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
