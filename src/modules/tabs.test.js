import { describe, it, expect, beforeEach, vi } from "vitest";
import { initTabs } from "./tabs.js";

/**
 * Build the markup the Designer produces now that the tabs and panels are
 * Collection Lists: no per-item attributes, identity is position only. The
 * `display: contents` wrapper Webflow puts around each list is included so the
 * module is exercised against the real nesting.
 */
function mount({ count = 3, active = 1 } = {}) {
  const n = [...Array(count).keys()];
  document.body.innerHTML = `
    <div class="who-help_tabs" data-tabs data-active="${active}" data-visible="false">
      <div class="u-display-contents">
        <div class="who-help_tablist w-dyn-items" data-tablist>
          ${n
            .map(
              (i) => `<div class="who-help_tab w-dyn-item">
                        <p class="who-help_tab-label">Tab ${i + 1}</p>
                        <div class="who-help_tab-bar"></div>
                      </div>`
            )
            .join("")}
        </div>
      </div>
      <div class="u-display-contents">
        <div class="who-help_panels w-dyn-items" data-panels>
          ${n
            .map(
              (i) => `<div class="who-help_panel w-dyn-item"><p>Panel ${i + 1}</p></div>`
            )
            .join("")}
        </div>
      </div>
    </div>`;
  return {
    root: document.querySelector("[data-tabs]"),
    tabs: Array.from(document.querySelectorAll("[data-tablist] > *")),
    panels: Array.from(document.querySelectorAll("[data-panels] > *")),
  };
}

const states = (els) => els.map((e) => e.getAttribute("data-state"));

/** jsdom has no AnimationEvent — a plain event carrying animationName is enough. */
function animationEnd(el, animationName) {
  const e = new Event("animationend", { bubbles: true });
  Object.defineProperty(e, "animationName", { value: animationName });
  el.dispatchEvent(e);
}

beforeEach(() => {
  document.body.innerHTML = "";
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    }
  );
});

describe("initTabs — positional contract", () => {
  it("activates the seeded index and marks only that tab/panel", () => {
    const { root, tabs, panels } = mount({ active: 1 });
    initTabs();

    expect(root.getAttribute("data-active")).toBe("1");
    expect(states(tabs)).toEqual(["active", null, null]);
    expect(states(panels)).toEqual(["active", null, null]);
  });

  it("honours a non-first seed", () => {
    const { tabs, panels } = mount({ active: 3 });
    initTabs();

    expect(states(tabs)).toEqual([null, null, "active"]);
    expect(states(panels)).toEqual([null, null, "active"]);
  });

  it("falls back to the first item when data-active is missing or junk", () => {
    const { root, tabs } = mount({ active: 1 });
    root.setAttribute("data-active", "banana");
    initTabs();

    expect(root.getAttribute("data-active")).toBe("1");
    expect(states(tabs)).toEqual(["active", null, null]);
  });

  it("pairs tab N with panel N on click, by position", () => {
    const { root, tabs, panels } = mount();
    initTabs();

    tabs[2].querySelector(".who-help_tab-label").click();

    expect(root.getAttribute("data-active")).toBe("3");
    expect(states(panels)).toEqual([null, null, "active"]);
  });

  it("wraps with arrow keys in both directions", () => {
    const { tabs, panels } = mount();
    initTabs();

    tabs[0].dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })
    );
    expect(states(panels)).toEqual([null, null, "active"]);

    tabs[2].dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
    );
    expect(states(panels)).toEqual(["active", null, null]);
  });

  it("advances on tabFill animationend only while visible", () => {
    const { root, panels } = mount();
    initTabs();

    const fill = () =>
      animationEnd(
        root.querySelector('[data-state="active"] .who-help_tab-bar'),
        "tabFill"
      );

    // data-visible is "false" — the observer stub never reports visibility.
    fill();
    expect(states(panels)).toEqual(["active", null, null]);

    root.setAttribute("data-visible", "true");
    fill();
    expect(states(panels)).toEqual([null, "active", null]);
  });

  it("ignores animations that are not tabFill", () => {
    const { root, panels } = mount();
    initTabs();
    root.setAttribute("data-visible", "true");

    animationEnd(
      root.querySelector('[data-state="active"] .who-help_tab-bar'),
      "somethingElse"
    );

    expect(states(panels)).toEqual(["active", null, null]);
  });

  it("scales to any item count without code changes", () => {
    const { tabs, panels } = mount({ count: 6, active: 6 });
    initTabs();

    expect(tabs).toHaveLength(6);
    expect(states(panels)).toEqual([null, null, null, null, null, "active"]);
  });

  it("wires aria roles and pairs ids, since a Collection List cannot", () => {
    const { tabs, panels } = mount();
    initTabs();

    expect(document.querySelector("[data-tablist]").getAttribute("role")).toBe("tablist");
    expect(tabs.map((t) => t.getAttribute("role"))).toEqual(["tab", "tab", "tab"]);
    expect(panels.map((p) => p.getAttribute("role"))).toEqual([
      "tabpanel",
      "tabpanel",
      "tabpanel",
    ]);
    expect(tabs[0].getAttribute("aria-controls")).toBe(panels[0].id);
    expect(panels[0].getAttribute("aria-labelledby")).toBe(tabs[0].id);
    expect(tabs.map((t) => t.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
  });

  it("sets data-ready so the CSS can stop favouring :first-child", () => {
    const { root } = mount();
    initTabs();
    expect(root.hasAttribute("data-ready")).toBe(true);
  });

  it("leaves the DOM alone when the lists disagree, so CSS fails open", () => {
    mount();
    document.querySelector("[data-panels] > *").remove(); // 3 tabs, 2 panels
    initTabs();

    const root = document.querySelector("[data-tabs]");
    expect(root.hasAttribute("data-ready")).toBe(false);
    expect(document.querySelectorAll('[data-state="active"]')).toHaveLength(0);
  });

  it("leaves a single-item list alone", () => {
    mount({ count: 1 });
    initTabs();
    expect(document.querySelector("[data-tabs]").hasAttribute("data-ready")).toBe(false);
  });
});
