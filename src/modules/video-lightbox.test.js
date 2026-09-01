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

  /* Removing the iframe is what stops the audio. If this regresses, a closed
     lightbox keeps talking over the page. */
  it("removes the player on close", () => {
    const el = mount();
    el.trigger.click();
    expect(el.frame()).not.toBeNull();

    el.dialog.close();
    expect(el.frame()).toBeNull();
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
