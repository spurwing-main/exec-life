/**
 * Video facade: thumbnail and custom play button, the player loaded only on click.
 *
 * Same contract as the other modules: the DOM owns all visual state through
 * CSS. This only injects the iframe and flips one attribute,
 * `data-video-state="playing"`, on the root. The section's scoped Embed CSS
 * drives the play button's fade-out and the iframe's positioning. No inline
 * styles here.
 *
 * WHY A FACADE. A YouTube or Vimeo iframe embedded on load costs hundreds of
 * kilobytes of JS and several third-party requests before anyone asks to watch
 * anything. The thumbnail is a plain <img>, so the section costs one image
 * until the click.
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
 *   - Privacy-first hosts: `youtube-nocookie.com` for YouTube and `dnt=1` for
 *     Vimeo, so neither writes anything until playback.
 *
 * THE URL MAY NOT CONTAIN A VIDEO. `data-video-url` is authored in the
 * Designer, so it can legitimately hold a channel link, a /redirect?… bounce,
 * or an empty string. `videoSource` returns null for those and the URL opens in
 * a new tab rather than injecting a broken player. That is a deliberate
 * fallback, not a silent failure, and it warns: a marketing link in a video
 * slot is nearly always a content mistake someone should see.
 */

import { qsa, qs, closestWithin } from "../utils/dom.js";

/**
 * Work out which provider a pasted URL points at, and pull the id out.
 *
 * Returns `{ provider, id, hash }` or null. `hash` is Vimeo's privacy token
 * and is null everywhere else.
 *
 * Deliberately not clever about /redirect?…&q=… or /@channel URLs: those
 * contain no video, and a guess would produce a player for the wrong thing.
 */
export function videoSource(url) {
  if (!url) return null;
  const value = String(url).trim();

  // Vimeo first. A Vimeo id is a bare run of digits, so testing YouTube's
  // 11-character alphanumeric pattern first would never misfire — but a Vimeo
  // URL containing "/v/" would, and that is a real Vimeo path shape.
  if (/vimeo\.com/i.test(value)) {
    // The id is the last all-digit path segment: this covers vimeo.com/ID,
    // /channels/name/ID, /groups/name/videos/ID and player.vimeo.com/video/ID.
    const id = (value.match(/vimeo\.com\/(?:.*\/)?(\d+)/i) || [])[1];
    if (!id) return null;

    // UNLISTED VIDEOS NEED THE PRIVACY HASH. Vimeo writes those as
    // vimeo.com/ID/HASH, and the embed is refused with 403 unless the hash
    // comes through as ?h=. It also arrives as an explicit ?h= on some
    // share URLs, so accept both spellings.
    const fromPath = (value.match(new RegExp("vimeo\\.com\\/(?:.*\\/)?" + id + "\\/([A-Za-z0-9]+)", "i")) || [])[1];
    const fromQuery = (value.match(/[?&]h=([A-Za-z0-9]+)/i) || [])[1];
    return { provider: "vimeo", id, hash: fromPath || fromQuery || null };
  }

  // YouTube ids are exactly 11 characters of [A-Za-z0-9_-].
  const fromUrl = value.match(
    /(?:youtu\.be\/|\/embed\/|\/v\/|\/shorts\/|[?&]v=)([A-Za-z0-9_-]{11})/
  );
  if (fromUrl) return { provider: "youtube", id: fromUrl[1], hash: null };

  const bare = value.match(/^[A-Za-z0-9_-]{11}$/);
  return bare ? { provider: "youtube", id: bare[0], hash: null } : null;
}

/**
 * Kept for callers that only ever handled YouTube.
 *
 * @deprecated Use `videoSource`. This returns null for a Vimeo URL, which is
 * correct for its name but not what a caller handling both wants.
 */
export function youTubeVideoId(url) {
  const source = videoSource(url);
  return source && source.provider === "youtube" ? source.id : null;
}

/**
 * The embed URL for a source from `videoSource`.
 *
 * Both hosts are the privacy-preserving variant: youtube-nocookie writes no
 * cookie until playback, and Vimeo's dnt=1 suppresses its tracking. The facade
 * exists to avoid third-party weight before a click; loading a tracking player
 * on that click would give most of it back.
 */
export function buildEmbedUrl(source) {
  // A bare string is still accepted, and still means YouTube, so the old
  // two-argument call shape in any untouched caller keeps working.
  const value = typeof source === "string" ? { provider: "youtube", id: source, hash: null } : source;
  if (!value || !value.id) return null;

  if (value.provider === "vimeo") {
    const params = new URLSearchParams({
      autoplay: "1",
      title: "0",
      byline: "0",
      portrait: "0",
      dnt: "1",
    });
    if (value.hash) params.set("h", value.hash);
    return `https://player.vimeo.com/video/${value.id}?${params}`;
  }

  const params = new URLSearchParams({
    autoplay: "1",
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
  });
  return `https://www.youtube-nocookie.com/embed/${value.id}?${params}`;
}

function play(root) {
  if (root.getAttribute("data-video-state") === "playing") return;

  const url = root.getAttribute("data-video-url") || "";
  const source = videoSource(url);

  if (!source) {
    console.warn("[el] video: no YouTube or Vimeo video in data-video-url, cannot embed a player", url);
    if (url) window.open(url, "_blank", "noopener");
    return;
  }

  // Not a styling contract. The embed CSS matches `[data-video] > iframe`
  // structurally, so this class exists only to help someone debug.
  const frame = document.createElement("iframe");
  frame.className = "video-facade_iframe";
  frame.src = buildEmbedUrl(source);
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
