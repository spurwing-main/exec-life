/**
 * Motion: the site's one reveal system.
 *
 * ATTRIBUTES SELECT AND DEFINE EVERYTHING. SET THEM IN THE DESIGNER.
 * Every animated element carries its own attribute:
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
 * There is no convention to learn, and no class name maps to a behaviour.
 * Nothing is implicit. If an element animates, the attribute is on it, and
 * the attribute is visible in the Designer. Presets: `fade-up-sm`, `fade-up`,
 * `fade-up-lg`, `rise`, `settle`, `fade`, `off`. A group's children reveal
 * with no attribute of their own. That is the only way the root of a Button
 * component instance can animate. Instance roots cannot carry custom
 * attributes.
 *
 * WHAT THIS FILE DOES. Deliberately almost nothing:
 *   1. flips `data-anim-state="in"` when an element arrives,
 *   2. guards against anything that stays invisible forever.
 *
 * It never touches markup. The old wipe preset needed a JS-built mask span
 * inside every heading. That preset is gone. It cropped descenders and made
 * the heading move differently from everything else. Its removal also took
 * away the only reason this module ever mutated the DOM.
 *
 * Stagger, ordering, durations, distances, easing and keyframes all live in
 * CSS, in the "Global — motion" embed. This module contains no class name,
 * no duration, and no easing.
 *
 * WHY NOT SCROLL-DRIVEN
 * This ran on `animation-timeline: view()` first. Position-linked progress
 * is immune to scroll velocity. That matters, because a flick scroll runs at
 * 2000-4000px/s. A time-based reveal can finish before the element is even
 * readable. Measured on the real page, it failed. All 27 animated targets
 * had an INACTIVE view timeline.
 *
 * A view timeline resolves against the nearest ancestor scroll container.
 * `overflow: hidden/clip` makes an element a scroll container, even when the
 * element never scrolls. This site's section shells clip for the full-bleed
 * carousels, and the wipe's own mask clips by definition. So the timeline
 * was captured by a box that never scrolls and never advances.
 *
 * It failed open. Nothing stayed hidden. But nothing animated either. Do
 * not bring it back. Measure it again first against those clipping
 * wrappers.
 *
 * FAIL OPEN: the rule everything else bends to.
 * By default, this design hides content, so every heading depends on JS to
 * reveal it. This module protects that dependency in these ways:
 *   - the hidden state is gated on `html[data-anim-ready]`, which only this
 *     module sets. No JS, nothing hidden.
 *   - an unknown preset name falls through to the base preset in CSS, and it
 *     does not stay hidden forever.
 *   - with no IntersectionObserver, everything reveals immediately.
 *   - `guard()` sets `html[data-anim-panic]` and disables every reveal. It
 *     does this when an element that it already revealed is still invisible
 *     once its worst-case animation time passes. See the note on `guard`:
 *     its first version was too eager, and it disabled the whole page.
 *   - it does nothing in the Designer canvas or the Editor, so a client who
 *     edits copy never sees hidden text.
 */

import { qsa } from "../utils/dom.js";

/**
 * Subtrees where a scroll reveal cannot work. Anything tagged inside one
 * reveals IMMEDIATELY. This module does not observe it. Both selectors are
 * structural or framework hooks, never design class names.
 *
 *   [data-carousel-viewport]: a carousel slide can sit off to the side,
 *     outside the viewport horizontally, so it never intersects. If this
 *     module observed it, the slide would stay hidden forever, and the
 *     user would drag to an empty slide.
 *   .w-richtext: article body copy is content, not section furniture.
 *
 * Reveal it. Do not skip it. A skipped element would still match the CSS
 * hold rule, with nothing left to release it.
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
	// This module observes groups too, alongside individually tagged
	// elements. A group's children reveal WITHOUT an attribute of their own.
	// That is what lets a Button component instance animate at all, since
	// instance roots cannot take custom attributes. So there is nothing on
	// the child for this module to flip. The CSS reads the state off the
	// group instead, so the group is what this module watches.
	const targets = qsa(
		root,
		"[data-anim]:not([data-anim='off']):not([data-anim-on='load'])," +
			"[data-anim-group]:not([data-anim-on='load'])",
	);

	// This releases anything inside an excluded subtree right away. It never
	// observes such an element, and it deliberately does not track the
	// element for the guard. These elements can legitimately sit below full
	// opacity for reasons that have nothing to do with this module, such as
	// an inactive Embla slide or a decorative overlay. Otherwise, the guard
	// would read that as "revealed but still invisible" and disable every
	// reveal on the page.
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
 * Last line of defence. It has to be careful about WHAT it calls stuck.
 *
 * The first version asked, "is anything on screen still invisible?" It used
 * `top < innerHeight`. That region is wider than the observer's trigger,
 * which sits at `rootMargin: -10%`. So the first check wrongly read an
 * element as stuck, when the element was correctly still held in that
 * bottom 10% band. It tripped the panic.
 *
 * Panic disables every scroll reveal site-wide. The hero uses a load rule,
 * and load rules have no panic gate, so panic did not stop the hero. As a
 * symptom, the hero looked fine, but everything below it appeared
 * instantly, with no animation. On a long page, something is almost always
 * in that band, so the false panic fired nearly every time.
 *
 * The real stuck condition is narrower. It applies only to an element that
 * this module already told to reveal, whose worst-case animation window is
 * over, and that is still invisible. That only happens if the CSS is not
 * present, is overridden, or is gated the wrong way. That is exactly what
 * the panic switch is for. An element not yet triggered is not stuck. It
 * simply waits its turn, and that shows the system works as intended.
 */
function guard() {
	const now = performance.now();
	const stuck = qsa(document, "[data-anim-state='in']").some((el) => {
		const since = revealedAt.get(el);
		if (since === undefined || now - since < SETTLED_MS) return false;
		// A GROUP is never animated itself. Only its children are. If this
		// function checked the group's own opacity, it would always read 1,
		// and it would miss a whole section stuck hidden.
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
	// Arm the guard FIRST, so it is scheduled no matter what happens next.
	// `data-anim-ready`, the flag that lets the CSS hide anything, goes on
	// only once the observer is active. Before this fix, the flag went on
	// first. If `startObserver` then threw an error, the CSS already held
	// every element hidden, the guard was not yet scheduled, and bundle.js's
	// try/catch swallowed the error. Content stayed hidden forever, at
	// exactly the point this design exists to protect. Now, if the observer
	// fails, the flag comes back off, and the page is simply un-animated.
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
