import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { initVideo, youTubeVideoId, videoSource, buildEmbedUrl } from "./video.js";

const REAL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

/**
 * The markup the Designer produces for the Service About media slot.
 * `url` is authored, so the tests exercise the bad-URL paths too.
 */
function mount(url = REAL) {
  document.body.innerHTML = `
    <div class="video-facade" data-video
         data-video-url="${url}"
         data-video-title="What is Key Man Insurance">
      <img class="video-facade_thumb" data-video-thumb alt="poster">
      <button class="video-facade_play" data-video-play type="button">
        <svg viewBox="0 0 81 81" aria-hidden="true"><path d="M0 0Z"></path></svg>
      </button>
    </div>`;
  return {
    root: document.querySelector("[data-video]"),
    button: document.querySelector("[data-video-play]"),
    thumb: document.querySelector("[data-video-thumb]"),
  };
}

const frames = (root) => root.querySelectorAll("iframe");

describe("youTubeVideoId", () => {
  it("extracts the id from every form an author might paste", () => {
    expect(youTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youTubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=42")).toBe("dQw4w9WgXcQ");
    expect(youTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youTubeVideoId("https://www.youtube.com/v/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youTubeVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youTubeVideoId("  dQw4w9WgXcQ  ")).toBe("dQw4w9WgXcQ");
  });

  it("returns null for URLs that contain no video", () => {
    expect(youTubeVideoId("")).toBeNull();
    expect(youTubeVideoId(null)).toBeNull();
    expect(youTubeVideoId("https://www.youtube.com/@executivelife")).toBeNull();
    // The channel-header redirect that was authored as the initial default.
    expect(
      youTubeVideoId(
        "https://www.youtube.com/redirect?event=channel_header&redir_token=QUFF&q=www.executive-life.co.uk"
      )
    ).toBeNull();
  });
});

describe("initVideo", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads nothing until the play button is clicked", () => {
    const { root } = mount();
    initVideo();
    expect(frames(root)).toHaveLength(0);
    expect(root.getAttribute("data-video-state")).toBeNull();
  });

  it("injects a nocookie iframe with autoplay and the authored title on click", () => {
    const { root, button } = mount();
    initVideo();
    button.click();

    expect(frames(root)).toHaveLength(1);
    const frame = root.querySelector("iframe");
    expect(frame.src).toContain("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(frame.src).toContain("autoplay=1");
    expect(frame.title).toBe("What is Key Man Insurance");
    expect(frame.getAttribute("allowfullscreen")).toBe("");
    expect(root.getAttribute("data-video-state")).toBe("playing");
  });

  it("leaves the poster and button in the DOM so the player overlays them", () => {
    const { root, button, thumb } = mount();
    initVideo();
    button.click();
    expect(root.contains(thumb)).toBe(true);
    expect(root.contains(button)).toBe(true);
  });

  it("plays when the poster is clicked, not just the button", () => {
    const { root, thumb } = mount();
    initVideo();
    thumb.click();
    expect(frames(root)).toHaveLength(1);
  });

  it("never injects a second iframe, however many times it is clicked", () => {
    const { root, button, thumb } = mount();
    initVideo();
    button.click();
    button.click();
    thumb.click();
    root.click();
    expect(frames(root)).toHaveLength(1);
  });

  it("is idempotent across repeated init (e.g. after a CMS load)", () => {
    const { root, button } = mount();
    initVideo();
    initVideo();
    button.click();
    expect(frames(root)).toHaveLength(1);
  });

  it("opens the link and warns when the URL holds no video, rather than embedding", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const redirect =
      "https://www.youtube.com/redirect?event=channel_header&redir_token=QUFF&q=www.executive-life.co.uk";
    const { root, button } = mount(redirect);
    initVideo();
    button.click();

    expect(frames(root)).toHaveLength(0);
    expect(root.getAttribute("data-video-state")).toBeNull();
    expect(warn).toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith(redirect, "_blank", "noopener");
  });

  it("does nothing at all when the URL is empty", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const { root, button } = mount("");
    initVideo();
    button.click();

    expect(frames(root)).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it("adds a fallback aria-label when the Designer markup has none", () => {
    mount();
    const button = document.querySelector("[data-video-play]");
    button.removeAttribute("aria-label");
    initVideo();
    expect(button.getAttribute("aria-label")).toBe("Play video");
  });
});

// Vimeo support. The provider is chosen from the URL, and the two hosts have
// different privacy switches: youtube-nocookie for one, dnt=1 for the other.
describe("videoSource — Vimeo", () => {
  it("reads the id from every Vimeo URL shape", () => {
    expect(videoSource("https://vimeo.com/123456789")).toEqual({
      provider: "vimeo", id: "123456789", hash: null,
    });
    expect(videoSource("https://player.vimeo.com/video/123456789").id).toBe("123456789");
    expect(videoSource("https://vimeo.com/channels/staffpicks/123456789").id).toBe("123456789");
    expect(videoSource("https://vimeo.com/groups/shorts/videos/123456789").id).toBe("123456789");
  });

  // The one that breaks silently in production: an unlisted video embeds as
  // 403 without its privacy hash.
  it("keeps the privacy hash for an unlisted video", () => {
    expect(videoSource("https://vimeo.com/123456789/abc123def")).toEqual({
      provider: "vimeo", id: "123456789", hash: "abc123def",
    });
    expect(videoSource("https://vimeo.com/123456789?h=abc123def").hash).toBe("abc123def");
  });

  it("puts the hash in the embed URL as h=", () => {
    const url = buildEmbedUrl(videoSource("https://vimeo.com/123456789/abc123def"));
    expect(url).toContain("player.vimeo.com/video/123456789");
    expect(url).toContain("h=abc123def");
    expect(url).toContain("dnt=1");
  });

  it("omits h= when there is no hash", () => {
    expect(buildEmbedUrl(videoSource("https://vimeo.com/123456789"))).not.toContain("h=");
  });

  it("returns null for a Vimeo URL with no video in it", () => {
    expect(videoSource("https://vimeo.com/executivelife")).toBeNull();
  });
});

describe("videoSource — YouTube still works", () => {
  it("tags YouTube URLs with the right provider", () => {
    expect(videoSource("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      provider: "youtube", id: "dQw4w9WgXcQ", hash: null,
    });
  });

  it("builds a nocookie embed", () => {
    const url = buildEmbedUrl(videoSource("https://youtu.be/dQw4w9WgXcQ"));
    expect(url).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(url).toContain("autoplay=1");
  });

  it("still accepts a bare id string, as the old callers passed", () => {
    expect(buildEmbedUrl("dQw4w9WgXcQ")).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  it("youTubeVideoId stays YouTube-only and ignores Vimeo", () => {
    expect(youTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youTubeVideoId("https://vimeo.com/123456789")).toBeNull();
  });
});
