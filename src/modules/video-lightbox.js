/**
 * Video lightbox: play a showreel card's video in a modal, not in the card.
 *
 * WHY THIS EXISTS SEPARATELY FROM `video.js`. The facade in `video.js` swaps
 * the iframe in over its own poster, which is right when the poster already
 * sits in a 16:9 slot. The showreel card is a 300x300 square inside a
 * draggable carousel, so playing in place would letterbox the video into a
 * square hole and fight the drag. The card opens a dialog instead.
 *
 * WHAT THIS MODULE DOES NOT DO. `dialog.js` already owns the dialog: the
 * browser's `showModal()` gives top-layer rendering, an inert page, focus
 * containment, Escape, and focus return, and `dialog.js` adds close buttons
 * and backdrop dismissal. This module only puts the right iframe in, and
 * takes it out again. Do not reimplement any of that here.
 *
 * Markup contract, authored in the Designer:
 *
 *   <a data-video-lightbox="video-modal"          <!-- target dialog's id -->
 *      data-video-url="https://youtu.be/XXXXXXXXXXX"
 *      data-video-title="Relevant Life explained">
 *     … thumbnail, play button, duration …
 *   </a>
 *
 *   <dialog id="video-modal" data-dialog data-video-dialog>
 *     <div data-dialog-panel>
 *       <button data-dialog-close aria-label="Close">…</button>
 *       <div data-video-frame></div>     <!-- iframe lands here -->
 *     </div>
 *   </dialog>
 *
 * ONE DIALOG, RE-POINTED. Every card targets the same dialog. A dialog per
 * card would put one iframe per video in the DOM, which is the cost the
 * facade pattern exists to avoid. The iframe is built on open and removed on
 * close — removing it is what stops the audio, so the `close` listener is
 * load-bearing, not tidying.
 *
 * The URL may not contain a video, exactly as in `video.js`: it is authored
 * in the Designer and can hold a channel link or an empty string. Those open
 * in a new tab rather than injecting a broken player.
 */

import { qsa, qs } from "../utils/dom.js";
import { youTubeVideoId, buildEmbedUrl } from "./video.js";

/** The dialog a trigger points at, or the only video dialog on the page. */
function dialogFor(trigger) {
  const id = (trigger.getAttribute("data-video-lightbox") || "").trim();
  const target = id
    ? document.getElementById(id)
    : document.querySelector("dialog[data-video-dialog]");
  return target && target.tagName === "DIALOG" ? target : null;
}

/** Where the iframe goes. Falls back to the dialog itself. */
function mountPoint(dialog) {
  return qs(dialog, "[data-video-frame]") || dialog;
}

function clear(dialog) {
  const mount = mountPoint(dialog);
  qsa(mount, "iframe").forEach((frame) => frame.remove());
}

function open(trigger) {
  const url = (trigger.getAttribute("data-video-url") || "").trim();
  const dialog = dialogFor(trigger);

  if (!dialog || typeof dialog.showModal !== "function") {
    console.warn("[el] video-lightbox: no usable <dialog> for this trigger", trigger);
    if (url) window.open(url, "_blank", "noopener");
    return;
  }

  const id = youTubeVideoId(url);
  if (!id) {
    console.warn("[el] video-lightbox: no YouTube video id in data-video-url", url);
    if (url) window.open(url, "_blank", "noopener");
    return;
  }

  // Replace rather than append: a second open must not stack players.
  clear(dialog);

  const frame = document.createElement("iframe");
  frame.className = "video-lightbox_iframe";
  frame.src = buildEmbedUrl(id);
  frame.title = trigger.getAttribute("data-video-title") || "Video";
  frame.setAttribute(
    "allow",
    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
  );
  frame.setAttribute("allowfullscreen", "");

  mountPoint(dialog).appendChild(frame);
  if (!dialog.open) dialog.showModal();
}

function bindTrigger(trigger) {
  if (trigger.getAttribute("data-video-lightbox-bound") === "1") return;
  trigger.setAttribute("data-video-lightbox-bound", "1");

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    open(trigger);
  });
}

function bindDialog(dialog) {
  if (dialog.getAttribute("data-video-dialog-bound") === "1") return;
  dialog.setAttribute("data-video-dialog-bound", "1");

  // Fires for every close path: the close button, the backdrop, and Escape.
  dialog.addEventListener("close", () => clear(dialog));
}

export function initVideoLightbox(root = document) {
  qsa(root, "[data-video-lightbox]").forEach(bindTrigger);
  qsa(root, "dialog[data-video-dialog]").forEach(bindDialog);
}

export default initVideoLightbox;
