/**
 * Video facade — thumbnail + custom play button, YouTube loaded only on click.
 *
 * Same contract as the other modules: the DOM owns all visual state through CSS,
 * and this module only injects the iframe and flips a single attribute —
 * `data-video-state="playing"` — on the root. The play button's fade-out and the
 * iframe's positioning are driven by the section's scoped Embed CSS; nothing here
 * sets inline styles.
 *
 * WHY A FACADE. Embedding a YouTube iframe on load costs ~600kb+ of JS and several
 * third-party requests before anyone has asked to watch anything. The thumbnail is
 * a plain <img>, so the section costs one image until the click.
 *
 * Markup contract (see the "Service About" component):
 *   <div class="about-service_media"
 *        data-video
 *        data-video-url="https://www.youtube.com/watch?v=XXXXXXXXXXX"
 *        data-video-title="What is Key Man Insurance">
 *     <img class="about-service_video-thumb" data-video-thumb …>
 *     <button class="about-service_video-play" data-video-play type="button" aria-label="…">
 *       <svg …/>
 *     </button>
 *   </div>
 *
 * Behaviour:
 *   - Clicking the button, or anywhere on the panel, starts playback.
 *   - The iframe is appended and sits ON TOP of the thumbnail and button (z-index
 *     in the Embed CSS); neither is removed from the DOM. This keeps the markup
 *     the Designer shows intact, and means a failed iframe leaves the poster
 *     visible rather than a black hole.
 *   - Idempotent: a second click while playing is a no-op, so the iframe can
 *     never be injected twice (and playback is never restarted).
 *   - `youtube-nocookie.com` is used so nothing is written until playback.
 *
 * THE URL MAY NOT CONTAIN A VIDEO. `data-video-url` is authored in the Designer,
 * so it can legitimately hold anything — a channel link, a /redirect?… bounce, an
 * empty string. `youTubeVideoId` returns null for those and we open the URL in a
 * new tab instead of injecting a broken player. That is a deliberate fallback, not
 * a silent failure: it also warns, because a marketing link sitting in a video
 * slot is nearly always a content mistake worth seeing in the console.
 */

import { qsa, qs, closestWithin } from "../utils/dom.js";

/** Optional site-wide default, used when an instance has no usable URL of its own. */
export const FALLBACK_VIDEO_ID = "";

/**
 * Pull an 11-character YouTube id out of any of the forms an author might paste.
 *
 * Covers watch?v=, youtu.be/, /embed/, /v/, /shorts/ and a bare id. Deliberately
 * does NOT try to be clever about /redirect?…&q=… or /@channel URLs — those have
 * no video in them, and guessing would produce a player for the wrong thing.
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

  const frame = document.createElement("iframe");
  frame.className = "about-service_video-iframe";
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

  // Delegated: one listener covers the button and the surrounding poster, and
  // survives the thumbnail being swapped in the Designer.
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
