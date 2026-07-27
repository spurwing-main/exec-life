// Exec-Life client bundle — entry point.
//
// Imports each feature module and boots it. One file per feature under
// src/modules/; shared helpers live under src/utils/. Register each module on
// window.el.functions (so it can be re-run manually, e.g. after CMS load) and
// boot it below.

import { BREAKPOINT_PX, BREAKPOINT_QUERIES } from "./src/utils/breakpoints.js";
import { initTabs } from "./src/modules/tabs.js";
import { initNav } from "./src/modules/nav.js";
import { initCarousels } from "./src/modules/carousel.js";
import { initFaq } from "./src/modules/faq.js";
import { initAnim } from "./src/modules/anim.js";

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

/**
 * Boot each module in isolation.
 *
 * Every module here is independent, so one throwing must not stop the rest. That
 * matters most for `initAnim`: the reveal system briefly hides content and then
 * reveals it, so if an unrelated module (a carousel on a page that has none, say)
 * threw first, headings would stay hidden site-wide. Hence the try/catch, and
 * hence anim boots FIRST.
 */
function boot(name, fn) {
  try {
    fn();
  } catch (error) {
    console.error(`[el] ${name} failed to init`, error);
  }
}

boot("anim", initAnim);
boot("tabs", initTabs);
boot("nav", initNav);
boot("carousels", initCarousels);
boot("faq", initFaq);

document.documentElement.classList.add("el-ready");
