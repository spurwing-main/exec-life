import { beforeEach, describe, expect, it, vi } from "vitest";

import { initInsurerSort, sortListItems } from "./insurer-sort.js";

const CONTROL_CONFIGS = [
  { id: "life-payout-rate-desc", fieldKey: "life-payout-rate", direction: "desc" },
  { id: "life-payout-rate-asc", fieldKey: "life-payout-rate", direction: "asc" },
  { id: "overall-payout-rate-desc", fieldKey: "overall-payout-rate", direction: "desc" },
  { id: "overall-payout-rate-asc", fieldKey: "overall-payout-rate", direction: "asc" },
  { id: "financial-rating-desc", fieldKey: "financial-rating", direction: "desc" },
  { id: "financial-rating-asc", fieldKey: "financial-rating", direction: "asc" },
];

function mountControls(checkedId = "life-payout-rate-desc") {
  document.body.innerHTML = `
    <section data-faq>
      <form id="wf-form-insurers-filters">
        ${CONTROL_CONFIGS.map(
          ({ id, fieldKey, direction }) =>
            `<input id="${id}" type="radio" name="sort" data-field-key="${fieldKey}" data-sort-direction="${direction}" ${
              id === checkedId ? "checked" : ""
            }>`
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
  it.each(CONTROL_CONFIGS)("reads $fieldKey $direction from the $id control", (config) => {
    initInsurerSort();

    const instance = makeListInstance();
    const [, ready] = window.FinsweetAttributes[0];
    ready([instance]);
    instance.triggerHook.mockClear();

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

  it("applies the checked control when the list starts", () => {
    initInsurerSort();

    const instance = makeListInstance();
    const [, ready] = window.FinsweetAttributes[0];
    ready([instance]);

    expect(instance.sorting.value).toEqual({
      fieldKey: "life-payout-rate",
      direction: "desc",
      interacted: false,
    });
    expect(instance.triggerHook).toHaveBeenCalledWith("sort", {
      scrollToAnchor: false,
      resetCurrentPage: true,
    });
  });

  it("does not start a sort when no control is checked", () => {
    mountControls(null);
    initInsurerSort();

    const instance = makeListInstance();
    const [, ready] = window.FinsweetAttributes[0];
    ready([instance]);

    expect(instance.sorting.value).toEqual({});
    expect(instance.triggerHook).not.toHaveBeenCalled();
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
