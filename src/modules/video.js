/**
 * Video facade: thumbnail and custom play button, YouTube loaded only on click.
 *
 * This module follows the same contract as the other modules. The DOM owns
 * all visual state through CSS. This module only injects the iframe and
 * flips a single attribute, `data-video-state="playing"`, on the root. The
 * section's scoped Embed CSS drives the play button's fade-out and the
 * iframe's positioning. Nothing here sets inline styles.
 *
 * WHY A FACADE. If this module embeds a YouTube iframe on load, that costs
 * 600kb+ of JS and several third-party requests, before anyone even asks
 * to watch anything. The thumbnail is a plain <img>, so the section costs
 * one image until the click.
 *
 * Markup contract. This module binds on ATTRIBUTES only, `[data-video]` and
 * the `data-video-*` values, never on a class. The one shape it drives is
 * the reusable **Video Facade** component:
 *   <div class="video-facade"
 *        data-video
 *        data-video-url="https://www.youtube.com/watch?v=XXXXXXXXXXX"
 *        data-video-title="What is Key Man Insurance">
 *     <img class="video-facade_thumb" data-video-thumb …>
 *     <button class="video-facade_play" data-video-play type="button" aria-label="…">
 *       <svg …/>
 *       <!-- .video-facade_play-icon -->
 *     </button>
 *   </div>
 *
 * Behaviour:
 *   - If someone clicks the button, or anywhere on the panel, playback
 *     starts.
 *   - This module appends the iframe. The iframe sits ON TOP of the
 *     thumbnail and button. The z-index for this lives in the Embed CSS.
 *     Neither element is removed from the DOM. This keeps the markup the
 *     Designer shows intact, and means a failed iframe leaves the poster
 *     visible instead of a black hole.
 *   - Idempotent: a second click, while the video plays, is a no-op. So
 *     this module never injects the iframe twice, and playback never
 *     restarts.
 *   - This module uses `youtube-nocookie.com`, so nothing is written until
 *     playback.
 *
 * THE URL MAY NOT CONTAIN A VIDEO. `data-video-url` is authored in the
 * Designer, so it can legitimately hold anything: a channel link, a
 * /redirect?… bounce, an empty string. `youTubeVideoId` returns null for
 * those, and this module opens the URL in a new tab. It does not inject a
 * broken player. That is a deliberate fallback, not a silent failure. This
 * module also warns, because a marketing link in a video slot is nearly
 * always a content mistake that someone should see in the console.
 */

import { qsa, qs, closestWithin } from "../utils/dom.js";

/** Optional site-wide default. This module uses it when an instance has no usable URL of its own. */
export const FALLBACK_VIDEO_ID = "";

/**
 * Pull an 11-character YouTube id out of any form an author might paste.
 *
 * This function covers watch?v=, youtu.be/, /embed/, /v/, /shorts/, and a
 * bare id. It deliberately does not try to be clever about /redirect?…&q=…
 * or /@channel URLs. Those have no video in them, and a guess would
 * produce a player for the wrong thing.
 */
export function youTubeVideoId(url) {
  if (!url) return null;
  const value = String(url).trim();
  const fromUrl = value.match(
    /(?:youtu\.be\/|\/embed\/|\/v\/|\/shorts\/|[?&]v=)([A-Za-z0-9_-]{11})/
  );
  if (fromUrl) return fromUrl[1];
  const bare = value.match(/^[A-Za-z0-9_-]{11}$/);
  return bare ? bare[0] : null;
}

function buildEmbedUrl(id) {
  const params = new URLSearchParams({
    autoplay: "1",
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
  });
  return `https://www.youtube-nocookie.com/embed/${id}?${params}`;
}

function play(root) {
  if (root.getAttribute("data-video-state") === "playing") return;

  const url = root.getAttribute("data-video-url") || "";
  const id = youTubeVideoId(url) || FALLBACK_VIDEO_ID;

  if (!id) {
    console.warn("[el] video: no YouTube video id in data-video-url, cannot embed a player", url);
    if (url) window.open(url, "_blank", "noopener");
    return;
  }

  // This class is not a styling contract. The embed CSS matches
  // `[data-video] > iframe` structurally, so this class exists only to
  // help someone find and fix problems.
  const frame = document.createElement("iframe");
  frame.className = "video-facade_iframe";
  frame.src = buildEmbedUrl(id);
  frame.title = root.getAttribute("data-video-title") || "Video";
  frame.setAttribute(
    "allow",
    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
  );
  frame.setAttribute("allowfullscreen", "");

  root.appendChild(frame);
  root.setAttribute("data-video-state", "playing");
}

function setupVideo(root) {
  if (root.getAttribute("data-video-bound") === "1") return;
  root.setAttribute("data-video-bound", "1");

  const button = qs(root, "[data-video-play]");
  if (button && !button.hasAttribute("aria-label")) {
    button.setAttribute("aria-label", "Play video");
  }

  // Delegated: one listener covers the button and the poster around it,
  // and continues to work if someone swaps the thumbnail in the Designer.
  root.addEventListener("click", (e) => {
    if (root.getAttribute("data-video-state") === "playing") return;
    // Ignore clicks that land inside the player once it exists.
    if (closestWithin(root, e.target, "iframe")) return;
    if (closestWithin(root, e.target, "[data-video-play]")) e.preventDefault();
    play(root);
  });
}

export function initVideo(root = document) {
  qsa(root, "[data-video]").forEach(setupVideo);
}

export default initVideo;
