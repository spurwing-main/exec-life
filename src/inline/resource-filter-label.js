import { initResourceFilterLabels } from '../modules/resource-filter-label.js';

const start = () => {
  window.__elResourceFilterLabels ||= initResourceFilterLabels(document);
};
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else start();
