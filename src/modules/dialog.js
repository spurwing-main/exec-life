/**
 * Native modal dialogs: open buttons, close buttons, and backdrop dismissal.
 *
 * The browser owns the difficult parts through `<dialog>.showModal()`:
 * top-layer rendering, an inert page, focus containment, Escape-to-close, and
 * returning focus to the invoker. This module deliberately does not recreate
 * any of those behaviours.
 *
 * Markup contract (authored in the Designer):
 *   <button type="button" data-dialog-open="life-rate-info">…</button>
 *
 *   <dialog id="life-rate-info" data-dialog aria-labelledby="life-rate-title">
 *     <div data-dialog-panel>              <!-- optional; see backdrop note -->
 *       <button type="button" data-dialog-close aria-label="Close">…</button>
 *       <h2 id="life-rate-title">Life payout rate</h2>
 *       …
 *     </div>
 *   </dialog>
 *
 * `data-dialog-panel` is optional. Use it when the `<dialog>` itself is a
 * transparent/full-screen positioning wrapper and a child is the visible
 * modal surface. Backdrop clicks are tested against that child's bounds. If
 * it is absent, the `<dialog>` box itself is treated as the visible surface.
 *
 * CSS owns every visual: the panel, `dialog::backdrop`, `[open]` states and
 * any entry/exit motion. The module writes no styles and no animation timing.
 */

import { qsa, qs, closestWithin } from "../utils/dom.js";

function pointIsOutside(element, event) {
  const rect = element.getBoundingClientRect();
  return (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  );
}

function closeDialog(dialog) {
  if (dialog.open && typeof dialog.close === "function") dialog.close();
}

function setupDialog(dialog) {
  if (dialog.getAttribute("data-dialog-bound") === "1") return;
  dialog.setAttribute("data-dialog-bound", "1");

  dialog.addEventListener("click", (event) => {
    const closeButton = closestWithin(dialog, event.target, "[data-dialog-close]");
    if (closeButton) {
      event.preventDefault();
      closeDialog(dialog);
      return;
    }

    // `::backdrop` is not a DOM node. Browsers retarget its click to the
    // dialog, so coordinates are needed to distinguish a real backdrop click
    // from a click on blank space or padding inside the visible modal.
    if (event.target !== dialog) return;
    const panel = qs(dialog, "[data-dialog-panel]") || dialog;
    if (pointIsOutside(panel, event)) closeDialog(dialog);
  });

  qsa(dialog, "[data-dialog-close]").forEach((button) => {
    if (button.tagName === "BUTTON" && !button.hasAttribute("type")) {
      button.setAttribute("type", "button");
    }
  });
}

function setupOpenButton(button) {
  if (button.getAttribute("data-dialog-open-bound") === "1") return;
  button.setAttribute("data-dialog-open-bound", "1");

  const targetId = (button.getAttribute("data-dialog-open") || "").trim();
  if (targetId) {
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-controls", targetId);
  }

  if (button.tagName === "BUTTON" && !button.hasAttribute("type")) {
    button.setAttribute("type", "button");
  }

  button.addEventListener("click", (event) => {
    event.preventDefault();

    const dialog = targetId ? document.getElementById(targetId) : null;
    if (!dialog || dialog.tagName !== "DIALOG") {
      console.warn(`[el] dialog: no <dialog> found with id="${targetId}"`);
      return;
    }

    if (dialog.open) return;
    if (typeof dialog.showModal !== "function") {
      console.warn("[el] dialog: HTMLDialogElement.showModal() is unavailable");
      return;
    }

    dialog.showModal();
  });
}

export function initDialogs(root = document) {
  qsa(root, "dialog[data-dialog]").forEach(setupDialog);
  qsa(root, "[data-dialog-open]").forEach(setupOpenButton);
}

export default initDialogs;
