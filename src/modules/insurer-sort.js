/**
 * Sort controls for the insurer comparison.
 *
 * The filter form has radio inputs for 3 sort fields.
 * Finsweet List Sort uses each input to select the ascending or descending direction.
 * This behavior conflicts with the interface because each radio input has one direction.
 * Thus, these controls do not have `fs-list-*` attributes.
 * This module uses these control IDs:
 *
 *   life-payout-rate-desc
 *   life-payout-rate-asc
 *   overall-payout-rate-desc
 *   overall-payout-rate-asc
 *   financial-rating-desc
 *   financial-rating-asc
 *
 * The collection values keep their `fs-list-field` attributes.
 * This module adds a sort hook to the Finsweet List instance.
 * Finsweet does not add the hook if the page does not have a native sort trigger.
 */

const FORM_SELECTOR = "#wf-form-insurers-filters";
const LIST_SELECTOR = '[fs-list-element="list"]';

export const SORT_CONTROLS = [
  { id: "life-payout-rate-desc", fieldKey: "life-payout-rate", direction: "desc" },
  { id: "life-payout-rate-asc", fieldKey: "life-payout-rate", direction: "asc" },
  { id: "overall-payout-rate-desc", fieldKey: "overall-payout-rate", direction: "desc" },
  { id: "overall-payout-rate-asc", fieldKey: "overall-payout-rate", direction: "asc" },
  { id: "financial-rating-desc", fieldKey: "financial-rating", direction: "desc" },
  { id: "financial-rating-asc", fieldKey: "financial-rating", direction: "asc" },
];

const firstValue = (value) => (Array.isArray(value) ? value[0] : value);

/**
 * Compare the list items with the same rules that Finsweet uses.
 * Put items that do not have the field at the end.
 * Use the Finsweet field types: `number`, `date`, and `text`.
 */
export function sortListItems(items, { fieldKey, direction }) {
  if (!fieldKey || !direction || !items.some((item) => fieldKey in (item.fields || {}))) {
    return items;
  }

  return [...items].sort((firstItem, secondItem) => {
    const firstField = firstItem.fields?.[fieldKey];
    const secondField = secondItem.fields?.[fieldKey];

    if (!firstField) return 1;
    if (!secondField) return -1;

    const first = firstValue(firstField.value);
    const second = firstValue(secondField.value);
    const sign = direction === "asc" ? 1 : -1;

    if (firstField.type === "number" && secondField.type === "number") {
      if (Number.isNaN(first)) return 1;
      if (Number.isNaN(second)) return -1;
      return (first - second) * sign;
    }

    if (firstField.type === "date" && secondField.type === "date") {
      return (first.getTime() - second.getTime()) * sign;
    }

    return String(first).localeCompare(String(second), undefined, {
      numeric: true,
      sensitivity: "base",
    }) * sign;
  });
}

function findListInstance(form, listInstances) {
  const scope = form.closest("[data-faq]") || document;
  const listElement = scope.querySelector(LIST_SELECTOR);
  const matchingInstance = listInstances.find((instance) => instance.listElement === listElement);

  if (matchingInstance) return matchingInstance;
  if (listInstances.length === 1) return listInstances[0];
}

function setupControls(form, controls, listInstances) {
  if (!form.isConnected || form.hasAttribute("data-insurer-sort-ready")) return;

  const listInstance = findListInstance(form, listInstances);
  if (!listInstance) {
    console.warn("[el] insurer-sort: no matching Finsweet List instance");
    return;
  }

  if (typeof listInstance.addHook !== "function" || typeof listInstance.triggerHook !== "function") {
    console.warn("[el] insurer-sort: unsupported Finsweet List API");
    return;
  }

  // Finsweet adds this hook only if it finds a native sort trigger.
  // Do not add a second hook if a valid trigger already added one.
  const hasSortHook = (listInstance.hooks?.sort?.callbacks?.length || 0) > 0;
  if (!hasSortHook) {
    listInstance.addHook("sort", (items) => sortListItems(items, listInstance.sorting.value));
  }

  controls.forEach(({ input, fieldKey, direction }) => {
    // Use `click` because a selected radio input does not cause a `change` event.
    input.addEventListener("click", () => {
      listInstance.sorting.value = { fieldKey, direction, interacted: true };

      // The native sort function starts the sort lifecycle after a value changes.
      // If there is no native sort trigger, this module starts the lifecycle.
      if (!hasSortHook) {
        listInstance.triggerHook("sort", {
          scrollToAnchor: true,
          resetCurrentPage: true,
        });
      }
    });
  });

  form.setAttribute("data-insurer-sort-ready", "");
}

export function initInsurerSort(root = document) {
  const form = root.querySelector(FORM_SELECTOR);
  if (!form || form.hasAttribute("data-insurer-sort-queued")) return;

  const controls = SORT_CONTROLS.map((config) => ({
    ...config,
    input: form.querySelector(`#${config.id}`),
  })).filter(({ input }) => input);

  if (!controls.length) return;

  form.setAttribute("data-insurer-sort-queued", "");

  window.FinsweetAttributes = window.FinsweetAttributes || [];
  window.FinsweetAttributes.push([
    "list",
    (listInstances) => setupControls(form, controls, listInstances || []),
  ]);
}

export default initInsurerSort;
