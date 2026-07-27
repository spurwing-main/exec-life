/**
 * Motion — the site's one reveal system.
 *
 * WHAT SELECTS AND DEFINES: ATTRIBUTES, IN THE DESIGNER.
 * Every animated element says so itself, on itself:
 *
 *   <div data-anim-group>                    stagger container
 *     <p  data-anim="fade-up-sm">…           eyebrow — barely travels
 *     <h2 data-anim="fade-up-lg">…           heading — furthest and slowest
 *     <div data-anim="fade-up">…             copy
 *     <a  data-anim="settle">…               CTA
 *   </div>
 *   <div data-anim="fade-up" data-anim-on="load">   plays on load, not on scroll
 *   <div data-anim="off">                    never animates
 *
 * There is no convention to learn, no class-name mapping, and nothing implicit:
 * if an element animates, the attribute is on it and you can see it in the
 * Designer. Presets: `fade-up-sm`, `fade-up`, `fade-up-lg`, `rise`, `settle`,
 * `fade`, `off`. A group's children reveal with no attribute at all, which is the
 * only way a Button component instance root can animate (instance roots cannot
 * carry custom attributes).
 *
 * WHAT THIS FILE DOES — and it is deliberately almost nothing:
 *   1. flips `data-anim-state="in"` when an element arrives,
 *   2. guards against anything ever staying invisible.
 * It does not touch markup. The wipe preset used to need a JS-built mask span
 * inside every heading; that preset is gone (it cropped descenders and made the
 * heading the one element moving differently from everything else), and with it
 * the only reason this module ever mutated the DOM.
 * Stagger, ordering, durations, distances, easing and keyframes are all CSS, in
 * the "Global — motion" embed. This module contains no class name, no duration
 * and no easing.
 *
 * WHY NOT SCROLL-DRIVEN
 * This was built on `animation-timeline: view()` first, because position-linked
 * progress is immune to scroll velocity — which matters, since a flick scroll
 * runs at 2000-4000px/s and a time-based reveal can be over before the element
 * is readable. It was then measured on the real page and removed: all 27 animated
 * targets had an INACTIVE view timeline. A view timeline resolves against the
 * nearest ancestor scroll container, and `overflow: hidden/clip` makes an element
 * a scroll container even when it never scrolls — this site's section shells clip
 * for the full-bleed carousels, and the wipe's own mask clips by definition. So
 * the timeline was captured by a box that never scrolls and never advanced. It
 * failed open (nothing was hidden) but it never animated either. Don't
 * reintroduce it without re-measuring against those clipping wrappers.
 *
 * FAIL OPEN — the rule everything else bends to
 * Hiding content by default makes every heading depend on JS succeeding, so:
 *   - the hidden state is gated on `html[data-anim-ready]`, which only this
 *     module sets — no JS, nothing hidden;
 *   - an unknown preset name falls through to the base preset in CSS rather
 *     than hiding forever;
 *   - with no IntersectionObserver, everything is revealed immediately;
 *   - `guard()` sets `html[data-anim-panic]` (which disables all of it) if an
 *     element it already revealed is STILL invisible once its animation has had
 *     time to finish — see the note on `guard`, whose first version was too
 *     eager and disabled the whole page;
 *   - it does nothing at all in the Designer canvas or the Editor, so a client
 *     editing copy never sees hidden text.
 */

import { qsa } from "../utils/dom.js";

/**
 * Subtrees where a scroll reveal cannot work, so anything tagged inside one is
 * revealed IMMEDIATELY rather than observed. Both are structural/framework hooks,
 * never design class names.
 *
 *   [data-carousel-viewport] — a slide sitting off to the side of a carousel is
 *     outside the viewport horizontally, so it never intersects. Observing it
 *     would hold it hidden forever and the user would drag to an empty slide.
 *   .w-richtext — article body copy is content, not section furniture.
 *
 * Revealing rather than skipping matters: skipping would leave the element
 * matching the CSS hold rule with nothing ever to release it.
 */
const EXCLUDE = "[data-carousel-viewport], .w-richtext";

/** Long enough for a slow bundle, short enough that a failure is not felt. */
const GRACE_MS = 2500;

