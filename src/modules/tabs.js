/**
 * Auto-advancing, CSS-backed tabs.
 *
 * The DOM owns all visual state through CSS. This module only flips a single
 * attribute on the root — `data-active` — and reports on-screen visibility via
 * `data-visible`. Everything else (which panel shows, the cross-fade, the
 * progress bar, and the dwell timing) is driven by the scoped CSS in the
 * component's Embed.
 *
 * Markup contract (see the "who-help" section):
 *   <div data-tabs data-active="single" data-visible="false">
 *     <div role="tablist">
 *       <button data-tab="single" role="tab">…<span class="who-help_tab-bar"></span></button>
 *       …
 *     </div>
 *     <div class="who-help_panels">
 *       <div data-panel="single" role="tabpanel">…</div>
 *       …
 *     </div>
 *   </div>
 *
 * Timing model:
 *   - Motion allowed: the active tab's `.who-help_tab-bar` runs the `tabFill`
 *     CSS animation. We advance on its `animationend`. Off-screen, CSS pauses
 *     the animation (via `[data-visible="false"]`), so the timer only runs while
 *     the section is visible.
 *   - Reduced motion: no CSS animation fires, so we advance with a setInterval
 *     that only ticks while visible.
 */

import { qsa, closestWithin } from "../utils/dom.js";

const DEFAULT_DURATION_MS = 6000;
const reduceMotion = () =>
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Read `--tab-duration` (e.g. "6s" / "6000ms") off the root; fall back to default. */
function durationFor(root) {
  const raw = getComputedStyle(root).getPropertyValue("--tab-duration").trim();
  if (!raw) return DEFAULT_DURATION_MS;
  if (raw.endsWith("ms")) return parseFloat(raw) || DEFAULT_DURATION_MS;
  if (raw.endsWith("s")) return (parseFloat(raw) || 0) * 1000 || DEFAULT_DURATION_MS;
  return parseFloat(raw) || DEFAULT_DURATION_MS;
}

function setupTabs(root) {
  const tabs = qsa(root, "[data-tab]");
  if (tabs.length < 2) return;

  const ids = tabs.map((t) => t.getAttribute("data-tab"));
  let interval = null;

  const indexOfActive = () => Math.max(0, ids.indexOf(root.getAttribute("data-active")));

  function setActive(id) {
    if (!id || root.getAttribute("data-active") === id) return;
    root.setAttribute("data-active", id);
    tabs.forEach((tab) => {
      const selected = tab.getAttribute("data-tab") === id;
      tab.setAttribute("aria-selected", selected ? "true" : "false");
      tab.setAttribute("tabindex", selected ? "0" : "-1");
    });
  }

  function advance() {
    setActive(ids[(indexOfActive() + 1) % ids.length]);
  }

  // --- Timer engines -------------------------------------------------------

  function startInterval() {
    if (interval) return;
    interval = window.setInterval(advance, durationFor(root));
  }
  function stopInterval() {
    if (!interval) return;
    window.clearInterval(interval);
    interval = null;
  }

  // Motion path: advance when the active bar's fill animation ends.
  root.addEventListener("animationend", (e) => {
    if (e.animationName !== "tabFill") return;
    if (!e.target.closest("[data-tab]")) return;
    if (root.getAttribute("data-visible") !== "true") return;
    advance();
  });

  // --- Visibility gating ---------------------------------------------------

  const onVisibilityChange = (visible) => {
    root.setAttribute("data-visible", visible ? "true" : "false");
    if (!reduceMotion()) return; // motion path is gated purely by CSS pause
    if (visible) startInterval();
    else stopInterval();
  };

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((entry) => onVisibilityChange(entry.isIntersecting)),
      { threshold: 0.35 }
    );
    io.observe(root);
  } else {
    onVisibilityChange(true); // no observer support → always run
  }

  // --- Input ---------------------------------------------------------------

  root.addEventListener("click", (e) => {
    const tab = closestWithin(root, e.target, "[data-tab]");
    if (tab) setActive(tab.getAttribute("data-tab"));
  });

  root.addEventListener("keydown", (e) => {
    const tab = closestWithin(root, e.target, "[data-tab]");
    if (!tab) return;
    const current = ids.indexOf(tab.getAttribute("data-tab"));
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (current + 1) % ids.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (current - 1 + ids.length) % ids.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = ids.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setActive(ids[next]);
    tabs[next].focus();
  });

  // Ensure a valid initial active state.
  setActive(root.getAttribute("data-active") || ids[0]);
}

export function initTabs(root = document) {
  qsa(root, "[data-tabs]").forEach(setupTabs);
}

export default initTabs;
