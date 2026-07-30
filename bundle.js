// Exec-Life client bundle — entry point.
//
// Imports each feature module and boots it. One file per feature under
// src/modules/; shared helpers live under src/utils/.
//
// FEATURE FLAGS
// Every module is registered here against a flag name from the loader's FEATURES
// registry, and only boots if that flag is on. So a module is turned off by
// flipping a toggle in the dev panel (or ?off=<name>), never by commenting code
// out. The matching CSS in Webflow gates on `html[data-el-on~="<name>"]`, which
// the loader sets before this file runs — so the CSS half switches off too, and
// there is nothing to comment out there either. See README "Feature flags".
//
// Each module is still registered on window.el.functions regardless of its flag,
// so it can be re-run by hand (e.g. after a CMS load) or poked at in the console
// even while switched off.

import { BREAKPOINT_PX, BREAKPOINT_QUERIES } from "./src/utils/breakpoints.js";
import { initTabs } from "./src/modules/tabs.js";
import { initNav } from "./src/modules/nav.js";
import { initCarousels } from "./src/modules/carousel.js";
import { initFaq } from "./src/modules/faq.js";
import { initAnim } from "./src/modules/anim.js";
import { initVideo } from "./src/modules/video.js";
import { initCalc } from "./src/modules/calc.js";

const el = (window.el = window.el || {});
el.functions = el.functions || {};
el.defs = el.defs || {};

el.defs.breakpoints = BREAKPOINT_PX;
el.defs.breakpointQueries = BREAKPOINT_QUERIES;

el.functions.initTabs = initTabs;
el.functions.initNav = initNav;
el.functions.initCarousels = initCarousels;
el.functions.initFaq = initFaq;
el.functions.initAnim = initAnim;
el.functions.initVideo = initVideo;
el.functions.initCalc = initCalc;

/**
 * flag → init. Order matters: `anim` runs first because it is the only module
 * that hides anything, so it should be revealing content before anything else
 * has a chance to throw.
 */
const MODULES = [
  ["anim", initAnim],
  ["tabs", initTabs],
  ["nav", initNav],
  ["carousels", initCarousels],
  ["faq", initFaq],
  ["video", initVideo],
  ["calc", initCalc],
];

/**
 * Boot each module in isolation, and only if its flag is on.
 *
 * The try/catch matters most for `anim`: it briefly hides content and then
 * reveals it, so if an unrelated module (a carousel on a page that has none, say)
 * threw first, headings could stay hidden site-wide.
 *
 * An unknown flag defaults to ON, so a module added here before an updated loader
 * ships is never silently dead.
 */
function bootAll() {
  MODULES.forEach(([name, init]) => {
    if (el.flags && !el.flags.enabled(name)) {
      console.info(`[el] ${name} off (feature flag)`);
      return;
    }
    try {
      init();
    } catch (error) {
      console.error(`[el] ${name} failed to init`, error);
    }
  });

  document.documentElement.classList.add("el-ready");
}

/**
 * WAIT FOR THE DOM. This is not boilerplate — booting early silently breaks
 * every module.
 *
 * The loader appends this bundle as `<script type="module">` the moment its
 * LocalCan probe resolves, which can be part-way through parsing the body. A
 * module script then runs as soon as it is fetched, so `document` may only
 * contain the first section or two. Every module here queries the document once
 * at init, so anything further down the page simply does not exist yet and is
 * never wired up: on the homepage that meant one of eight headings got its reveal
 * and the rest were skipped, and the same applies to any FAQ, carousel or tab
 * group below the fold.
 *
 * It failed quietly — no error, just a page where the top works and the bottom
 * doesn't — which is exactly the shape of bug worth a comment this long.
 */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootAll, { once: true });
} else {
  bootAll();
}