/** The Designer canvas and the Editor must never see hidden content. */
function isAuthoringSurface() {
  const cls = document.documentElement.classList;
  return cls.contains("wf-design-mode") || cls.contains("w-editor");
}

/**
 * Flip `data-anim-state="in"` when the element arrives. Fires slightly before it
 * is fully on screen so the motion is seen rather than finished off-screen.
 */
function startObserver(root) {
  // Groups are observed as well as individually tagged elements. A group's
  // children reveal WITHOUT an attribute of their own (that is what lets a Button
  // component instance animate at all — instance roots cannot take custom
  // attributes), so there is nothing on the child for this module to flip. The
  // CSS therefore reads the state off the group, and the group is what has to be
  // watched.
  const targets = qsa(
    root,
    "[data-anim]:not([data-anim='off']):not([data-anim-on='load'])," +
      "[data-anim-group]:not([data-anim-on='load'])",
  );

  // Anything inside an excluded subtree is released now — never observed.
  const [excluded, observable] = targets.reduce(
    ([out, keep], el) => (el.closest(EXCLUDE) ? [[...out, el], keep] : [out, [...keep, el]]),
    [[], []],
  );
  excluded.forEach(reveal);

  if (typeof IntersectionObserver !== "function") {
    observable.forEach(reveal);
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        // An element can end up ABOVE the viewport without ever having been seen
        // to intersect: an anchor jump, a restored scroll position, or a
        // scrollIntoView all move in a single frame, and the observer only
        // samples at frame boundaries. Reveal those too — they are already past,
        // so there is nothing to animate, but they must not stay hidden.
        const passedAbove = entry.boundingClientRect.bottom < 0;
        if (!entry.isIntersecting && !passedAbove) return;
        reveal(entry.target);
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -10% 0px", threshold: 0 },
  );

  observable.forEach((el) => observer.observe(el));
}

/** When each element was told to reveal, so the guard can tell late from stuck. */
const revealedAt = new WeakMap();

/** Longest a reveal can legitimately still be running: worst delay + duration. */
const SETTLED_MS = 1500;

/**
 * Last line of defence, and it has to be careful about WHAT it calls stuck.
 *
 * The first version asked "is anything on screen still invisible?", using
 * `top < innerHeight`. That is a wider region than the observer's trigger, which
 * sits at `rootMargin: -10%` — so an element resting in that bottom 10% band was
 * correctly still held, got read as stuck, and tripped the panic. Panic disables
 * every scroll reveal site-wide, while the hero (a load rule, no panic gate) kept
 * animating. Symptom: hero fine, everything below it instant. On a long page
 * something is almost always in that band, so it fired nearly every time.
 *
 * The real stuck condition is narrower: an element this module has ALREADY told
 * to reveal, whose animation has had time to finish, that is still invisible.
 * That only happens if the CSS is missing, overridden, or gated wrong — which is
 * exactly what the panic switch is for. An element that has not been triggered
 * yet is not stuck; it is waiting, and that is the system working.
 */
function guard() {
  const now = performance.now();
  const stuck = qsa(document, "[data-anim-state='in']").some((el) => {
    const since = revealedAt.get(el);
    if (since === undefined || now - since < SETTLED_MS) return false;
    // A GROUP is never animated itself — its children are. Checking the group's
    // own opacity would always read 1 and miss a whole section stuck hidden.
    const subjects = el.hasAttribute("data-anim-group")
      ? Array.from(el.children).filter((c) => !c.hasAttribute("data-anim-group"))
      : [el];
    return subjects.some((s) => Number(getComputedStyle(s).opacity) < 0.9);
  });
  if (stuck) document.documentElement.setAttribute("data-anim-panic", "");
}

/** Mark an element as arrived, and remember when. */
function reveal(el) {
  revealedAt.set(el, performance.now());
  el.setAttribute("data-anim-state", "in");
}

export function initAnim(root = document) {
  if (isAuthoringSurface()) return;

  document.documentElement.setAttribute("data-anim-ready", "");
  startObserver(root);

  setTimeout(guard, GRACE_MS);
}

export default initAnim;
