import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initAnim } from "./anim.js";

/**
 * The reveal system's job is to *never withhold content*, so these tests are
 * mostly about the fail-open guarantees rather than the motion itself: what
 * happens with no observer, in the Designer, when something gets stuck. jsdom has
 * no layout and no IntersectionObserver, so both are stubbed.
 *
 * Selection and presets are authored attributes, so there is no mapping logic
 * here to test — which is the point of the design.
 */

/** A section header of the shape the Designer produces, attributes and all. */
function mount(extra = "") {
  document.body.innerHTML = `
    <div class="faq_head" data-anim-group>
      <div class="faq_eyebrow" data-anim="fade-up-sm">Business insurance FAQs</div>
      <h2 class="faq_title" data-anim="wipe">Frequently asked questions</h2>
      <p class="faq_text" data-anim="fade-up">Supporting copy.</p>
      <div class="button" data-anim="settle">CTA</div>
    </div>
    ${extra}`;
}

let observed;

beforeEach(() => {
  observed = [];
  document.documentElement.className = "";
  document.documentElement.removeAttribute("data-anim-ready");
  document.documentElement.removeAttribute("data-anim-panic");
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb) {
        this.cb = cb;
      }
      observe(el) {
        observed.push(el);
      }
      unobserve() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("wipe mask", () => {
  it("wraps the heading's contents in a mask + line, and never double-wraps", () => {
    mount();
    initAnim();
    initAnim();

    const title = document.querySelector(".faq_title");
    const masks = title.querySelectorAll(":scope > [data-anim-mask]");
    expect(masks).toHaveLength(1);
    expect(masks[0].querySelector("[data-anim-line]").textContent).toBe(
      "Frequently asked questions",
    );
  });

  it("leaves the other presets' markup untouched", () => {
    mount();
    initAnim();

    expect(document.querySelector(".faq_text").querySelector("[data-anim-mask]")).toBeNull();
    expect(document.querySelector(".faq_text").textContent).toBe("Supporting copy.");
  });

  it("does not build a mask inside a carousel viewport or rich text", () => {
    document.body.innerHTML = `
      <div data-carousel-viewport><h2 data-anim="wipe">In a carousel</h2></div>
      <div class="w-richtext"><h2 data-anim="wipe">In rich text</h2></div>`;
    initAnim();

    document.querySelectorAll("[data-anim~='wipe']").forEach((el) => {
      expect(el.querySelector("[data-anim-mask]")).toBeNull();
    });
  });
});

describe("fail open", () => {
  it("does nothing on an authoring surface (Designer canvas / Editor)", () => {
    mount();
    document.documentElement.classList.add("wf-design-mode");
    initAnim();

    expect(document.querySelector(".faq_title").querySelector("[data-anim-mask]")).toBeNull();
    expect(document.documentElement.hasAttribute("data-anim-ready")).toBe(false);
    expect(observed).toHaveLength(0);
  });

  it("only gates the hidden state once it has run", () => {
    mount();
    expect(document.documentElement.hasAttribute("data-anim-ready")).toBe(false);
    initAnim();
    expect(document.documentElement.hasAttribute("data-anim-ready")).toBe(true);
  });

  it("reveals everything immediately when there is no IntersectionObserver", () => {
    mount();
    vi.stubGlobal("IntersectionObserver", undefined);
    initAnim();

    document.querySelectorAll("[data-anim]").forEach((el) => {
      expect(el.getAttribute("data-anim-state")).toBe("in");
    });
  });

  it("observes tagged elements but skips load-triggered and opted-out ones", () => {
    mount(`
      <div data-anim="fade-up" data-anim-on="load">hero</div>
      <div data-anim="off">opted out</div>`);
    initAnim();

    expect(observed).toHaveLength(4);
    expect(observed.some((el) => el.getAttribute("data-anim-on") === "load")).toBe(false);
    expect(observed.some((el) => el.getAttribute("data-anim") === "off")).toBe(false);
  });

  it("panics (disabling all motion) if something is still invisible on screen", () => {
    vi.useFakeTimers();
    mount();
    initAnim();

    // jsdom has no layout, so give the heading a measurable box and no opacity.
    const title = document.querySelector(".faq_title");
    title.getBoundingClientRect = () => ({ top: 10, bottom: 60, height: 50 });
    title.querySelector("[data-anim-line]").style.opacity = "0";

    vi.advanceTimersByTime(3000);
    expect(document.documentElement.hasAttribute("data-anim-panic")).toBe(true);
  });

  it("does not panic when everything on screen is visible", () => {
    vi.useFakeTimers();
    mount();
    initAnim();
    document.querySelectorAll("[data-anim]").forEach((el) => {
      el.getBoundingClientRect = () => ({ top: 10, bottom: 60, height: 50 });
    });

    vi.advanceTimersByTime(3000);
    expect(document.documentElement.hasAttribute("data-anim-panic")).toBe(false);
  });
});

describe("arriving from a jump", () => {
  it("reveals an element that ended up above the viewport without intersecting", () => {
    let callback;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb) {
          callback = cb;
        }
        observe() {}
        unobserve() {}
      },
    );
    mount();
    initAnim();

    const title = document.querySelector(".faq_title");
    // An anchor jump moves in one frame: the observer only ever sees it as
    // not-intersecting, already scrolled past.
    callback([{ target: title, isIntersecting: false, boundingClientRect: { bottom: -400 } }]);
    expect(title.getAttribute("data-anim-state")).toBe("in");
  });

  it("leaves an element that has not arrived yet alone", () => {
    let callback;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb) {
          callback = cb;
        }
        observe() {}
        unobserve() {}
      },
    );
    mount();
    initAnim();

    const title = document.querySelector(".faq_title");
    callback([{ target: title, isIntersecting: false, boundingClientRect: { bottom: 2000 } }]);
    expect(title.hasAttribute("data-anim-state")).toBe(false);
  });
});
