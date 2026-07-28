/**
 * Auto-advancing, CSS-backed tabs.
 *
 * The DOM owns all visual state through CSS. This module flips attributes only:
 * `data-state="active"` on the active tab + panel, `data-active` (1-based index)
 * and `data-visible` on the root. Everything else (which panel shows, the
 * cross-fade, the progress bar, the dwell timing) is driven by the scoped CSS in
 * the component's Embed.
 *
 * POSITIONAL CONTRACT — the tabs and panels are Webflow Collection Lists, so
 * per-item attributes cannot be authored in the Designer. There is no
 * `data-tab="single"` / `data-panel="single"` any more: identity is position.
 * Tab N pairs with panel N, and the module stamps state onto the elements
 * themselves so neither the CSS nor the JS hardcodes how many items exist.
 * Adding a fourth Client Type in the CMS needs no code change.
 *
 * Markup contract (see the "who-help" section):
 *   <div data-tabs data-active="1" data-visible="false">
 *     <div data-tablist>                        <!-- Collection List -->
 *       <div>…<span class="who-help_tab-bar"></span></div>   <!-- item 1 -->
 *       …
 *     </div>
 *     <div data-panels>                         <!-- Collection List -->
 *       <div>…</div>                                          <!-- item 1 -->
 *       …
 *     </div>
 *   </div>
 *
 * Tabs and panels are the DIRECT CHILDREN of the two containers, which is what
 * the Collection List renders (`.w-dyn-items` > `.w-dyn-item`). The containers
 * may sit at any depth under the root — Webflow wraps each list in a
 * `display: contents` div.
 *
 * ARIA is applied at runtime for the same reason: roles cannot be set per item
 * on a Collection List.
 *
 * Timing model:
 *   - Motion allowed: the active tab's `.who-help_tab-bar` runs the `tabFill`
 *     CSS animation. We advance on its `animationend`. Off-screen, CSS pauses
 *     the animation (gated on `data-visible`), so the timer only runs while the
 *     section is visible.
 *   - Reduced motion: no CSS animation fires, so we advance with a setInterval
 *     that only ticks while visible.
 */

import { qsa, closestWithin } from "../utils/dom.js";

const DEFAULT_DURATION_MS = 6000;
const reduceMotion = () =>
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let uid = 0;

/** Read `--tab-duration` (e.g. "6s" / "6000ms") off the root; fall back to default. */
function durationFor(root) {
  const raw = getComputedStyle(root).getPropertyValue("--tab-duration").trim();
  if (!raw) return DEFAULT_DURATION_MS;
  if (raw.endsWith("ms")) return parseFloat(raw) || DEFAULT_DURATION_MS;
  if (raw.endsWith("s")) return (parseFloat(raw) || 0) * 1000 || DEFAULT_DURATION_MS;
  return parseFloat(raw) || DEFAULT_DURATION_MS;
}

/** Direct children of the container matching `selector`, in document order. */
function itemsIn(root, selector) {
  const container = root.querySelector(selector);
  return container ? Array.from(container.children) : [];
}

function setupTabs(root) {
  const tabs = itemsIn(root, "[data-tablist]");
  const panels = itemsIn(root, "[data-panels]");

  // Nothing to cycle, or the two lists disagree — leave the DOM untouched so
  // the CSS fail-open path keeps the first panel visible.
  if (tabs.length < 2 || panels.length !== tabs.length) return;

  const group = `who-help-${++uid}`;
  let active = -1;
  let interval = null;

  // --- a11y wiring (once) --------------------------------------------------

  const list = root.querySelector("[data-tablist]");
  if (list) list.setAttribute("role", "tablist");
  tabs.forEach((tab, i) => {
    tab.setAttribute("role", "tab");
    if (!tab.id) tab.id = `${group}-tab-${i + 1}`;
    const panel = panels[i];
    if (!panel.id) panel.id = `${group}-panel-${i + 1}`;
    tab.setAttribute("aria-controls", panel.id);
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
  });

  // --- State ---------------------------------------------------------------

  /** Normalise any integer into a valid index (wraps both directions). */
  const wrap = (i) => ((i % tabs.length) + tabs.length) % tabs.length;

  function setActive(index) {
    const next = wrap(index);
    if (next === active) return;
    active = next;

    root.setAttribute("data-active", String(next + 1));

    tabs.forEach((tab, i) => {
      const on = i === next;
      if (on) tab.setAttribute("data-state", "active");
      else tab.removeAttribute("data-state");
      tab.setAttribute("aria-selected", on ? "true" : "false");
      tab.setAttribute("tabindex", on ? "0" : "-1");
    });

    panels.forEach((panel, i) => {
      if (i === next) panel.setAttribute("data-state", "active");
      else panel.removeAttribute("data-state");
    });
  }

  const advance = () => setActive(active + 1);

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
    if (!closestWithin(root, e.target, "[data-tablist] > *")) return;
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
    const tab = closestWithin(root, e.target, "[data-tablist] > *");
    if (!tab) return;
    const i = tabs.indexOf(tab);
    if (i >= 0) setActive(i);
  });

  root.addEventListener("keydown", (e) => {
    const tab = closestWithin(root, e.target, "[data-tablist] > *");
    if (!tab) return;
    const current = tabs.indexOf(tab);
    if (current < 0) return;
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = wrap(current + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = wrap(current - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setActive(next);
    tabs[next].focus();
  });

  // Seed from the Designer's `data-active` (1-based; anything invalid → first).
  const seed = parseInt(root.getAttribute("data-active"), 10);
  setActive(Number.isFinite(seed) && seed > 0 ? seed - 1 : 0);

  // Tell the CSS that JS owns state now, so it can stop favouring :first-child.
  // Set LAST: until it lands, the fail-open rules keep panel 1 on screen.
  root.setAttribute("data-ready", "");
}

export function initTabs(root = document) {
  qsa(root, "[data-tabs]").forEach(setupTabs);
}

export default initTabs;
