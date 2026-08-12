/**
 * Tabs that advance automatically, backed by CSS.
 *
 * The DOM owns all visual state through CSS. This module only flips
 * attributes: `data-state="active"` on the active tab and panel,
 * `data-active` as a 1-based index, and `data-visible` on the root. The scoped
 * CSS in the component's Embed drives everything else: which panel shows, the
 * cross-fade, the progress bar, the dwell timing.
 *
 * POSITIONAL CONTRACT. Tabs and panels are Webflow Collection Lists, so an
 * author cannot set per-item attributes in the Designer. There is no
 * `data-tab="single"` or `data-panel="single"` any more: identity is position.
 * Tab N pairs with panel N, and state is stamped onto the elements
 * themselves, so neither CSS nor JS hardcodes how many items exist. A fourth
 * Client Type added in the CMS needs no code change.
 *
 * Markup contract. See the "who-help" section:
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
 * the Collection List renders: `.w-dyn-items` > `.w-dyn-item`. The containers
 * can sit at any depth under the root, and Webflow wraps each list in a
 * `display: contents` div.
 *
 * ARIA is applied at runtime for the same reason: an author cannot set roles
 * per item on a Collection List.
 *
 * Timing model:
 *   - Motion allowed: the active tab's `.who-help_tab-bar` runs the `tabFill`
 *     CSS animation and this module advances on its `animationend`. CSS pauses
 *     that animation off-screen, gated on `data-visible`, so the timer only
 *     runs while the section is visible.
 *   - Reduced motion: no CSS animation fires, so advance runs on a
 *     setInterval that only ticks while visible.
 */

import { qsa, closestWithin, reduceMotion } from "../utils/dom.js";

const DEFAULT_DURATION_MS = 6000;

let uid = 0;

/** Read `--tab-duration` off the root, for example "6s" or "6000ms". Fall back to the default. */
function durationFor(root) {
  const raw = getComputedStyle(root).getPropertyValue("--tab-duration").trim();
  if (!raw) return DEFAULT_DURATION_MS;
  if (raw.endsWith("ms")) return parseFloat(raw) || DEFAULT_DURATION_MS;
  if (raw.endsWith("s")) return (parseFloat(raw) || 0) * 1000 || DEFAULT_DURATION_MS;
  return parseFloat(raw) || DEFAULT_DURATION_MS;
}

/** Direct children of the container that matches `selector`, in document order. */
function itemsIn(root, selector) {
  const container = root.querySelector(selector);
  return container ? Array.from(container.children) : [];
}

function setupTabs(root) {
  const tabs = itemsIn(root, "[data-tablist]");
  const panels = itemsIn(root, "[data-panels]");

  // Nothing to cycle, or the two lists disagree. Leave the DOM untouched, so
  // the CSS fail-open path keeps the first panel visible.
  if (tabs.length < 2 || panels.length !== tabs.length) return;

  const group = `who-help-${++uid}`;
  let active = -1;
  let interval = null;

  // --- accessibility (a11y) wiring, once -----------------------------------

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

  /** Normalise any integer into a valid index. This wraps both directions. */
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

  // Seed from the Designer's `data-active` value, a 1-based index.
  // Anything invalid falls back to the first tab.
  const seed = parseInt(root.getAttribute("data-active"), 10);
  setActive(Number.isFinite(seed) && seed > 0 ? seed - 1 : 0);

  // Tell the CSS that JS now owns state, so the CSS no longer needs to
  // favour :first-child. Set this LAST. Until it lands, the fail-open
  // rules keep panel 1 on screen.
  root.setAttribute("data-ready", "");
}

export function initTabs(root = document) {
  qsa(root, "[data-tabs]").forEach(setupTabs);
}

export default initTabs;
