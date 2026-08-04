# Exec-Life — Webflow custom code

Custom front-end code for the Exec-Life Webflow site. Features live under
`src/modules/`, one file per feature.

## ⛔ This repo is public — working files go in `/local/`

It is served from a CDN by commit SHA. That is the whole delivery mechanism, so
it **cannot be private**. What's committed here is the JS that ships to a
browser, and nothing else.

So there is one rule, and it is the only entry in [`.gitignore`](.gitignore)
besides machine junk:

> **Anything that isn't shipped JS goes in `/local/`.** No exceptions, no
> per-file ignore lines, no judgement call at the moment you save a file.

That covers Designer working copies, Figma maps and specs, QA and audit output,
client copy, SEO backups, screenshots, throwaway scripts — all of it. The
convention exists because the alternative failed in a specific way: the ignore
list used to name each stray file, which made every new document a decision, and
the default for anything undeclared was *committed to a public repo*. Client
material and another site's scraped markup both reached the public remote that
way. Ignoring one directory inverts it — the safe outcome is what you get by
doing nothing.

Practical consequences:

- **Writing a script, capture, report or audit? Put it under `/local/`** — not
  the repo root, not a new top-level folder.
- **Point tools at `/local/`.** Anything that writes to the root by default (asset
  downloaders, screenshot tools, scratch dirs) needs its output path set, because
  a new root directory is *not* ignored and will show up in `git status` as
  untracked. That visibility is deliberate: treat it as the signal to move it.
- **A new top-level directory is a red flag.** If it isn't `src/`, `dist/` or
  `local/`, ask why it exists before committing it.

[`local/README.md`](local/README.md) indexes what's in there and where each
thing's real version lives.

This repo has **two deployable parts**:

| Part | Lives in | Runs | Deploys to |
|------|----------|------|------------|
| **Loader** | `loader.js` | The visitor's browser, referenced by Webflow | A CDN (the one tag in Webflow) |
| **Bundle** | `bundle.js` + `src/` → `dist/bundle.js` | The visitor's browser, injected by the loader | A CDN (served from `dist/bundle.js` in this repo) |

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
├── local/                 EVERYTHING not shipped — ignored, see local/README.md
└── package.json
```

---

## Where things live

Three layers own this site. The boundary between them is the thing to get right,
because every ambiguity ends up as the same bug: a value defined twice, in two
places, drifting apart.

| Layer | Where you edit it | Owns |
|---|---|---|
| **1. Webflow Designer** | Style panel, Navigator, variables | The **resting look** — layout, spacing, type, colour, radii, breakpoint variants — plus **structure** and the **`data-*` attributes that declare intent** |
| **2. Custom-code embeds** | HTML Embeds, inside Webflow | Everything **CSS can express but the panel can't**: state and attribute selectors, pseudo-elements, `nth-child`, `@keyframes`, `@media`, `@supports` |
| **3. This repo** | `src/modules/`, shipped as `dist/bundle.js` | **Behaviour only.** Reads and writes attributes. No class names, no colours, no durations, no easings |

One test each, in order — the first that answers "yes" owns it:

1. Can the Style panel express it in the element's resting state? → **Designer**
2. Is it CSS, but needs a selector, keyframe or query the panel can't hold? → **embed**
3. Does something have to be *decided at runtime*? → **repo**

**The layers talk through two narrow interfaces, and nothing else:**

- **`data-*` attributes** — the contract between all three. The Designer authors
  intent (`data-anim="wipe"`, `data-carousel-bleed`, `data-faq`), CSS styles off
  it, JS flips state onto it (`data-anim-state`, `data-open`, `data-active`,
  `[disabled]`). No module injects a style; no embed guesses at behaviour.
- **CSS custom properties** — the contract for values. Webflow variables
  (`--_color---*`, `--_sizes---*`, `--_type---*`, `--_theme---*`) are the single
  source of truth for colour, size and type; the motion tokens (`--anim-*`) are
  the single source of truth for timing. Embeds reference them (with
  `color-mix(…, transparent)` for alpha variants), so changing a variable
  re-themes or re-times the site. There is no raw hex and no stray duration in
  an embed.

Consequences worth stating, because they are easy to get wrong:

- A duration or easing that appears in two embeds is a bug — the second one
  should read the token.
- A class name that appears in a module is a bug — the module should read an
  attribute.
- A value hard-coded in an embed that the panel could hold is a bug — it belongs
  on the class.

### The embeds

Named in the Navigator so they are self-documenting, and scoped to one concern
each:

| Embed (Navigator name) | Lives in | Owns |
|---|---|---|
| `Global — reset` / `base` / `utilities` / `rich text` | **Header** component | Framework reset, html/body, `.u-*` utilities, rich-text spacing |
| `Global — motion` | **Header** component | The whole reveal system: tokens, keyframes, presets, stagger, scroll-driven + fallback paths. **The only place a reveal duration, distance or easing is defined** |
| `Global — interactions & components` | **Header** component | Cross-section **component state**: `.button`, `.text-link`, forms, **Slider Arrow** (behaviour + both section themes), **carousel base** + full-bleed (`[data-carousel-bleed]`), `.arrow-circle`, card Ken-Burns hover, nav-logo, hero-contact. Reads the motion tokens; defines none |
| `Global — fluid type` | **Header** component | Root font-size clamp |
| `Footer — CSS` | **Footer** component | Footer background + spotlight hover only |
| `Home — hero motion` | page | The hero's stagger ORDER (`--anim-i` per element) + its one bespoke image move. Presets and timing come from `Global — motion` |
| `Services / Testimonials — carousel CSS`, `Who-help — tabs CSS`, `FAQ — accordion CSS`, `Services — section background` | page | That section's bespoke visuals + one `--carousel-slide-basis` var; anything shared defers to a global embed |

### Motion, specifically

Selection and preset are **authored attributes** — an element that animates says
so on itself, visible in the Designer:

```html
<div data-anim-group>                      <!-- stagger container -->
  <p   data-anim="fade-up-sm">…            <!-- eyebrow: barely travels -->
  <h2  data-anim="wipe">…                  <!-- heading: masked, the real event -->
  <p   data-anim="fade-up">…               <!-- copy -->
