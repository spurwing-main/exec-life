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
 * Find the closest ancestor matching `selector`, but only if it stays within
 * `root`. Used by the delegated click/keydown handlers so a listener on a
 * section root can resolve the control that was actually activated.
 */
export function closestWithin(root, target, selector) {
  if (!(target instanceof Element)) return null;
  const element = target.closest(selector);
  if (!element || !root.contains(element)) return null;
  return element;
}
