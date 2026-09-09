# Simple

## Reality

A public Webflow browser-code repository, according to [README.md](README.md). The loader and bundle are separate deployable parts.

## Preserve

Public-code privacy boundary. Keep private client material and temporary work in ignored `local/`.

## Current boundary

`loader.js` selects the environment and loads the bundle. `bundle.js` imports modules under `src/`. Actual deployed revisions are unknown.

## Ordinary paths

Webflow Designer owns resting styles and structure. Change browser behaviour in its module; use the existing build for `dist/bundle.js`.

## Proof

Run `npm test` and `npm run build` for affected code. A local build does not prove CDN or live Webflow behaviour.

## Reconsider when

The loader contract, CDN delivery or division of ownership with Webflow changes.
