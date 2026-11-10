import { beforeEach, describe, expect, it, vi } from "vitest";

import { initInsurerSort, sortListItems } from "./insurer-sort.js";

const CONTROL_CONFIGS = [
  { id: "claims-paid-desc", fieldKey: "claims-paid", direction: "desc" },
  { id: "claims-paid-asc", fieldKey: "claims-paid", direction: "asc" },
  { id: "amount-paid-desc", fieldKey: "amount-paid", direction: "desc" },
  { id: "amount-paid-asc", fieldKey: "amount-paid", direction: "asc" },
  { id: "average-payout-desc", fieldKey: "average-payout", direction: "desc" },
  { id: "average-payout-asc", fieldKey: "average-payout", direction: "asc" },
];

function mountControls(checkedId = "claims-paid-desc") {
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
      fieldKey: "claims-paid",
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

  it("sorts formatted payout amounts by value", () => {
    const items = ["£860 million", "£1.2 billion", "£750,000"].map((value) => ({
      fields: { "amount-paid": { type: "text", value } },
    }));

    expect(
      sortListItems(items, { fieldKey: "amount-paid", direction: "desc" }).map(
        (x) => x.fields["amount-paid"].value
      )
    ).toEqual(["£1.2 billion", "£860 million", "£750,000"]);
  });

  // Catch lexicographic decimal sorting and treating blank/null values as zero.
  it.each(["asc", "desc"])("sorts decimal claims text numerically, missing last (%s)", (direction) => {
    const items = [
      { id: "middle", fields: { "claims-paid": { type: "text", value: ["98.75"] } } },
      { id: "high", fields: { "claims-paid": { type: "text", value: ["98.8"] } } },
      { id: "low", fields: { "claims-paid": { type: "text", value: ["97.9"] } } },
      { id: "blank", fields: { "claims-paid": { type: "text", value: [""] } } },
      { id: "null", fields: { "claims-paid": { type: "number", value: null } } },
      { id: "absent", fields: {} },
    ];
    expect(sortListItems(items, { fieldKey: "claims-paid", direction }).map(x => x.id)).toEqual(
      direction === "asc" ? ["low", "middle", "high", "blank", "null", "absent"] : ["high", "middle", "low", "blank", "null", "absent"]
    );
  });

  // Catch missed compact units and unknown amounts being parsed as zero.
  it.each(["amount-paid", "average-payout"].flatMap(fieldKey => ["asc", "desc"].map(direction => ({ fieldKey, direction }))))(
    "sorts compact/long money units and keeps missing values last: $fieldKey $direction",
    ({ fieldKey, direction }) => {
      const items = [
        ["billion", "£1.2bn"], ["million", "£860m"], ["thousand", "£900k"],
        ["plain", "£1,200"], ["zero", "£0"], ["long", "£1.5 million"],
        ["blank", ""], ["unknown", "Not supplied"], ["null", null],
      ].map(([id, value]) => ({ id, fields: { [fieldKey]: { type: "text", value: [value] } } }));
      items.push({ id: "absent", fields: {} });
      expect(sortListItems(items, { fieldKey, direction }).map(x => x.id)).toEqual(direction === "asc"
        ? ["zero", "plain", "thousand", "long", "million", "billion", "blank", "unknown", "null", "absent"]
        : ["billion", "million", "long", "thousand", "plain", "zero", "blank", "unknown", "null", "absent"]);
    }
  );

  it.each(["asc", "desc"])("keeps missing numeric values after a real zero (%s)", (direction) => {
    const items = [item(NaN), item(null), item(0), item(98.7), item(undefined)];
    expect(sortListItems(items, { fieldKey: "score", direction }).map(x => x.fields.score.value)).toEqual(
      direction === "asc" ? [0, 98.7, NaN, null, undefined] : [98.7, 0, NaN, null, undefined]
    );
  });
});
