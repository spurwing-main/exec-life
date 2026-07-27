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
      <h2 class="faq_title" data-anim="fade-up-lg">Frequently asked questions</h2>
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

describe("markup", () => {
  it("never mutates the DOM — the mask the wipe preset needed is gone", () => {
    mount();
    const before = document.body.innerHTML;
    initAnim();
    expect(document.body.innerHTML).toBe(before);
  });

  it("reveals immediately inside a carousel viewport instead of observing it", () => {
    // A slide off to the side of a carousel never intersects, so observing it
    // would hold it hidden forever behind the CSS hold rule.
    document.body.innerHTML = `
      <div data-carousel-viewport><h2 data-anim="fade-up-lg">In a carousel</h2></div>
      <div class="w-richtext"><h2 data-anim="fade-up">In rich text</h2></div>
      <h2 data-anim="fade-up-lg">Normal</h2>`;
    initAnim();

    const inCarousel = document.querySelector('[data-carousel-viewport] h2');
    const inRichText = document.querySelector('.w-richtext h2');
    const normal = document.querySelectorAll('h2')[2];
    expect(inCarousel.getAttribute("data-anim-state")).toBe("in");
    expect(inRichText.getAttribute("data-anim-state")).toBe("in");
    expect(normal.hasAttribute("data-anim-state")).toBe(false);
    expect(observed).not.toContain(inCarousel);
    expect(observed).toContain(normal);
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

    // 4 tagged children + the group itself
    expect(observed).toHaveLength(5);
    expect(observed.some((el) => el.getAttribute("data-anim-on") === "load")).toBe(false);
    expect(observed.some((el) => el.getAttribute("data-anim") === "off")).toBe(false);
  });

  it("observes the GROUP too, so children with no attribute of their own reveal", () => {
    // A Button component instance root cannot carry data-anim, so it relies on
    // the group's state. If the group is not observed, such children never run.
    document.body.innerHTML = `
      <div class="cta-start_card" data-anim-group>
        <div class="cta-start_head" data-anim-group><h2 data-anim="wipe">Heading</h2></div>
        <p class="cta-start_text">copy</p>
        <div class="cta-start_actions"><div class="button">CTA</div></div>
      </div>`;
    initAnim();

    const outer = document.querySelector(".cta-start_card");
    const inner = document.querySelector(".cta-start_head");
    expect(observed).toContain(outer);
    expect(observed).toContain(inner);
  });

  /**
   * The guard's job is narrow on purpose. Its first version asked "is anything on
   * screen still invisible?" — a wider region than the observer's -10% trigger, so
   * an element resting in that band was correctly still held, got read as stuck,
   * and tripped the panic. Panic kills every scroll reveal site-wide, so the whole
   * page below the hero went instant. These three cases pin the contract down.
   */
  function observerHarness() {
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
    return () => callback;
  }

  it("panics when an element it already revealed is STILL invisible", () => {
    vi.useFakeTimers();
    const getCb = observerHarness();
    mount();
    initAnim();

    const title = document.querySelector(".faq_title");
    getCb()([{ target: title, isIntersecting: true, boundingClientRect: { bottom: 400 } }]);
    // CSS missing/overridden: it was told to reveal and never did.
    title.style.opacity = "0";

    vi.advanceTimersByTime(3000);
    expect(document.documentElement.hasAttribute("data-anim-panic")).toBe(true);
  });

  it("does NOT panic over an element that was never revealed — it is waiting, not stuck", () => {
    vi.useFakeTimers();
    observerHarness();
    mount();
    initAnim();

    // Held hidden, below the trigger point. This is the system working.
    document.querySelector(".faq_title").style.opacity = "0";
    document.querySelector(".faq_text").style.opacity = "0";

    vi.advanceTimersByTime(3000);
    expect(document.documentElement.hasAttribute("data-anim-panic")).toBe(false);
  });

  it("does NOT panic over a reveal that is still mid-animation", () => {
    vi.useFakeTimers();
    const getCb = observerHarness();
    mount();
    initAnim();

    // Revealed just before the guard runs, so it is legitimately part-way through.
    vi.advanceTimersByTime(2400);
    const title = document.querySelector(".faq_title");
    getCb()([{ target: title, isIntersecting: true, boundingClientRect: { bottom: 400 } }]);
    title.style.opacity = "0.3";

    vi.advanceTimersByTime(600);
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
