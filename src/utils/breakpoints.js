/**
 * Single source of truth for the site's breakpoints. Mirrors Webflow's own
 * breakpoints so JS reasons about the same boundaries the Designer does. Exposed
 * on `window.el.defs` (see bundle.js) for inline scripts / debugging; modules
 * that need a breakpoint read it from here rather than hard-coding widths.
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
