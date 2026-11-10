/** Keep horizontal scrolling and its keyboard target on each content table. */
const selector = '.w-richtext table, .text-rich-text table, .el-dt-scroll table, .rli-compare-wrap table, [data-insurer-table] table';
const installed = new WeakMap();
const attrs = ['role', 'tabindex', 'aria-label', 'data-el-table-scroll'];
const snapshot = el => new Map(attrs.map(name => [name, el.getAttribute(name)]));
const restore = (el, values) => values.forEach((value, name) => {
  if (value === null) el.removeAttribute(name);
  else el.setAttribute(name, value);
});

export function initTableScroll(root = document) {
  if (installed.has(root)) return installed.get(root);
  const doc = root.ownerDocument || root;
  const records = new Map();
  const legacy = new Map();
  let queued = false;
  let active = true;
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => update()) : null;

  function nameFor(table, oldContainer) {
    const caption = table.caption?.textContent.trim();
    if (caption) return caption;
    const supplied = oldContainer && legacy.get(oldContainer)?.get('aria-label');
    if (supplied && !/^Accordion content/i.test(supplied)) return supplied;
    const article = table.closest('[data-article-accordion]');
    const question = (article?.querySelector('.faq_question') || article?.querySelector('[data-faq-toggle]'))?.textContent.trim();
    if (question) return question;
    const body = table.closest('.w-richtext, .text-rich-text');
    const headings = body ? [...body.querySelectorAll('h2,h3,h4,h5,h6')] : [];
    return headings.filter(h => h.compareDocumentPosition(table) & 4).at(-1)?.textContent.trim() || 'Table';
  }

  function add(table) {
    if (records.has(table) || table.parentElement?.closest('table')) return;
    const parent = table.parentElement;
    if (!parent) return;
    // Reuse only wrappers whose visible content is exclusively this table.
    // A wrapper containing a rates note or source must stay outside the scroller.
    const pure = parent.matches('.w-embed,.el-dt-scroll,.rli-compare-wrap') &&
      [...parent.childNodes].every(n => n === table || n.nodeType === 8 ||
        (n.nodeType === 3 && !n.textContent.trim()) ||
        (n.nodeType === 1 && /^(STYLE|SCRIPT)$/.test(n.tagName)));
    const wrapper = pure ? parent : doc.createElement('div');
    const original = snapshot(wrapper);
    if (!pure) { parent.insertBefore(wrapper, table); wrapper.appendChild(table); }
    const outer = wrapper.parentElement?.closest('[data-article-table-scroll],[data-insurer-table]');
    if (outer && !legacy.has(outer)) {
      legacy.set(outer, snapshot(outer));
      for (const key of ['tabindex', 'role', 'aria-label']) outer.removeAttribute(key);
    }
    const label = nameFor(table, outer).slice(0, 180);
    wrapper.setAttribute('data-el-table-scroll', '');
    records.set(table, { wrapper, original, created: !pure, label });
    observer?.observe(wrapper); observer?.observe(table);
  }

  function update() {
    for (const [table, record] of records) {
      const { wrapper, original, label } = record;
      if (!table.isConnected) continue;
      const faq = wrapper.closest('[data-faq]');
      const closed = faq?.getAttribute('data-faq-active') === 'true' &&
        wrapper.closest('[data-faq-item]')?.getAttribute('data-open') === 'false';
      if (!closed && wrapper.clientWidth > 0 && wrapper.scrollWidth > wrapper.clientWidth + 1) {
        wrapper.setAttribute('tabindex', '0');
        wrapper.setAttribute('role', 'region');
        wrapper.setAttribute('aria-label', `${label} — scroll horizontally for more columns`);
      } else {
        for (const key of ['tabindex', 'role', 'aria-label']) {
          const value = original.get(key);
          if (closed || value === null) wrapper.removeAttribute(key);
          else wrapper.setAttribute(key, value);
        }
      }
    }
  }

  function refresh() {
    if (!active) return;
    if (root.matches?.(selector)) add(root);
    root.querySelectorAll(selector).forEach(add);
    update();
  }
  const mutations = new MutationObserver(() => {
    if (queued || !active) return;
    queued = true;
    queueMicrotask(() => { queued = false; refresh(); });
  });
  const controller = {
    refresh,
    destroy() {
      active = false; mutations.disconnect(); observer?.disconnect();
      for (const [table, { wrapper, original, created }] of records) {
        if (created && table.parentElement === wrapper) wrapper.replaceWith(table);
        else restore(wrapper, original);
      }
      legacy.forEach((values, el) => restore(el, values));
      installed.delete(root);
    },
  };
  installed.set(root, controller);
  refresh();
  mutations.observe(root.body || root, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['data-open', 'data-faq-active'],
  });
  return controller;
}

export default initTableScroll;
