import { describe, it, expect, beforeEach } from "vitest";
import { initFaq } from "./faq.js";

/** Build the FAQ markup the Designer produces. First item open by default. */
function mount({ multi = false, openIndex = 0 } = {}) {
  const attr = multi ? ' data-faq="multi"' : " data-faq";
  document.body.innerHTML = `
    <div class="faq_list"${attr}>
      ${[0, 1, 2, 3]
        .map(
          (i) => `
        <div class="faq_item" data-faq-item data-open="${i === openIndex ? "true" : "false"}">
          <button class="faq_toggle" data-faq-toggle type="button" aria-expanded="${i === openIndex ? "true" : "false"}">
            <div class="faq_icon" aria-hidden="true"></div>
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

describe("initFaq", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
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
    // a11y wiring applied
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
});

describe("initFaq — CMS Collection List defaults", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("opens the first item when the template marks nothing open", () => {
    // A Collection List stamps one template across every item, so data-open is
    // uniformly "false" and cannot single out the first.
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
