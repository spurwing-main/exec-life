/**
 * Motion: the site's one reveal system.
 *
 * ATTRIBUTES DEFINE EVERYTHING. SET THEM IN THE DESIGNER.
 *
 *   <div data-anim-group>                    stagger container
 *     <p  data-anim="fade-up-sm">…           eyebrow, barely travels
 *     <h2 data-anim="fade-up-lg">…           heading, furthest and slowest
 *     <div data-anim="fade-up">…             copy
 *     <a  data-anim="settle">…               call-to-action link
 *   </div>
 *   <div data-anim="fade-up" data-anim-on="load">   plays on load, not on scroll
 *   <div data-anim="off">                    never animates
 *
 * No class name maps to a behaviour and nothing is implicit: if an element
 * animates, the attribute is on it and visible in the Designer. Presets:
 * `fade-up-sm`, `fade-up`, `fade-up-lg`, `rise`, `settle`, `fade`, `off`.
 * A group's children reveal with no attribute of their own. That is the only
 * way a Button component instance root can animate, because instance roots
 * cannot carry custom attributes.
 *
 * THIS FILE DOES ALMOST NOTHING, deliberately:
 *   1. flips `data-anim-state="in"` when an element arrives,
 *   2. guards against anything that stays invisible forever.
 *
 * It never touches markup. The old wipe preset needed a JS-built mask span in
 * every heading; it cropped descenders, moved headings differently from
 * everything else, and was the only reason this module ever mutated the DOM.
 * Stagger, ordering, durations, distances, easing and keyframes live in CSS,
 * in the "Global — motion" embed. No class name, duration or easing here.
 *
 * WHY NOT SCROLL-DRIVEN. This ran on `animation-timeline: view()` first,
 * because position-linked progress is immune to scroll velocity, and a flick
 * scroll of 2000-4000px/s can finish a time-based reveal before the element
 * is readable. Measured on the real page it failed: all 27 animated targets
 * had an INACTIVE view timeline.
 *
 * A view timeline resolves against the nearest ancestor scroll container, and
 * `overflow: hidden/clip` makes an element one even when it never scrolls.
 * The section shells clip for the full-bleed carousels, and the wipe's own
 * mask clips by definition, so the timeline was captured by a box that never
 * advances. It failed open: nothing hidden, nothing animated either. Do not
 * bring it back without measuring against those clipping wrappers first.
 *
 * FAIL OPEN: the rule everything else bends to. This design hides content by
 * default, so every heading depends on JS to reveal it. Protections:
 *   - the hidden state is gated on `html[data-anim-ready]`, set only here.
 *     No JS, nothing hidden.
 *   - an unknown preset falls through to the CSS base preset, never sticking.
 *   - with no IntersectionObserver, everything reveals immediately.
 *   - `guard()` sets `html[data-anim-panic]` and disables every reveal when an
 *     already-revealed element is still invisible past its worst-case
 *     animation time. Its first version was too eager and disabled the whole
 *     page; see the note on `guard`.
 *   - it does nothing in the Designer canvas or Editor, so a client editing
 *     copy never sees hidden text.
 */

import { qsa } from "../utils/dom.js";

/**
 * Subtrees where a scroll reveal cannot work. Anything tagged inside one
 * reveals IMMEDIATELY and is never observed. All three selectors are
 * structural or framework hooks, never design class names.
 *
 *   [data-carousel-viewport]: a slide can sit outside the viewport
 *     horizontally and never intersect. Observed, it would stay hidden
 *     forever and the user would drag to an empty slide.
 *   .w-richtext: article body copy is content, not section furniture.
 *   [fs-list-element='list']: a Finsweet list. Added in 33ec4f7, which records
 *     no reason. Fill this in before anyone has to guess at it.
 *
 * Reveal, do not skip: a skipped element still matches the CSS hold rule,
 * with nothing left to release it.
 */
const EXCLUDE = "[data-carousel-viewport], .w-richtext, [fs-list-element='list']";

/** Long enough to cover a slow bundle load. Short enough that a failure isn't felt. */
const GRACE_MS = 2500;

/** The Designer canvas and the Editor must never show hidden content. */
function isAuthoringSurface() {
	const cls = document.documentElement.classList;
	return cls.contains("wf-design-mode") || cls.contains("w-editor");
}

/**
 * Flip `data-anim-state="in"` when the element arrives. This fires slightly
 * before the element is fully on screen, so the motion plays while the
 * element is in view. It does not finish off-screen.
 */
