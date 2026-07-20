/**
 * Shared DOM utilities used across modules.
 */

/** querySelectorAll as array */
export function qsa(root, selector) {
  return Array.from(root.querySelectorAll(selector));
}

/** querySelector shorthand */
export function qs(root, selector) {
  return selector ? root.querySelector(selector) : null;
}

/**
 * Returns true if the element is considered visible in the layout.
 */
export function isVisible(element) {
  return !!(element && (element.offsetWidth || element.offsetHeight || element.getClientRects().length));
}

/** Basic element check (used by forms and other modules) */
export function isElement(value) {
  return value instanceof Element;
}

/**
 * CSS.escape with fallback.
 */
export function escapeSelector(value) {
  if (window.CSS && CSS.escape) {
    return CSS.escape(value);
  }
  return String(value).replace(/'/g, "\\'");
}

/**
 * Find closest ancestor matching selector, but only if it is within the given root.
 */
export function closestWithin(root, target, selector) {
  if (!isElement(target)) return null;
  const element = target.closest(selector);
  if (!element || !root.contains(element)) return null;
  return element;
}
