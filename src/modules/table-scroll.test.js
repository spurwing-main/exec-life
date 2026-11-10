import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initTableScroll } from './table-scroll.js';

let controller;
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});
afterEach(() => {
  controller?.destroy(); controller = null;
  document.body.innerHTML = ''; vi.unstubAllGlobals();
});
const table = '<table><thead><tr><th scope="col">Age</th><th scope="col">Premium</th></tr></thead><tbody><tr><td>30</td><td>£18.25</td></tr></tbody></table>';
const sizes = (el, client, scroll) => {
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: client });
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scroll });
};
describe('table-only horizontal scrolling', () => {
  it('isolates only the table, preserving prose, source links and exact table markup', () => {
    document.body.innerHTML = `<div class="w-richtext"><div class="rli-compare-wrap"><p>Before</p>${table}<p>Rates note <a href="/source">Source</a></p></div></div>`;
    const original = document.querySelector('table').outerHTML;
    controller = initTableScroll();
    const wrapper = document.querySelector('[data-el-table-scroll]');
    expect(wrapper.children.length).toBe(1);
    expect(wrapper.firstElementChild.outerHTML).toBe(original);
    expect(wrapper.querySelector('p,a')).toBeNull();
    expect(wrapper.previousElementSibling.textContent).toBe('Before');
    expect(wrapper.nextElementSibling.querySelector('a').getAttribute('href')).toBe('/source');
  });
  it('reuses an existing table-only embed rather than nesting scroll containers', () => {
    document.body.innerHTML = `<div class="w-richtext"><div class="w-embed" id="original">${table}</div></div>`;
    controller = initTableScroll();
    expect(document.querySelector('[data-el-table-scroll]').id).toBe('original');
    expect(document.querySelectorAll('[data-el-table-scroll]').length).toBe(1);
    expect(document.querySelector('table').parentElement.id).toBe('original');
  });
  it('moves the keyboard region from the whole answer onto the overflowing table only', () => {
    document.body.innerHTML = `<div data-article-accordion><button data-faq-toggle>Quote examples</button><div data-article-table-scroll role="region" tabindex="0" aria-label="Accordion content and tables"><div class="w-richtext"><p>Intro</p>${table}<p>Note</p></div></div></div>`;
    controller = initTableScroll();
    const outer = document.querySelector('[data-article-table-scroll]');
    const wrapper = document.querySelector('[data-el-table-scroll]');
    sizes(wrapper, 250, 700); controller.refresh();
    expect(outer.hasAttribute('tabindex')).toBe(false);
    expect(outer.hasAttribute('role')).toBe(false);
    expect(wrapper.getAttribute('tabindex')).toBe('0');
    expect(wrapper.getAttribute('role')).toBe('region');
    expect(wrapper.getAttribute('aria-label')).toContain('Quote examples');
    sizes(wrapper, 900, 900); controller.refresh();
    expect(wrapper.hasAttribute('tabindex')).toBe(false);
    expect(wrapper.hasAttribute('role')).toBe(false);
  });
  it('enhances dynamic CMS tables once and keeps separate notes outside each wrapper', async () => {
    document.body.innerHTML = '<div class="w-richtext" id="body"></div>';
    controller = initTableScroll();
    document.querySelector('#body').innerHTML = `${table}<p>Between</p>${table}<p>After</p>`;
    await new Promise(resolve => setTimeout(resolve, 0));
    initTableScroll().refresh();
    expect(document.querySelectorAll('[data-el-table-scroll]').length).toBe(2);
    expect(document.querySelector('[data-el-table-scroll] [data-el-table-scroll]')).toBeNull();
    expect([...document.querySelectorAll('p')].every(p => !p.closest('[data-el-table-scroll]'))).toBe(true);
  });
  it('preserves existing accessible names and restores authored structure on cleanup', () => {
    document.body.innerHTML = `<div data-insurer-table role="region" tabindex="0" aria-label="Business protection products"><div class="w-richtext"><p>Intro</p>${table}<p>Note</p></div></div>`;
    const outer = document.querySelector('[data-insurer-table]');
    const originalTable = document.querySelector('table');
    controller = initTableScroll();
    const wrapper = document.querySelector('[data-el-table-scroll]');
    sizes(wrapper, 250, 700); controller.refresh();
    expect(wrapper.getAttribute('aria-label')).toContain('Business protection products');
    controller.destroy(); controller = null;
    expect(document.querySelector('[data-el-table-scroll]')).toBeNull();
    expect(document.querySelector('table')).toBe(originalTable);
    expect(outer.getAttribute('aria-label')).toBe('Business protection products');
    expect(outer.getAttribute('tabindex')).toBe('0');
  });
  it('uses a caption as the table name and leaves non-content layout tables alone', () => {
    document.body.innerHTML = `<table id="layout"><tr><td>Layout</td></tr></table><div class="w-richtext"><table><caption>Monthly premiums</caption><tr><td>£18.25</td></tr></table></div>`;
    controller = initTableScroll();
    const wrapper = document.querySelector('[data-el-table-scroll]');
    sizes(wrapper, 250, 700); controller.refresh();
    expect(wrapper.getAttribute('aria-label')).toContain('Monthly premiums');
    expect(document.querySelector('#layout').parentElement).toBe(document.body);
  });
  it('does not add keyboard targets inside closed FAQs and updates when they open', async () => {
    document.body.innerHTML = `<div data-faq data-faq-ready data-faq-active="true"><div data-faq-item data-open="false"><div class="w-richtext">${table}</div></div></div>`;
    controller = initTableScroll();
    const wrapper = document.querySelector('[data-el-table-scroll]');
    const item = document.querySelector('[data-faq-item]');
    sizes(wrapper, 250, 700); controller.refresh();
    expect(wrapper.hasAttribute('tabindex')).toBe(false);
    item.setAttribute('data-open', 'true');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(wrapper.getAttribute('tabindex')).toBe('0');
    item.setAttribute('data-open', 'false');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(wrapper.hasAttribute('tabindex')).toBe(false);
  });
});
