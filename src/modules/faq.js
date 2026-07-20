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
 *   - Toggles are real <button>s, so Enter/Space and focus come for free; we
 *     add ArrowUp/Down/Home/End roving focus across the headers.
 *   - a11y wiring (ids, aria-controls, aria-labelledby, role=region) is applied
 *     at init so the markup stays clean.
 */

import { qsa, qs, closestWithin } from "../utils/dom.js";

let uid = 0;

function setupFaq(root) {
  const items = qsa(root, "[data-faq-item]").filter((item) => item.closest("[data-faq]") === root);
  if (!items.length) return;

  const allowMulti = root.getAttribute("data-faq") === "multi";
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

  const toggles = entries.map((e) => e.toggle);

  function setOpen(entry, open) {
    entry.item.setAttribute("data-open", open ? "true" : "false");
    entry.toggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  // Normalise initial state from the markup's data-open.
  entries.forEach((entry) => setOpen(entry, entry.item.getAttribute("data-open") === "true"));

  function activate(entry) {
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
}

export function initFaq(root = document) {
  qsa(root, "[data-faq]").forEach(setupFaq);
}

export default initFaq;
