/**
 * FAQ accordion — open / close behaviour.
 *
 * Same contract as the other modules: the DOM owns all visual state through
 * CSS, and this module only flips a single attribute — `data-open` — on each
 * item (plus the matching `aria-expanded` on its toggle). The card fade, the
 * panel expand (grid-template-rows 0fr→1fr) and the +/− icon are all driven by
 * the section's scoped Embed CSS; nothing here measures or animates heights.
 *
 * Markup contract (see the "faq" section):
 *   <div class="faq_list" data-faq>            <!-- data-faq="multi" to allow many open -->
 *     <div class="faq_item" data-faq-item data-open="true|false">
 *       <button class="faq_toggle" data-faq-toggle aria-expanded="…">…</button>
 *       <div class="faq_panel" data-faq-panel>…</div>
 *     </div>
 *     …
 *   </div>
 *
 * Behaviour:
 *   - Single-open by default: opening one item closes its siblings. Add
 *     `data-faq="multi"` to the root to let items open independently.
 *   - Add `data-faq-breakpoints="mbl,mbp"` to make the accordion interactive
 *     only at those breakpoints. Outside them every item is open and static.
 *     Supported names come from the shared breakpoint map: dsk, tab, mbl, mbp.
 *   - The first item opens on load when the markup marks nothing open. This
 *     matters because the list is a CMS Collection List: every item is stamped
 *     from ONE template, so `data-open` is necessarily identical on all of them
 *     and cannot single out the first. Authoring an explicit `data-open="true"`
 *     still wins, and `data-faq-open="none"` on the root opts out entirely.
 *   - Toggles are real <button>s, so Enter/Space and focus come for free; we
 *     add ArrowUp/Down/Home/End roving focus across the headers.
 *   - a11y wiring (ids, aria-controls, aria-labelledby, role=region) is applied
 *     at init so the markup stays clean.
 */

import { BREAKPOINT_QUERIES } from "../utils/breakpoints.js";
import { qsa, qs, closestWithin } from "../utils/dom.js";

let uid = 0;

function parseBreakpoints(value) {
  if (!value) return [];

  return value
    .split(",")
    .map((breakpoint) => breakpoint.trim().toLowerCase())
    .filter((breakpoint) => breakpoint in BREAKPOINT_QUERIES);
}

function setupFaq(root) {
  const items = qsa(root, "[data-faq-item]").filter((item) => item.closest("[data-faq]") === root);
  if (!items.length) return;

  const allowMulti = root.getAttribute("data-faq") === "multi";
  const activeBreakpoints = parseBreakpoints(root.getAttribute("data-faq-breakpoints"));
  const mediaQueries = activeBreakpoints.map((breakpoint) =>
    window.matchMedia(BREAKPOINT_QUERIES[breakpoint])
  );
  const group = `faq-${(uid += 1)}`;

  const entries = items
    .map((item, i) => {
      const toggle = qs(item, "[data-faq-toggle]");
      const panel = qs(item, "[data-faq-panel]");
      if (!toggle || !panel) return null;

      // a11y wiring
      const toggleId = toggle.id || `${group}-t${i}`;
      const panelId = panel.id || `${group}-p${i}`;
      toggle.id = toggleId;
      panel.id = panelId;
      toggle.setAttribute("aria-controls", panelId);
      if (!panel.hasAttribute("role")) panel.setAttribute("role", "region");
      panel.setAttribute("aria-labelledby", toggleId);

      return { item, toggle, panel };
    })
    .filter(Boolean);

  if (!entries.length) return;

  const toggles = entries.map((e) => e.toggle);
  let isActive = null;

  function setOpen(entry, open) {
    entry.item.setAttribute("data-open", open ? "true" : "false");
    entry.toggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  // Capture the authored state before a static breakpoint forces everything
  // open. This is the state restored whenever the accordion becomes active.
  const initialOpen = entries.map((entry) => entry.item.getAttribute("data-open") === "true");

  // A Collection List stamps every item from one template, so `data-open` is
  // the same on all of them — either nothing is open or (in multi mode) all of
  // them are. Fall back to opening the first so the section never lands closed.
  const openCount = initialOpen.filter(Boolean).length;

  if (openCount === 0 && root.getAttribute("data-faq-open") !== "none") {
    initialOpen[0] = true;
  } else if (openCount > 1 && !allowMulti) {
    // Single-open mode can't honour a template that opened everything.
    initialOpen.forEach((_, i) => {
      initialOpen[i] = i === 0;
    });
  }

  function evaluateBreakpointState() {
    const shouldBeActive = mediaQueries.length === 0 || mediaQueries.some((query) => query.matches);
    if (shouldBeActive === isActive) return;

    isActive = shouldBeActive;
    root.setAttribute("data-faq-active", shouldBeActive ? "true" : "false");

    entries.forEach((entry, i) => {
      if (shouldBeActive) {
        setOpen(entry, initialOpen[i]);
      } else {
        // Inactive means ordinary static content: fully open, with no
        // expandable-state announcement and no click/keyboard behaviour.
        entry.item.setAttribute("data-open", "true");
        entry.toggle.removeAttribute("aria-expanded");
      }
    });
  }

  function activate(entry) {
    if (!isActive) return;
    const isOpen = entry.item.getAttribute("data-open") === "true";
    if (!allowMulti && !isOpen) {
      entries.forEach((other) => other !== entry && setOpen(other, false));
    }
    setOpen(entry, !isOpen);
  }

  root.addEventListener("click", (e) => {
    const toggle = closestWithin(root, e.target, "[data-faq-toggle]");
    if (!toggle) return;
    const entry = entries.find((x) => x.toggle === toggle);
    if (entry) activate(entry);
  });

  // Roving focus across the headers (buttons already handle Enter/Space).
  root.addEventListener("keydown", (e) => {
    if (!isActive) return;
    const toggle = closestWithin(root, e.target, "[data-faq-toggle]");
    if (!toggle) return;
    const current = toggles.indexOf(toggle);
    if (current < 0) return;
    let next = -1;
    if (e.key === "ArrowDown") next = (current + 1) % toggles.length;
    else if (e.key === "ArrowUp") next = (current - 1 + toggles.length) % toggles.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = toggles.length - 1;
    if (next < 0) return;
    e.preventDefault();
    toggles[next].focus();
  });

  mediaQueries.forEach((query) => query.addEventListener("change", evaluateBreakpointState));
  evaluateBreakpointState();
}

export function initFaq(root = document) {
  qsa(root, "[data-faq]").forEach(setupFaq);
}

export default initFaq;
