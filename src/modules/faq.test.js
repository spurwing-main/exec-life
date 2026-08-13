import { describe, it, expect, beforeEach, vi } from "vitest";
import { initFaq } from "./faq.js";
import { BREAKPOINT_QUERIES } from "../utils/breakpoints.js";

function mockMatchMedia(activeQueries = []) {
  const records = new Map();

  window.matchMedia = vi.fn((query) => {
    if (!records.has(query)) {
      const listeners = new Set();
      records.set(query, {
        media: query,
        matches: activeQueries.includes(query),
        addEventListener: (_event, listener) => listeners.add(listener),
        removeEventListener: (_event, listener) => listeners.delete(listener),
        dispatch(matches) {
          this.matches = matches;
          listeners.forEach((listener) => listener({ matches, media: query }));
        },
      });
    }
    return records.get(query);
  });

  return {
    set(breakpoint, matches) {
      records.get(BREAKPOINT_QUERIES[breakpoint]).dispatch(matches);
    },
  };
}

function mount({ multi = false, openIndex = 0 } = {}) {
  const attr = multi ? ' data-faq="multi"' : " data-faq";
  document.body.innerHTML = `
    <div class="faq_list"${attr}>
      ${[0, 1, 2, 3]
        .map(
          (i) => `
        <div class="faq_item" data-faq-item data-open="${i === openIndex ? "true" : "false"}">
          <button class="faq_toggle" data-faq-toggle type="button" aria-expanded="${i === openIndex ? "true" : "false"}">
            <div class="faq_icon" aria-hidden="true">
              <svg class="faq_icon-plus" aria-hidden="true"></svg>
              <svg class="faq_icon-minus" aria-hidden="true"></svg>
            </div>
            <p class="faq_question">Question ${i}</p>
          </button>
          <div class="faq_panel" data-faq-panel>
            <div class="faq_panel-inner"><p class="faq_answer">Answer ${i}</p></div>
          </div>
        </div>`
        )
        .join("")}
    </div>`;
  return {
    items: Array.from(document.querySelectorAll("[data-faq-item]")),
    toggles: Array.from(document.querySelectorAll("[data-faq-toggle]")),
    panels: Array.from(document.querySelectorAll("[data-faq-panel]")),
  };
}

const openStates = (items) => items.map((i) => i.getAttribute("data-open"));

function createGsapMock() {
  const timelines = [];

  const apply = (target, properties) => {
    if ("height" in properties) {
      target.style.height = typeof properties.height === "number" ? `${properties.height}px` : properties.height;
    }
    if ("overflow" in properties) target.style.overflow = properties.overflow;
    if ("opacity" in properties) target.style.opacity = String(properties.opacity);
    if ("transformOrigin" in properties) target.style.transformOrigin = properties.transformOrigin;
    if ("rotation" in properties) target.style.transform = `rotate(${properties.rotation}deg)`;
  };

  const mock = {
    set: vi.fn((target, properties) => apply(target, properties)),
    timeline: vi.fn((config = {}) => {
      const steps = [];
      const timeline = {
        fromTo(target, from, to) {
          steps.push({ target, from, to });
          return timeline;
        },
        to(target, properties) {
          steps.push({ target, from: {}, to: properties });
          return timeline;
        },
        kill: vi.fn(),
        progress: vi.fn((value) => {
          steps.forEach(({ target, from, to }) => apply(target, value ? to : from));
          return timeline;
        }),
        pause: vi.fn(() => timeline),
        invalidate: vi.fn(() => timeline),
        play: vi.fn(() => {
          steps.forEach(({ target, to }) => apply(target, to));
          return timeline;
        }),
        reverse: vi.fn(() => {
          steps.forEach(({ target, from }) => apply(target, from));
          return timeline;
        }),
      };
      timelines.push({ config, timeline });
      return timeline;
    }),
  };

  return { mock, timelines };
}

