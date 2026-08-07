// Exec-Life client bundle: entry point.
//
// Imports each feature module and boots it. One file per feature lives under
// src/modules/. Shared helpers live under src/utils/.
//
// FEATURE FLAGS
// Every module is registered here against a flag name from the loader's
// FEATURES registry. A module boots only if its flag is on.
//
// To turn a module off, flip a toggle in the dev panel, or add ?off=<name> to
// the URL. Never comment the code out. The matching CSS in Webflow gates on
// `html[data-el-on~="<name>"]`, and the loader sets that attribute before
// this file runs. So the CSS turns off too, and there is nothing to comment
// out on that side either. See README "Feature flags".
//
// Each module stays registered on window.el.functions even when its flag is
// off. You can still run a module by hand, for example after a CMS load. You
// can also call it from the console.

import { BREAKPOINT_PX, BREAKPOINT_QUERIES } from "./src/utils/breakpoints.js";
import { initTabs } from "./src/modules/tabs.js";
import { initNav } from "./src/modules/nav.js";
import { initCarousels } from "./src/modules/carousel.js";
import { initFaq } from "./src/modules/faq.js";
import { initAnim } from "./src/modules/anim.js";
import { initVideo } from "./src/modules/video.js";
import { initCalc } from "./src/modules/calc.js";
import { initInsightsToc } from "./src/modules/insights-toc.js";
import { initInsurerSort } from "./src/modules/insurer-sort.js";

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
el.functions.initInsightsToc = initInsightsToc;
el.functions.initInsurerSort = initInsurerSort;

/**
 * Maps each flag to its init function. Order matters: `anim` runs first
 * because it is the only module that hides content. It must reveal that
 * content before any later module has a chance to throw.
 */
const MODULES = [
  ["anim", initAnim],
  ["tabs", initTabs],
  ["nav", initNav],
  ["carousels", initCarousels],
  ["faq", initFaq],
  ["video", initVideo],
  ["calc", initCalc],
  ["insights-toc", initInsightsToc],
  ["insurer-sort", initInsurerSort],
];

/**
 * Boot each module on its own, and only if its flag is on.
 *
 * The try/catch matters most for `anim`. It briefly hides content and then
 * reveals it. If an unrelated module threw first, for example the carousel
 * module on a page with no carousel, headings could stay hidden site-wide.
 *
 * An unknown flag defaults to ON. So a module added here before an updated
 * loader ships is never silently dead.
 */
function bootAll() {
  MODULES.forEach(([name, init]) => {
    if (el.flags && !el.flags.enabled(name)) {
      if (el.boot?.devMode) console.info(`[el] ${name} off (feature flag)`);
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
 * WAIT FOR THE DOM. This is not boilerplate. If you boot early, every module
 * breaks, and it fails silently.
 *
 * The loader appends this bundle as `<script type="module">` the moment its
 * LocalCan probe resolves. That can happen before the body is fully parsed. A
 * module script then runs as soon as it is fetched, so `document` may
 * contain only the first section or two. Every module here queries the
 * document once, at init, so anything further down the page does not exist
 * yet and is never wired up: on the homepage, that meant only one of eight
 * headings got its reveal. The rest were skipped. The same problem applies to
 * any FAQ, carousel, or tab group below the fold.
 *
 * It failed quietly: no error, just a page where the top half worked and the
 * bottom half did not. That is exactly the kind of bug worth a comment this
 * long.
 */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootAll, { once: true });
} else {
  bootAll();
}
