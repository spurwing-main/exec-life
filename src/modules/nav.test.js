import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from "vitest";

/* nav.js reads matchMedia at module scope, which jsdom does not provide, so the
   stub has to land before the module is evaluated. */
let initNav;
beforeAll(async () => {
  vi.stubGlobal("matchMedia", (q) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  }));
  ({ initNav } = await import("./nav.js"));
});

/**
 * Scroll auto-hide only. The bar flips on sustained travel measured from where
 * the current direction run began, so momentum wobble must not move it. These
 * tests exist because the previous frame-to-frame delta of 6px let an 8px
 * wobble flip the bar six times in 170ms, and each flip restarted the
 * transform.
 */
function mount({ threshold = "1" } = {}) {
  document.body.innerHTML = `
    <div class="nav" data-nav data-nav-threshold="${threshold}">
      <div class="nav_shell">
        <div class="nav_bar"></div>
        <div class="nav_mobile-main" data-nav-mobile="main"></div>
      </div>
    </div>`;
  return document.querySelector(".nav");
}

/* rAF is what the module throttles on; run it synchronously so a scroll event
   settles inside the test. */
function scrollTo(y) {
  window.scrollY = y;
  window.dispatchEvent(new Event("scroll"));
}

let rafSpy;
beforeEach(() => {
  window.scrollY = 0;
  rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    cb();
    return 0;
  });
});
afterEach(() => {
  rafSpy.mockRestore();
  document.body.innerHTML = "";
});

const hidden = (nav) => nav.getAttribute("data-nav-hidden");

describe("nav auto-hide", () => {
  it("hides only after sustained downward travel", () => {
    const nav = mount();
    initNav(document);

    scrollTo(40); // short of HIDE_AFTER
    expect(hidden(nav)).toBe("false");

    scrollTo(100); // cumulative run now well past it
    expect(hidden(nav)).toBe("true");
  });

  it("ignores momentum wobble instead of flipping repeatedly", () => {
    const nav = mount();
    initNav(document);

    scrollTo(400); // settle into hidden
    expect(hidden(nav)).toBe("true");

    const flips = [];
    const obs = new MutationObserver(() => flips.push(hidden(nav)));
    obs.observe(nav, { attributes: true, attributeFilter: ["data-nav-hidden"] });

    // the wobble that used to flip it six times
    for (let i = 0; i < 6; i++) scrollTo(400 + (i % 2 ? 8 : 0));
    obs.disconnect();

    expect(flips).toEqual([]);
    expect(hidden(nav)).toBe("true");
  });

  it("reveals on a shorter upward run than it takes to hide", () => {
    const nav = mount();
    initNav(document);

    scrollTo(400);
    expect(hidden(nav)).toBe("true");

    scrollTo(360); // 40px up: past SHOW_AFTER, short of HIDE_AFTER
    expect(hidden(nav)).toBe("false");
  });

  it("a reversal restarts the run rather than flipping immediately", () => {
    const nav = mount();
    initNav(document);

    scrollTo(400);
    expect(hidden(nav)).toBe("true");

    scrollTo(390); // 10px up — a reversal, but not a sustained one
    expect(hidden(nav)).toBe("true");
  });

  it("always shows inside the reveal threshold", () => {
    const nav = mount({ threshold: "500" });
    initNav(document);

    scrollTo(200);
    expect(hidden(nav)).toBe("false");
    scrollTo(400);
    expect(hidden(nav)).toBe("false");
  });

  it("never hides while the mobile menu is open", () => {
    const nav = mount();
    initNav(document);
    nav.querySelector("[data-nav-mobile]").classList.add("is-open");

    scrollTo(400);
    expect(hidden(nav)).toBe("false");
  });
});

/**
 * Focus restoration on menu close.
 *
 * The menu remembers what was focused when it opened and focuses it again on
 * close. If that was a page control — the tax calculator's premium field is
 * the one this was reported against — closing the menu pulls the phone
 * keyboard back up and scrolls to the calculator.
 */
describe("mobile menu focus restoration", () => {
  function mountShell() {
    document.body.innerHTML = `
      <input id="outside" />
      <div class="nav">
        <div class="nav_shell">
          <a href="#" data-nav-menu-toggle></a>
          <div class="nav_mobile-main" data-nav-mobile="main">
            <a href="/services" id="inside">Services</a>
          </div>
        </div>
      </div>`;
    initNav(document);
    return document.querySelector("[data-nav-menu-toggle]");
  }

  it("does not return focus to a control outside the nav", () => {
    const toggle = mountShell();
    const outside = document.getElementById("outside");
    outside.focus();
    expect(document.activeElement).toBe(outside);

    toggle.click(); // open
    toggle.click(); // close

    expect(document.activeElement).not.toBe(outside);
  });

  it("still returns focus to a control inside the nav", () => {
    const toggle = mountShell();
    toggle.focus();

    toggle.click(); // open
    toggle.click(); // close

    expect(document.activeElement).toBe(toggle);
  });
});
