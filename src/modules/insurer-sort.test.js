import { beforeEach, describe, expect, it, vi } from "vitest";

import { initInsurerSort, SORT_CONTROLS, sortListItems } from "./insurer-sort.js";

function mountControls() {
  document.body.innerHTML = `
    <section data-faq>
      <form id="wf-form-insurers-filters">
        ${SORT_CONTROLS.map(
          ({ id }) => `<input id="${id}" type="radio" name="${id.split("-").slice(0, -1).join("-")}">`
        ).join("")}
      </form>
      <div fs-list-element="list"></div>
    </section>
  `;
}

function makeListInstance() {
  const callbacks = [];
  const instance = {
    listElement: document.querySelector('[fs-list-element="list"]'),
    sorting: { value: {} },
    hooks: { sort: { callbacks } },
    addHook: vi.fn((key, callback) => {
      callbacks.push(callback);
      return vi.fn();
    }),
    triggerHook: vi.fn(),
  };

  return instance;
}

beforeEach(() => {
  mountControls();
  window.FinsweetAttributes = [];
});

describe("initInsurerSort", () => {
  it.each(SORT_CONTROLS)("maps $id to $fieldKey $direction", (config) => {
    initInsurerSort();

    const instance = makeListInstance();
    const [, ready] = window.FinsweetAttributes[0];
    ready([instance]);

    document.getElementById(config.id).click();

    expect(instance.sorting.value).toEqual({
      fieldKey: config.fieldKey,
      direction: config.direction,
      interacted: true,
    });
    expect(instance.triggerHook).toHaveBeenCalledWith("sort", {
      scrollToAnchor: true,
      resetCurrentPage: true,
    });
  });

  it("queues and wires the form only once", () => {
    initInsurerSort();
    initInsurerSort();

    expect(window.FinsweetAttributes).toHaveLength(1);

    const instance = makeListInstance();
    const [, ready] = window.FinsweetAttributes[0];
    ready([instance]);
    ready([instance]);

    expect(instance.addHook).toHaveBeenCalledTimes(1);
  });
});

describe("sortListItems", () => {
  const item = (value, type = "number") => ({
    fields: { score: { type, value } },
  });

  it("sorts numeric fields in either direction without mutating the input", () => {
    const items = [item(90), item(68), item(92)];

    expect(sortListItems(items, { fieldKey: "score", direction: "asc" }).map((x) => x.fields.score.value)).toEqual([
      68, 90, 92,
    ]);
    expect(sortListItems(items, { fieldKey: "score", direction: "desc" }).map((x) => x.fields.score.value)).toEqual([
      92, 90, 68,
    ]);
    expect(items.map((x) => x.fields.score.value)).toEqual([90, 68, 92]);
  });

  it("uses natural text ordering for financial ratings", () => {
    const items = [item("A+", "text"), item("AA", "text"), item("A", "text")];

    expect(sortListItems(items, { fieldKey: "score", direction: "desc" }).map((x) => x.fields.score.value)).toEqual([
      "AA", "A+", "A",
    ]);
  });
});
