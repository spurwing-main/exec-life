/**
 * FAQ accordion: open and close behaviour.
 *
 * This module follows the same contract as the other modules. The DOM owns
 * all visual state through CSS. This module flips a single attribute,
 * `data-open`, on each item, plus the `aria-expanded` that matches it, on
 * its toggle. The card fade and the plus-or-minus icon are driven by the
 * section's scoped Embed CSS.
 *
 * The one exception is the panel height, and it is deliberate. EXE-72: the
 * reveal used to be a CSS grid track, from 0fr to 1fr, with no JS. That makes
 * the engine size the grid again on each frame, across the container and its
 * contents, and iOS Safari showed it as a shimmer in the answer text and the
 * icon. Removing the fade and the icon rotation did not stop it, so the
 * mechanism was at fault, not those properties. A px height on a normal box is
 * a far cheaper layout, so this module now measures the answer and sets the two
 * height values. The CSS still owns the duration and the curve.
 *
 * With no JS every panel keeps its natural height, so each answer stays
 * readable.
 *
 * Markup contract. See the "faq" section:
 *   <div class="faq_list" data-faq>            <!-- data-faq="multi" to allow many open -->
 *     <div class="faq_item" data-faq-item data-open="true|false">
 *       <button class="faq_toggle" data-faq-toggle aria-expanded="…">…</button>
 *       <div class="faq_panel" data-faq-panel>…</div>
 *     </div>
 *     …
 *   </div>
 *
 * Behaviour:
 *   - Single-open by default. If you open one item, its siblings close.
 *     Add `data-faq="multi"` to the root to let items open independently.
 *   - Add `data-faq-breakpoints="mbl,mbp"` to make the accordion interactive
 *     only at those breakpoints. Outside them, every item is open and static.
 *     Supported names come from the shared breakpoint map: dsk, tab, mbl, mbp.
 *   - The first item opens on load when the markup marks nothing open. This
 *     matters because the list is a CMS Collection List. The Collection
 *     List stamps every item from ONE template, so `data-open` is
 *     necessarily identical on all of them, and it cannot single out the
 *     first. An explicit `data-open="true"` in the markup still wins, and
 *     `data-faq-open="none"` on the root opts out entirely.
 *   - Toggles are real <button>s, so Enter, Space, and focus all come for
 *     free. This module adds roving focus across the headers. It uses
 *     ArrowUp, ArrowDown, Home, and End.
 *   - This module applies accessibility (a11y) wiring at init: ids,
 *     aria-controls, aria-labelledby, and role=region. This keeps the
 *     markup clean.
 */

import { BREAKPOINT_QUERIES } from "../utils/breakpoints.js";
import { qsa, qs, closestWithin, reduceMotion } from "../utils/dom.js";

let uid = 0;

/**
 * Set a panel's height, and animate it when asked.
 *
 * The CSS holds both resting states: height 0 when closed, auto when
 * [data-open]. This function sets an inline px height only WHILE the panel
 * moves, and clears it at the end. Two reasons to hand the resting states back:
 * the answer then stays hidden when no JS runs, which is what the Designer
 * canvas shows, and an open panel returns to `auto`, so it cannot clip after a
 * resize, a font swap or a rich-text reflow.
 *
 * `auto` cannot be a transition end point, which is why the travel needs a
 * measured px value at all.
 *
 * Reading getBoundingClientRect for the start value is what makes a mid-flight
 * reversal smooth: it returns the CURRENT interpolated height, so a second tap
 * turns the panel around from where it is, not from where it started.
 */
function setPanelHeight(entry, open, animate) {
  const { panel, inner } = entry;

  if (!animate) {
    panel.style.transition = "none";
    panel.style.height = "";
    void panel.offsetHeight; // commit it before the transition returns
    panel.style.transition = "";
    return;
  }

  const from = panel.getBoundingClientRect().height;
  const to = open ? inner.getBoundingClientRect().height : 0;
  panel.style.height = `${from}px`;
  void panel.offsetHeight; // commit the start value, else the browser sees one change
  panel.style.height = `${to}px`;

  const settle = (event) => {
    if (event && event.propertyName !== "height") return;
    panel.removeEventListener("transitionend", settle);
    // Clearing the inline value returns the panel to the CSS state, which the
    // current [data-open] already describes. So a listener left over from an
    // earlier tap cannot put back a height that no longer applies.
    panel.style.height = "";
  };
  panel.addEventListener("transitionend", settle);
}

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

      // The answer keeps its natural height, and the panel clips it, so measure
      // the inner and never the panel.
      const inner = panel.firstElementChild || panel;

      return { item, toggle, panel, inner };
    })
    .filter(Boolean);

  if (!entries.length) return;

  const toggles = entries.map((e) => e.toggle);
  let isActive = null;

  function setOpen(entry, open, animate = true) {
    entry.item.setAttribute("data-open", open ? "true" : "false");
    entry.toggle.setAttribute("aria-expanded", open ? "true" : "false");
    setPanelHeight(entry, open, animate && !reduceMotion());
  }

  // Capture the authored state before a static breakpoint forces everything
  // open. This is the state to restore whenever the accordion becomes active.
  const initialOpen = entries.map((entry) => entry.item.getAttribute("data-open") === "true");

  // A Collection List stamps every item from one template, so `data-open`
  // is the same on all of them: either nothing is open, or, in multi mode,
  // all of them are. As a fallback, open the first item, so the section
  // never lands fully closed.
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

    // Neither the first run nor a breakpoint change is a person opening an item,
    // so both set the height at once, with no animation.
    entries.forEach((entry, i) => {
      if (shouldBeActive) {
        setOpen(entry, initialOpen[i], false);
      } else {
        // Inactive means ordinary static content. It is fully open, with no
        // expandable-state announcement and no click or keyboard behaviour.
        entry.item.setAttribute("data-open", "true");
        entry.toggle.removeAttribute("aria-expanded");
        setPanelHeight(entry, true, false);
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

  // Roving focus across the headers. Buttons already handle Enter and Space.
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
