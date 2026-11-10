const installed = new WeakMap();

/** Follow the existing Resources disclosure state; never control it here. */
export function initResourceFilterLabels(root = document) {
  if (installed.has(root)) return installed.get(root);
  const records = [...root.querySelectorAll('.filters-close-btn[data-faq-toggle]')].map(button => {
    const item = button.closest('[data-faq-item]');
    const originalLabel = button.getAttribute('aria-label');
    const update = () => {
      const expanded = button.getAttribute('aria-expanded');
      const open = expanded === null ? item?.getAttribute('data-open') === 'true' : expanded === 'true';
      button.setAttribute('aria-label', open ? 'Close filters' : 'Open filters');
    };
    const observer = new MutationObserver(update);
    observer.observe(button, { attributes: true, attributeFilter: ['aria-expanded'] });
    if (item) observer.observe(item, { attributes: true, attributeFilter: ['data-open'] });
    update();
    return { button, originalLabel, observer };
  });
  const controller = {
    destroy() {
      records.forEach(({ button, originalLabel, observer }) => {
        observer.disconnect();
        if (originalLabel === null) button.removeAttribute('aria-label');
        else button.setAttribute('aria-label', originalLabel);
      });
      installed.delete(root);
    },
  };
  installed.set(root, controller);
  return controller;
}