</div>
<div data-anim="fade-up" data-anim-on="load">   <!-- plays on load, not on scroll -->
<div data-anim="off">                           <!-- never animates -->
```

Presets: `fade`, `fade-up`, `fade-up-sm`, `settle`, `wipe`. There is no naming
convention to learn and nothing implicit — no class-name mapping, no config list.

`src/modules/anim.js` does only three things: builds the wrapper a masked wipe
needs (it means nesting a span in a heading, which can't be authored), drives the
time-based fallback for browsers without `animation-timeline: view()`, and guards
against anything staying invisible. Stagger, ordering, easing and duration are
all CSS.

**Reveals fail open, by construction.** Hiding content by default would make
every heading depend on JS succeeding, so: the scroll-driven path reveals with no
JS at all; the fallback's hidden state is gated on `html[data-anim-ready]`, which
only the module sets; an unknown preset degrades to a plain fade instead of
hiding; and a guard sets `html[data-anim-panic]` — disabling all of it — if
anything is still invisible on screen after 2.5s. Motion is also disabled outright
in the Designer canvas and the Editor, so a client editing copy never sees hidden
text. `bundle.js` boots each module in its own `try/catch`, with anim first, so an
unrelated module throwing can never take the content down.

**Carousels** are full-bleed by opt-in: add `data-carousel-bleed` to the root and
set `--carousel-slide-basis` in the section embed. Contained carousels omit the
attribute. The break-out math lives once, in the global embed.

### Feature flags

Every switchable feature has a flag, declared once in the `FEATURES` registry in
[`loader.js`](loader.js). A flag gives it two switches that move together:

| | Gate | Set by |
|---|---|---|
| **CSS** | `html[data-el-on~="<name>"]` | the loader, synchronously, before the bundle runs |
| **JS** | `el.flags.enabled("<name>")` | consulted by `bundle.js` before booting the module |

Turn one off in the **dev panel** (the Modules list — click a toggle, it persists
for the tab and reloads), or per pageview with `?off=anim,faq` / `?on=anim`.
Precedence is URL → persisted (sessionStorage, so it can't outlive the tab) →
registry default. An overridden flag shows an amber dot in the panel, so a flag
that is silently steering the page is always visible.

`default: false` ships a feature **dormant** — the code is live and reviewable, it
just does nothing until someone flips it on. That is how `anim` currently sits.

**The rule that keeps CSS out of this:** inside an embed, separate

- **definitions** — custom properties, `@keyframes`, preset values. These have no
  visible effect on their own, so they need no gate.
- **application rules** — anything that actually changes what you see, especially
  anything that *hides* something. **Every one of these gates on the flag.**

Follow that and a feature is disabled by flipping a toggle, never by commenting
CSS out — and reading the file always shows you the real code rather than a
commented-out fossil. Grouping the application rules together under one banner
comment in the embed makes the gated set obvious at a glance.

`anim` is the worked example: it carries **two** gates, and they do different
jobs. `html[data-el-on~="anim"]` is the flag — is this on at all. `[data-anim-ready]`
is liveness, set only by the module once it is actually running. Both are
required, which is what keeps it fail-open: flag on but bundle dead reveals
everything rather than hiding it. Verified in the browser across all four
combinations; only *flag on + JS alive* ever hides anything.

### Shipping order

The CSS lives in Webflow and the JS lives here, so a release touches both. Either
order is safe — that is deliberate, and the fail-open design is what buys it:
publishing Webflow before deploying the bundle leaves the site un-animated, never
hidden, and deploying the bundle before publishing leaves the JS with nothing to
do.

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

With the loader already in Webflow, you don't touch Webflow again: on a dev host
(`localhost`, `*.webflow.io`) it auto-probes `localhost:5500` and injects your
local build whenever `npm run dev` is running (see
[Dev / local switching](#dev--local-switching)). Stop the dev server and it
silently falls back to the CDN.

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
Head Code), pinned to a **commit SHA** (run `npm run tag` to generate it):

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
