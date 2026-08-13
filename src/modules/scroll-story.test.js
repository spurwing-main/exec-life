import { beforeEach, describe, expect, it, vi } from "vitest";
import { initScrollStories, storyFrame, storyProgress } from "./scroll-story.js";

function mediaQuery(matches = false) {
  return {
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

function mount({ count = 3, navCount = count, withNav = true } = {}) {
  const panels = Array.from({ length: count }, (_, index) => `<article><p>Chapter ${index + 1}</p></article>`).join("");
  const nav = Array.from({ length: navCount }, () => "<button><span></span></button>").join("");
  document.body.innerHTML = `
    <section data-scroll-story>
      <div data-scroll-story-panels>${panels}</div>
      ${withNav ? `<div data-scroll-story-nav>${nav}</div>` : ""}
    </section>`;
  const root = document.querySelector("[data-scroll-story]");
  Object.defineProperty(root, "offsetHeight", { configurable: true, value: 4000 });
  root.getBoundingClientRect = () => ({ top: -500, height: 4000 });
  return {
    root,
    panels: Array.from(root.querySelectorAll("[data-scroll-story-panels] > *")),
    nav: Array.from(root.querySelectorAll("[data-scroll-story-nav] > *")),
  };
}

beforeEach(() => {
  document.body.innerHTML = "";
  const queries = {
    width: mediaQuery(true),
    motion: mediaQuery(false),
  };
  vi.stubGlobal("matchMedia", vi.fn((query) => (query.includes("min-width") ? queries.width : queries.motion)));
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback) => {
    callback();
    return 1;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("scrollTo", vi.fn());
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 1000 });
  Object.defineProperty(window, "scrollY", { configurable: true, value: 500 });
});

describe("storyProgress", () => {
  it("normalizes and clamps the section's scroll range", () => {
    const input = { sectionTop: 1000, sectionHeight: 4000, viewportHeight: 1000 };
    expect(storyProgress({ ...input, scrollY: 1000 })).toBe(0);
    expect(storyProgress({ ...input, scrollY: 2500 })).toBe(0.5);
    expect(storyProgress({ ...input, scrollY: 5000 })).toBe(1);
  });
});

describe("storyFrame", () => {
  it("maps progress to the three positional chapters", () => {
    expect(storyFrame(0, 3).active).toBe(0);
    expect(storyFrame(0.5, 3).active).toBe(0);
    expect(storyFrame(0.67, 3).active).toBe(1);
    expect(storyFrame(1, 3).active).toBe(2);
  });

  it("creates a reversible incoming and outgoing image stack", () => {
    const before = storyFrame(0.3, 3);
    const during = storyFrame(0.5, 3);
    const after = storyFrame(0.67, 3);
    expect(before.panels[1].incoming).toBe(0);
    expect(during.panels[1].incoming).toBeGreaterThan(0);
    expect(during.panels[0].outgoing).toBe(during.panels[1].incoming);
    expect(after.panels[1].incoming).toBe(1);
  });

  it("holds copy until the incoming image takeover completes", () => {
    const during = storyFrame(0.5, 3);
    const after = storyFrame(0.67, 3);
    expect(during.panels.map((panel) => panel.content)).toEqual([1, 0, 0]);
    expect(after.panels.map((panel) => panel.content)).toEqual([0, 1, 0]);
  });

  it("scales to arbitrary panel counts", () => {
    const frame = storyFrame(1, 6);
    expect(frame.panels).toHaveLength(6);
    expect(frame.active).toBe(5);
  });

  it("supports a configurable transition window", () => {
    const frame = storyFrame(0.5, 3, 0.25);
    expect(frame.panels[1].incoming).toBeGreaterThan(0);
  });
});

