import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initInsightsToc } from "./insights-toc.js";

function rect(top, height) {
  return { top, height, bottom: top + height, left: 0, right: 0, width: 0 };
}

function mount() {
  document.body.innerHTML = `
    <div class="insight-main_sidebar-list">
      <div><a class="insight-main_sidebar-link">First</a></div>
      <div><a class="insight-main_sidebar-link w--current">A title on two lines</a></div>
      <div><a class="insight-main_sidebar-link">Third</a></div>
    </div>`;

  const list = document.querySelector(".insight-main_sidebar-list");
  const links = Array.from(document.querySelectorAll(".insight-main_sidebar-link"));
  list.getBoundingClientRect = vi.fn(() => rect(100, 200));
  links[0].getBoundingClientRect = vi.fn(() => rect(112, 24));
  links[1].getBoundingClientRect = vi.fn(() => rect(148, 48));
  links[2].getBoundingClientRect = vi.fn(() => rect(208, 24));

  return { list, links };
}

const flushMutations = () => new Promise((resolve) => queueMicrotask(resolve));

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("initInsightsToc", () => {
  it("positions and sizes the indicator from the initial current link", () => {
    const { list, links } = mount();
    initInsightsToc();

    expect(list.style.getPropertyValue("--insights-toc-t")).toBe("48px");
    expect(list.style.getPropertyValue("--insights-toc-h")).toBe("48px");
    expect(links[1].hasAttribute("data-insights-toc-current")).toBe(true);
  });

  it("preserves the last position and active styling while no link is current", async () => {
    const { list, links } = mount();
    initInsightsToc();

    links[1].classList.remove("w--current");
    await flushMutations();

    expect(list.style.getPropertyValue("--insights-toc-t")).toBe("48px");
    expect(list.style.getPropertyValue("--insights-toc-h")).toBe("48px");
    expect(links[1].hasAttribute("data-insights-toc-current")).toBe(true);
  });

  it("moves only when another link becomes current", async () => {
    const { list, links } = mount();
    initInsightsToc();

    links[1].classList.remove("w--current");
    await flushMutations();
    links[2].classList.add("w--current");
    await flushMutations();

    expect(list.style.getPropertyValue("--insights-toc-t")).toBe("108px");
    expect(list.style.getPropertyValue("--insights-toc-h")).toBe("24px");
    expect(links[1].hasAttribute("data-insights-toc-current")).toBe(false);
    expect(links[2].hasAttribute("data-insights-toc-current")).toBe(true);
  });

  it("is idempotent when initialised again after a CMS update", () => {
    const { list } = mount();
    initInsightsToc();
    initInsightsToc();

    expect(list.hasAttribute("data-insights-toc-ready")).toBe(true);
    expect(list.style.getPropertyValue("--insights-toc-h")).toBe("48px");
  });
});
