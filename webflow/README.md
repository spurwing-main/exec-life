# Webflow CSS mirror

The CSS in here is **the source of truth for what should be in Webflow**. Webflow
is where it executes; this is where it gets reviewed, diffed and rolled back.

Each file maps to one HTML Embed, named identically in the Webflow Navigator:

| File | Webflow embed | Lives in |
|---|---|---|
| `global-motion-tokens.css` | `Global — motion tokens` | **Header** component |
| `global-motion.css` | `Global — motion` | **Header** component |
| `who-help-tabs.css` | `Who help — tabs` | **Who Help** component |
| `home-hero.css` | `Home hero` | Home hero section, on `/` |
| `about-service-video.css` | `About service — video` | **Service About** component |

## Why this exists

These embeds are ~15kb of load-bearing CSS that previously existed **only** inside
Webflow — no history, no diff, no review, no rollback. In one working session that
cost us:

- two silently duplicated blocks, caught only by watching a character count
- a base rule out-specifying every preset, so no preset applied at all
- an `animation` shorthand fed comma-separated lists, which resolved
  `animation-name` to `none` and would have stopped every reveal on the site
- `@layer` lowering the whole system's priority beneath Webflow's unlayered CSS
- several verification attempts giving false results because the *published* copy
  out-specified the rules being tested

Every one of those is the kind of thing a diff catches immediately.

## Workflow

1. Edit the file here first.
2. Paste into the matching embed (or apply with `designer_update_embed`).
3. Commit. The diff is the review.

Read the embed back after writing and compare — Webflow pretty-prints on save, so
whitespace will differ, but no selector or declaration should.

## Ordering

There is **no** load-order dependency between these files: `var()` resolves
from the cascade at computed-value time, not textually, so tokens can sit in any
embed in any order. They are split for legibility, not sequencing.

## Do not use @layer here

Unlayered styles beat layered ones, and Webflow's framework CSS plus every panel
style and other embed are unlayered — so putting these rules in a layer *lowers*
their priority against the whole rest of the site. Verified: inside `@layer`,
`animation-name` computed to `none` on every element; identical rules outside a
layer worked. Only viable if the entire site's CSS moves into layers together.
