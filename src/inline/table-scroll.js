import { initTableScroll } from '../modules/table-scroll.js';

const start = () => {
  if (window.__elTableScroll) window.__elTableScroll.refresh();
  else window.__elTableScroll = initTableScroll(document);
};
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else start();
