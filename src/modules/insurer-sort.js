/**
 * Sort controls for the insurer comparison.
 *
 * The filter form has radio inputs for 3 sort fields.
 * The HTML defines each field and direction with data attributes.
 * All controls use the `sort` name.
 * The selected control sets the first sort when the list starts.
 *
 * The collection values keep their `fs-list-field` attributes.
 * This module adds a sort hook to the Finsweet List instance.
 * Finsweet does not add the hook if the page does not have a native sort trigger.
 */

const FORM_SELECTOR = "#wf-form-insurers-filters";
const LIST_SELECTOR = '[fs-list-element="list"]';
const CONTROL_SELECTOR = 'input[name="sort"][data-field-key][data-sort-direction]';

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

  const applySort = ({ fieldKey, direction }, interacted) => {
    listInstance.sorting.value = { fieldKey, direction, interacted };

    // The native sort function starts the sort lifecycle after a value changes.
    // If there is no native sort trigger, this module starts the lifecycle.
    if (!hasSortHook) {
      listInstance.triggerHook("sort", {
        scrollToAnchor: interacted,
        resetCurrentPage: true,
      });
    }
  };

  controls.forEach(({ input, fieldKey, direction }) => {
    // Use `click` because a selected radio input does not cause a `change` event.
    input.addEventListener("click", () => applySort({ fieldKey, direction }, true));
  });

  form.setAttribute("data-insurer-sort-ready", "");

  const selectedControl = controls.find(({ input }) => input.checked);
  if (selectedControl) applySort(selectedControl, false);
}

export function initInsurerSort(root = document) {
  const form = root.querySelector(FORM_SELECTOR);
  if (!form || form.hasAttribute("data-insurer-sort-queued")) return;

  const controls = [...form.querySelectorAll(CONTROL_SELECTOR)]
    .map((input) => ({
      input,
      fieldKey: input.dataset.fieldKey?.trim(),
      direction: input.dataset.sortDirection?.trim(),
    }))
    .filter(({ fieldKey, direction }) => fieldKey && (direction === "asc" || direction === "desc"));

  if (!controls.length) return;

  form.setAttribute("data-insurer-sort-queued", "");

  window.FinsweetAttributes = window.FinsweetAttributes || [];
  window.FinsweetAttributes.push([
    "list",
    (listInstances) => setupControls(form, controls, listInstances || []),
  ]);
}

export default initInsurerSort;