describe("initFaq", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    delete window.gsap;
  });

  it("keeps the first item open on load and syncs aria/roles", () => {
    const { items, toggles, panels } = mount();
    initFaq();

    expect(openStates(items)).toEqual(["true", "false", "false", "false"]);
    expect(toggles.map((t) => t.getAttribute("aria-expanded"))).toEqual([
      "true",
      "false",
      "false",
      "false",
    ]);
    expect(toggles[0].getAttribute("aria-controls")).toBe(panels[0].id);
    expect(panels[0].getAttribute("aria-labelledby")).toBe(toggles[0].id);
    expect(panels[0].getAttribute("role")).toBe("region");
  });

  it("opens one at a time — opening an item closes the others (single-open)", () => {
    const { items, toggles } = mount();
    initFaq();

    toggles[2].click();
    expect(openStates(items)).toEqual(["false", "false", "true", "false"]);
    expect(toggles[2].getAttribute("aria-expanded")).toBe("true");
    expect(toggles[0].getAttribute("aria-expanded")).toBe("false");

    toggles[1].click();
    expect(openStates(items)).toEqual(["false", "true", "false", "false"]);
  });

  it("clicking an open item closes it (no item open)", () => {
    const { items, toggles } = mount();
    initFaq();

    toggles[0].click(); // item 0 starts open
    expect(openStates(items)).toEqual(["false", "false", "false", "false"]);
    expect(toggles[0].getAttribute("aria-expanded")).toBe("false");
  });

  it("data-faq='multi' lets several stay open", () => {
    const { items, toggles } = mount({ multi: true });
    initFaq();

    toggles[1].click();
    toggles[2].click();
    expect(openStates(items)).toEqual(["true", "true", "true", "false"]);
  });

  it("moves focus across headers with arrow / Home / End keys", () => {
    const { toggles } = mount();
    initFaq();

    toggles[0].focus();
    toggles[0].dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement).toBe(toggles[1]);

    toggles[1].dispatchEvent(new window.KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(document.activeElement).toBe(toggles[3]);

    toggles[3].dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement).toBe(toggles[0]); // wraps
  });

  it("uses one GSAP timeline for the panel, answer, and SVG state", () => {
    const { mock, timelines } = createGsapMock();
    window.gsap = mock;
    const { items, toggles, panels } = mount();
    const cleanup = initFaq();

    expect(panels[0].style.transition).toBe("none");
    toggles[1].click();

    expect(timelines).toHaveLength(4);
    expect(timelines[0].config.defaults.duration).toBe(0.4);
    expect(timelines[0].timeline.reverse).toHaveBeenCalled();
    expect(timelines[1].timeline.play).toHaveBeenCalled();
    expect(timelines[1].timeline.invalidate).toHaveBeenCalled();
    expect(items.map((item) => item.getAttribute("data-open"))).toEqual([
      "false",
      "true",
      "false",
      "false",
    ]);
    expect(panels[0].style.height).toBe("0px");
    expect(panels[1].style.height).toBe("auto");
    expect(toggles[1].querySelector(".faq_icon-plus").style.opacity).toBe("0");

    cleanup();
    expect(panels[0].style.transition).toBe("");
  });
});

describe("initFaq — CMS Collection List defaults", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("opens the first item when the template marks nothing open", () => {
    const { items, toggles } = mount({ openIndex: -1 });
    initFaq();

    expect(openStates(items)).toEqual(["true", "false", "false", "false"]);
    expect(toggles[0].getAttribute("aria-expanded")).toBe("true");
  });

  it("respects data-faq-open=none and stays fully closed", () => {
    const { items } = mount({ openIndex: -1 });
    document.querySelector("[data-faq]").setAttribute("data-faq-open", "none");
    initFaq();

    expect(openStates(items)).toEqual(["false", "false", "false", "false"]);
  });

  it("does not override an explicitly opened item", () => {
    const { items } = mount({ openIndex: 2 });
    initFaq();

    expect(openStates(items)).toEqual(["false", "false", "true", "false"]);
  });

  it("collapses to the first when a template opened every item in single mode", () => {
    document.body.innerHTML = `
      <div class="faq_list" data-faq>
        ${[0, 1, 2]
          .map(
            (i) => `<div class="faq_item" data-faq-item data-open="true">
                      <button class="faq_toggle" data-faq-toggle type="button"></button>
                      <div class="faq_panel" data-faq-panel></div>
                    </div>`
          )
          .join("")}
      </div>`;
    initFaq();

    expect(
      openStates(Array.from(document.querySelectorAll("[data-faq-item]")))
    ).toEqual(["true", "false", "false"]);
  });

  it("leaves every item open in multi mode", () => {
    document.body.innerHTML = `
      <div class="faq_list" data-faq="multi">
        ${[0, 1]
          .map(
            () => `<div class="faq_item" data-faq-item data-open="true">
                     <button class="faq_toggle" data-faq-toggle type="button"></button>
                     <div class="faq_panel" data-faq-panel></div>
                   </div>`
          )
          .join("")}
      </div>`;
    initFaq();

    expect(
      openStates(Array.from(document.querySelectorAll("[data-faq-item]")))
    ).toEqual(["true", "true"]);
  });
});

describe("initFaq — breakpoint activation", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("is open and static outside its configured breakpoints", () => {
    mockMatchMedia();
    const { items, toggles } = mount();
    const root = document.querySelector("[data-faq]");
    root.setAttribute("data-faq-breakpoints", "mbl, mbp");

    initFaq();

    expect(root.getAttribute("data-faq-active")).toBe("false");
    expect(openStates(items)).toEqual(["true", "true", "true", "true"]);
    expect(toggles.map((toggle) => toggle.getAttribute("aria-expanded"))).toEqual([
      null,
      null,
      null,
      null,
    ]);

    toggles[1].click();
    expect(openStates(items)).toEqual(["true", "true", "true", "true"]);
  });

  it("restores accordion state when entering an enabled breakpoint", () => {
    const media = mockMatchMedia();
    const { items, toggles } = mount();
    const root = document.querySelector("[data-faq]");
    root.setAttribute("data-faq-breakpoints", "mbp");

    initFaq();
    media.set("mbp", true);

    expect(root.getAttribute("data-faq-active")).toBe("true");
    expect(openStates(items)).toEqual(["true", "false", "false", "false"]);
    expect(toggles[0].getAttribute("aria-expanded")).toBe("true");

    toggles[2].click();
    expect(openStates(items)).toEqual(["false", "false", "true", "false"]);

    media.set("mbp", false);
    expect(openStates(items)).toEqual(["true", "true", "true", "true"]);
  });
});