function startObserver(root) {
	// Groups are observed alongside individually tagged elements. A group's
	// children reveal WITHOUT an attribute of their own, which is what lets a
	// Button component instance animate at all, since instance roots cannot
	// take custom attributes. There is nothing on the child to flip, so the
	// CSS reads state off the group and the group is what gets watched.
	const targets = qsa(
		root,
		"[data-anim]:not([data-anim='off']):not([data-anim-on='load'])," +
			"[data-anim-group]:not([data-anim-on='load'])",
	);

	// Excluded subtrees release immediately, and deliberately without a guard
	// timestamp. These elements can legitimately sit below full opacity for
	// reasons unrelated to this module, such as an inactive Embla slide or a
	// decorative overlay. Tracked, the guard would read that as "revealed but
	// still invisible" and disable every reveal on the page.
	targets.filter((el) => el.closest(EXCLUDE)).forEach((el) => release(el, { track: false }));
	const observable = targets.filter((el) => !el.closest(EXCLUDE));

	if (typeof IntersectionObserver !== "function") {
		observable.forEach((el) => release(el));
		return;
	}

	const observer = new IntersectionObserver(
		(entries) => {
			entries.forEach((entry) => {
				// An element can end up ABOVE the viewport without ever intersecting.
				// An anchor jump, a restored scroll position, or a scrollIntoView call
				// all move in a single frame, and the observer only samples at frame
				// boundaries. This module reveals these too. There is nothing left
				// to animate, since they are already past, but they must not stay
				// hidden.
				const passedAbove = entry.boundingClientRect.bottom < 0;
				if (!entry.isIntersecting && !passedAbove) return;
				release(entry.target);
				observer.unobserve(entry.target);
			});
		},
		{ rootMargin: "0px 0px -10% 0px", threshold: 0 },
	);

	observable.forEach((el) => observer.observe(el));
}

/** The time this module told each element to reveal. This lets the guard tell late elements from stuck elements. */
const revealedAt = new WeakMap();

/** The longest time a reveal can legitimately still run. This equals the worst delay plus the duration. */
const SETTLED_MS = 1500;

/**
 * Last line of defence. It must be careful about WHAT it calls stuck.
 *
 * The first version asked "is anything on screen still invisible?" and used
 * `top < innerHeight`. That region is wider than the observer's trigger at
 * `rootMargin: -10%`. So it read an element as stuck while that element was
 * correctly still held in the bottom 10% band, and it tripped the panic.
 *
 * Panic disables every scroll reveal site-wide. The hero uses a load rule,
 * and load rules have no panic gate. So the hero looked fine while everything
 * below it appeared instantly with no animation. On a long page something is
 * almost always in that band, so the false panic fired nearly every time.
 *
 * The real stuck condition is narrower: an element already told to reveal,
 * past its worst-case animation window, still invisible. That happens only if
 * the CSS is absent, overridden, or gated the wrong way, which is exactly
 * what the panic switch is for. An element not yet triggered is not stuck.
 * It waits its turn, which is the system working.
 */
function guard() {
	const now = performance.now();
	const stuck = qsa(document, "[data-anim-state='in']").some((el) => {
		const since = revealedAt.get(el);
		if (since === undefined || now - since < SETTLED_MS) return false;
		// A GROUP is never animated itself, only its children are. Checking the
		// group's own opacity would always read 1 and miss a whole section stuck
		// hidden.
		const subjects = el.hasAttribute("data-anim-group")
			? Array.from(el.children).filter((c) => !c.hasAttribute("data-anim-group"))
			: [el];
		return subjects.some((s) => Number(getComputedStyle(s).opacity) < 0.9);
	});
	if (stuck) document.documentElement.setAttribute("data-anim-panic", "");
}

/**
 * Mark an element as arrived. `track: false` releases it without a
 * timestamp, so it stays out of the guard's sample. See the note above,
 * where this module releases excluded subtrees.
 */
function release(el, { track = true } = {}) {
	if (track) revealedAt.set(el, performance.now());
	el.setAttribute("data-anim-state", "in");
}

export function initAnim(root = document) {
	if (isAuthoringSurface()) return;

	// ORDER MATTERS. This is the whole fail-open guarantee.
	//
	// Arm the guard FIRST, so it is scheduled whatever happens next.
	// `data-anim-ready`, the flag that lets the CSS hide anything, goes on only
	// once the observer is active. The flag used to go on first. If
	// `startObserver` then threw, the CSS already held every element hidden,
	// the guard was not yet scheduled, and bundle.js's try/catch swallowed the
	// error. Content stayed hidden forever, at exactly the point this design
	// exists to protect. Now a failed observer takes the flag back off and the
	// page is simply un-animated.
	setTimeout(guard, GRACE_MS);

	try {
		document.documentElement.setAttribute("data-anim-ready", "");
		startObserver(root);
	} catch (error) {
		document.documentElement.removeAttribute("data-anim-ready");
		throw error;
	}
}

export default initAnim;
