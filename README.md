# Exec Life browser code

This public repository contains the loader, source modules, built bundle and
code setup for the Webflow site. Its local checkout is `exec-life/execlife-public/`.

Keep reviewed project records in sibling `../execlife-private/`, and temporary plans,
source copies, captures and helper scripts in sibling `../execlife-local/`. Neither
belongs inside this public repository. The project parent is outside Git.
Use `../exec-life.code-workspace` locally to open all three roots together.

## Layout

```text
execlife-public/
  loader.js          Browser bootstrap referenced by Webflow
  bundle.js          Bundle entry point
  src/               Feature modules, shared helpers and tests
  dist/bundle.js     Built bundle, committed for CDN delivery
  dev.mjs            Local development server
  tag.mjs            Prints a commit-pinned loader tag
  package.json       Development, test and build commands
```

The loader and bundle keep their existing paths inside the repository. Moving
the checkout into `execlife-public/` does not add `/execlife-public/` to a CDN URL. Run all npm and
Git commands for this code from `execlife-public/`. Keep the existing repository public
for jsDelivr delivery; a local build or push does not establish the live version.

---

## Prerequisites

- **Node 18+** and npm

```bash
npm install        # also installs the git hooks (see "Build")
```

---

## Local development

Serve a **bundled** dev build (esbuild — deps like embla resolved, inline
sourcemap), rebuilt on every request:

```bash
npm run dev        # serves http://localhost:5500/bundle.js
```

With the loader already installed, use `?env=local` or the panel's Local control
on Webflow staging to request the local bundle. The panel choice lasts for the
tab in sessionStorage. Auto and Live use the CDN without contacting the local
network, even when the dev server is running. A failed explicit local check
falls back to the pinned CDN bundle.

`dev.mjs` bundles on the fly and serves with `Cache-Control: no-store` and
permissive CORS, so a refresh always runs your latest source — **no build step,
no LocalCan needed** for same-machine dev.

> **Browser note:** an https Webflow page loading `http://localhost:5500` is
> mixed content — **Chrome allows `localhost`**, but Safari/Firefox block it. Use
> Chrome for local dev, or point `DEFAULTS.localBase` at a LocalCan HTTPS tunnel
> for cross-browser work.

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
Head Code), without async/defer and before gated content can paint, pinned to a
**commit SHA** (run `npm run tag` to generate it). An existing tag move needs its
own approval; editing these files does not change Webflow settings:

```html
<script src="https://cdn.jsdelivr.net/gh/spurwing-main/exec-life@<SHA>/loader.js"></script>
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
  the `el-ready` class to `<html>` after its synchronous startup attempts. That
  class does not prove every module succeeded or an asynchronous result settled.
  The loader also adds it after a load failure or the visibility timeout; it is
  visibility recovery, not a module-success marker.
- Avoid `@main` in the live tag — branch URLs cache for ~7 days and go stale.
  Use a SHA. URL `?commit=` values are ignored on every host.

### Dev / local switching

`loader.js` selects release code from its trusted script tag or fallback
`DEFAULTS`, never `?commit=`. Environment selection on a development host uses a
URL `env` value, then the panel's tab-scoped sessionStorage value, then Auto.
Production always uses the CDN, including with `?dev=1`, `?mode=dev` or Local
parameters/session state.

| Selected environment | Request |
| --- | --- |
| Auto or Live | Pinned CDN bundle; no local-network check |
| Local on a development host | Probe allowed local base; use CDN if unavailable |
| Any environment on production | Pinned CDN bundle; no local-network check |

The floating panel keeps Local / Auto / Live and module controls. Its environment
and feature choices persist only for the current tab. Reset clears these choices,
retired localStorage keys and stale `commit` query parameters. Existing feature
flag URL overrides remain supported; they do not select another code source.

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
older SHA's tag (`npm run tag -- <old-sha>`) through an approved release. A query
parameter cannot preview another commit; use a trusted tag in the agreed test
host when release testing is authorised.

**LocalCan URL:** set `DEFAULTS.localBase` in [`loader.js`](loader.js) to your
LocalCan HTTPS tunnel. A `?local=` override must use that exact configured origin
(scheme, hostname and port) or a loopback host. Other `*.localcan.dev` hosts are
not trusted automatically. Bases must be absolute HTTP(S) URLs without credentials,
query or fragment. Plain
`http://localhost:5500` works too, but only in Chrome — Safari/Firefox block
http subresources on the https Webflow page (mixed content).

---

## Testing

```bash
npm test           # vitest run
npm run test:watch # watch mode
```