describe("initScrollStories", () => {
  it("enhances matching positional panels and nav items", () => {
    const { root, panels, nav } = mount();
    initScrollStories();

    expect(root.getAttribute("data-scroll-story-mode")).toBe("scroll");
    expect(root.hasAttribute("data-scroll-story-ready")).toBe(true);
    expect(root.style.getPropertyValue("--scroll-story-height")).toBe("400svh");
    expect(root.getAttribute("data-scroll-story-active")).toBe("1");
    expect(nav[0].getAttribute("aria-current")).toBe("step");
    expect(nav[0].getAttribute("aria-controls")).toBe(panels[0].id);
  });

  it("applies the enhanced CSS gate before measuring its scroll height", () => {
    const { root } = mount();
    Object.defineProperty(window, "scrollY", { configurable: true, value: 1500 });
    Object.defineProperty(root, "offsetHeight", {
      configurable: true,
      get: () => (root.hasAttribute("data-scroll-story-ready") ? 4000 : 2000),
    });
    root.getBoundingClientRect = () => ({ top: -1000, height: root.offsetHeight });

    initScrollStories();

    expect(root.getAttribute("data-scroll-story-active")).toBe("1");
    expect(Number(root.style.getPropertyValue("--scroll-story-progress"))).toBeCloseTo(1 / 3);
  });

  it("derives missing indicators from the authored template", () => {
    const { root } = mount({ count: 6, navCount: 2 });
    initScrollStories();
    const nav = Array.from(root.querySelectorAll("[data-scroll-story-nav] > *"));
    expect(nav).toHaveLength(6);
    expect(nav.slice(2).every((item) => item.hasAttribute("data-scroll-story-generated"))).toBe(true);
    expect(nav[5].getAttribute("aria-label")).toBe("Go to chapter 6");
    expect(root.style.getPropertyValue("--scroll-story-height")).toBe("700svh");
  });

  it("hides surplus indicators without blocking enhancement", () => {
    const { root } = mount({ count: 2, navCount: 4 });
    initScrollStories();
    const nav = Array.from(root.querySelectorAll("[data-scroll-story-nav] > *"));
    expect(nav.slice(2).every((item) => item.hidden)).toBe(true);
    expect(root.hasAttribute("data-scroll-story-ready")).toBe(true);
  });

  it("enhances without optional indicator markup", () => {
    const { root } = mount({ count: 4, withNav: false });
    initScrollStories();
    expect(root.style.getPropertyValue("--scroll-story-height")).toBe("500svh");
    expect(root.hasAttribute("data-scroll-story-ready")).toBe(true);
  });

  it("supports a configurable per-chapter scroll distance", () => {
    const { root } = mount({ count: 4 });
    root.setAttribute("data-scroll-story-step", "75");
    initScrollStories();
    expect(root.style.getPropertyValue("--scroll-story-height")).toBe("400svh");
  });

  it("configures each component instance from its own slide count", () => {
    document.body.innerHTML = `
      <section data-scroll-story>
        <div data-scroll-story-panels><article></article><article></article></div>
        <div data-scroll-story-nav><button></button></div>
      </section>
      <section data-scroll-story>
        <div data-scroll-story-panels>${"<article></article>".repeat(5)}</div>
        <div data-scroll-story-nav><button></button></div>
      </section>`;
    const roots = Array.from(document.querySelectorAll("[data-scroll-story]"));
    roots.forEach((root) => {
      Object.defineProperty(root, "offsetHeight", { configurable: true, value: 4000 });
      root.getBoundingClientRect = () => ({ top: -500, height: 4000 });
    });

    initScrollStories();

    expect(roots[0].style.getPropertyValue("--scroll-story-height")).toBe("300svh");
    expect(roots[1].style.getPropertyValue("--scroll-story-height")).toBe("600svh");
    expect(roots[0].querySelectorAll("[data-scroll-story-nav] > *")).toHaveLength(2);
    expect(roots[1].querySelectorAll("[data-scroll-story-nav] > *")).toHaveLength(5);
  });

  it("scrolls to a chapter when its existing dot is clicked", () => {
    const { nav } = mount();
    initScrollStories();
    nav[2].querySelector("span").click();
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 3000, behavior: "smooth" });
  });

  it("supports arrow-key chapter navigation", () => {
    const { nav } = mount();
    initScrollStories();
    nav[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(document.activeElement).toBe(nav[2]);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 3000, behavior: "smooth" });
  });

  it("uses the readable static mode for reduced motion", () => {
    window.matchMedia = vi.fn((query) => mediaQuery(query.includes("prefers-reduced-motion")));
    const { root, panels } = mount();
    initScrollStories();
    expect(root.getAttribute("data-scroll-story-mode")).toBe("static");
    expect(panels.every((panel) => !panel.hasAttribute("aria-hidden"))).toBe(true);
  });

  it("is idempotent and returns a complete cleanup", () => {
    const { root, panels } = mount({ count: 5, navCount: 1 });
    panels[0].id = "authored-panel";
    const destroyFirst = initScrollStories();
    const destroySecond = initScrollStories();
    expect(root.hasAttribute("data-scroll-story-bound")).toBe(true);
    destroySecond();
    expect(root.hasAttribute("data-scroll-story-bound")).toBe(true);
    destroyFirst();
    expect(root.hasAttribute("data-scroll-story-bound")).toBe(false);
    expect(root.hasAttribute("data-scroll-story-ready")).toBe(false);
    expect(root.querySelectorAll("[data-scroll-story-nav] > *")).toHaveLength(1);
    expect(panels[0].id).toBe("authored-panel");
    expect(panels[1].hasAttribute("id")).toBe(false);
  });
});
