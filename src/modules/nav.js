/**
 * Auto hide/show nav on scroll — CSS-backed (JS only flips one attribute).
 *
 * Behaviour:
 *   - Within the top threshold (default 100vh): always shown.
 *   - Past the threshold: hide when scrolling down, show when scrolling up.
 *
 * The JS only sets `data-nav-hidden="true|false"` on the nav element; the
 * transform + transition live in CSS (see the header Embed), mirroring the
 * tabs module's contract.
 *
 * Markup contract: put `data-nav` on the fixed/sticky nav bar. Optional
 * `data-nav-threshold` overrides the reveal zone ("100vh", "80vh", or px).
 */

import { qsa } from "../utils/dom.js";

const MOVE_DELTA = 6; // px of travel before we react (ignores jitter)

function thresholdPx(nav) {
  const raw = (nav.getAttribute("data-nav-threshold") || "").trim();
  if (!raw) return window.innerHeight;
  if (raw.endsWith("vh")) return (parseFloat(raw) / 100) * window.innerHeight || window.innerHeight;
  return parseFloat(raw) || window.innerHeight;
}

function setupNav(nav) {
  let lastY = window.scrollY || window.pageYOffset;
  let ticking = false;

  const update = () => {
    ticking = false;
    const y = window.scrollY || window.pageYOffset;

    if (y <= thresholdPx(nav)) {
      nav.setAttribute("data-nav-hidden", "false");
    } else if (Math.abs(y - lastY) > MOVE_DELTA) {
      nav.setAttribute("data-nav-hidden", y > lastY ? "true" : "false");
    }
    lastY = y;
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  update();
}

export function initNav(root = document) {
  qsa(root, "[data-nav]").forEach(setupNav);
}

export default initNav;
