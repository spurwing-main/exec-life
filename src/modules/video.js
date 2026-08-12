/**
 * Video facade: thumbnail and custom play button, YouTube loaded only on click.
 *
 * Same contract as the other modules: the DOM owns all visual state through
 * CSS. This only injects the iframe and flips one attribute,
 * `data-video-state="playing"`, on the root. The section's scoped Embed CSS
 * drives the play button's fade-out and the iframe's positioning. No inline
 * styles here.
 *
 * WHY A FACADE. A YouTube iframe embedded on load costs 600kb+ of JS and
 * several third-party requests before anyone asks to watch anything. The
 * thumbnail is a plain <img>, so the section costs one image until the click.
 *
 * Markup contract. Binds on ATTRIBUTES only, `[data-video]` and the
 * `data-video-*` values, never on a class. The one shape it drives is the
 * reusable **Video Facade** component:
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
 *   - A click on the button, or anywhere on the panel, starts playback.
 *   - The iframe is appended ON TOP of the thumbnail and button, with the
 *     z-index in the Embed CSS. Neither element is removed from the DOM, which
 *     keeps the markup the Designer shows intact and leaves the poster visible
 *     instead of a black hole if the iframe fails.
 *   - Idempotent: a second click during playback is a no-op, so the iframe is
 *     never injected twice and playback never restarts.
 *   - Uses `youtube-nocookie.com`, so nothing is written until playback.
 *
 * THE URL MAY NOT CONTAIN A VIDEO. `data-video-url` is authored in the
 * Designer, so it can legitimately hold a channel link, a /redirect?… bounce,
 * or an empty string. `youTubeVideoId` returns null for those and the URL
 * opens in a new tab rather than injecting a broken player. That is a
 * deliberate fallback, not a silent failure, and it warns: a marketing link in
 * a video slot is nearly always a content mistake someone should see.
 */

import { qsa, qs, closestWithin } from "../utils/dom.js";

/** Optional site-wide default, used when an instance has no usable URL. */
export const FALLBACK_VIDEO_ID = "";

/**
 * Pull an 11-character YouTube id out of any form an author might paste.
 *
 * Covers watch?v=, youtu.be/, /embed/, /v/, /shorts/ and a bare id. It
 * deliberately does not try to be clever about /redirect?…&q=… or /@channel
 * URLs: those contain no video, and a guess would produce a player for the
 * wrong thing.
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

  // Not a styling contract. The embed CSS matches `[data-video] > iframe`
  // structurally, so this class exists only to help someone debug.
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

  // Delegated: one listener covers the button and the poster around it, and
  // keeps working if someone swaps the thumbnail in the Designer.
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
