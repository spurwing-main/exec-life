import { describe, it, expect, beforeEach, vi } from "vitest";
import { initVideoLightbox } from "./video-lightbox.js";

/**
 * jsdom implements <dialog> but not showModal/close, so they are stubbed
 * here. What is being tested is this module's job — which iframe goes in and
 * when it comes out — not the browser's dialog semantics, which dialog.js
 * deliberately delegates.
 */
function mount({ url = "https://youtu.be/eac2HS2JtFk", target = "video-modal" } = {}) {
  document.body.innerHTML = `
    <a href="#" data-video-lightbox="${target}"
       data-video-url="${url}"
       data-video-title="Relevant Life explained">
      <img src="thumb.webp" alt="">
    </a>
    <dialog id="video-modal" data-dialog data-video-dialog>
      <div data-dialog-panel>
        <button data-dialog-close type="button">Close</button>
        <div data-video-frame></div>
      </div>
    </dialog>`;

  const dialog = document.querySelector("dialog");
  dialog.showModal = vi.fn(() => {
    dialog.open = true;
  });
  dialog.close = vi.fn(() => {
    dialog.open = false;
    dialog.dispatchEvent(new Event("close"));
  });

  initVideoLightbox(document);
  return {
    trigger: document.querySelector("[data-video-lightbox]"),
    dialog,
    frame: () => dialog.querySelector("iframe"),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("video lightbox", () => {
  it("opens the dialog with the right video", () => {
    const el = mount();
    el.trigger.click();

    expect(el.dialog.showModal).toHaveBeenCalledOnce();
    expect(el.frame().src).toContain("youtube-nocookie.com/embed/eac2HS2JtFk");
    expect(el.frame().src).toContain("autoplay=1");
  });

  it("names the player for assistive tech", () => {
    const el = mount();
    el.trigger.click();
    expect(el.frame().title).toBe("Relevant Life explained");
  });

  it("puts the iframe in the frame slot, not loose in the dialog", () => {
    const el = mount();
    el.trigger.click();
    expect(document.querySelector("[data-video-frame] > iframe")).not.toBeNull();
  });

  /* Blanking src is what stops the audio. If this regresses, a closed lightbox
     keeps talking over the page. */
  it("stops playback on close", () => {
    const el = mount();
    el.trigger.click();
    expect(el.frame().src).toContain("eac2HS2JtFk");

    el.dialog.close();
    expect(el.frame().src).toBe("about:blank");
  });

  /* The dialog fades out over a second. Removing the player on close empties
     the panel while it is still on screen and it collapses to nothing as it
     fades, which is what this keeps fixed. */
  it("keeps the player in the DOM through the closing fade", () => {
    const el = mount();
    el.trigger.click();

    el.dialog.close();
    expect(el.frame()).not.toBeNull();
  });

  it("does not stack players when opened twice", () => {
    const el = mount();
    el.trigger.click();
    el.dialog.close();
    el.trigger.click();

    expect(el.dialog.querySelectorAll("iframe")).toHaveLength(1);
  });

  /* Authored in the Designer, so the URL can be anything. A channel link must
     not produce a broken player. */
  it("opens a non-video URL in a new tab instead of embedding it", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const el = mount({ url: "https://www.youtube.com/@executivelife" });

    el.trigger.click();

    expect(el.dialog.showModal).not.toHaveBeenCalled();
    expect(el.frame()).toBeNull();
    expect(openSpy).toHaveBeenCalledWith("https://www.youtube.com/@executivelife", "_blank", "noopener");
  });

  it("falls back to opening the URL when the target dialog is missing", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const el = mount({ target: "does-not-exist" });

    el.trigger.click();

    expect(el.frame()).toBeNull();
    expect(openSpy).toHaveBeenCalled();
  });

  it("binds once, so a second init does not double-open", () => {
    const el = mount();
    initVideoLightbox(document);
    el.trigger.click();

    expect(el.dialog.showModal).toHaveBeenCalledOnce();
  });
});

/**
 * The real dialog on this site is a Modal Component instance, and a Component
 * instance root cannot carry a custom attribute in the Designer. So
 * `dialog[data-video-dialog]` matches nothing, and the close listener has to
 * be bound off the dialog the trigger actually resolves by id.
 */
describe("dialog without the marker attribute", () => {
  function mountModal() {
    document.body.innerHTML = `
      <a href="#" data-video-lightbox="video-modal" data-video-url="https://youtu.be/eac2HS2JtFk">card</a>
      <dialog id="video-modal" data-dialog class="modal">
        <div data-dialog-panel class="modal_inner">
          <button data-dialog-close type="button">Close</button>
        </div>
      </dialog>`;
    const dialog = document.querySelector("dialog");
    dialog.showModal = vi.fn(() => { dialog.open = true; });
    dialog.close = vi.fn(() => { dialog.open = false; dialog.dispatchEvent(new Event("close")); });
    initVideoLightbox(document);
    return { trigger: document.querySelector("[data-video-lightbox]"), dialog };
  }

  it("still opens, and mounts the player inside the panel", () => {
    const el = mountModal();
    el.trigger.click();

    expect(el.dialog.showModal).toHaveBeenCalledOnce();
    expect(document.querySelector("[data-dialog-panel] > iframe")).not.toBeNull();
  });

  it("still stops playback on close, so the audio stops", () => {
    const el = mountModal();
    el.trigger.click();
    expect(el.dialog.querySelector("iframe").src).toContain("eac2HS2JtFk");

    el.dialog.close();
    expect(el.dialog.querySelector("iframe").src).toBe("about:blank");
  });
});
