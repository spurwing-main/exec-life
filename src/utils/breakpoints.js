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

export const DESKTOP_MEDIA_QUERY = BREAKPOINT_QUERIES.dsk;

// Backward-compatible alias used by older modules/imports.
export const breakpointQueries = BREAKPOINT_QUERIES;
