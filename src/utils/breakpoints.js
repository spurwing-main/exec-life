/**
 * Single source of truth for the site's breakpoints. It mirrors Webflow's own
 * breakpoints, so JS reasons about the same boundaries as the Designer. It is
 * exposed on `window.el.defs` for inline scripts and for debugging; bundle.js
 * sets this up. A module that needs a breakpoint must read it from here. Do
 * not hard-code a width.
 */
export const BREAKPOINT_PX = Object.freeze({
	desktopMin: 992,
	tabletMin: 768,
	mobileLandscapeMin: 480,
});

export const BREAKPOINT_QUERIES = Object.freeze({
	dsk: `(min-width: ${BREAKPOINT_PX.desktopMin}px)`,
	tab: `(min-width: ${BREAKPOINT_PX.tabletMin}px) and (max-width: ${BREAKPOINT_PX.desktopMin - 1}px)`,
	mbl: `(min-width: ${BREAKPOINT_PX.mobileLandscapeMin}px) and (max-width: ${BREAKPOINT_PX.tabletMin - 1}px)`,
	mbp: `(max-width: ${BREAKPOINT_PX.mobileLandscapeMin - 1}px)`,
});
