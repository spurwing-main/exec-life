import { afterEach, describe, expect, it } from 'vitest';
import { initResourceFilterLabels } from './resource-filter-label.js';

let controller;
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const fixture = '<div data-faq-item data-open="false"><button class="filters-close-btn" data-faq-toggle aria-label="Close filters"><span>Open filters</span><span>Close filters</span></button></div><button data-faq-toggle aria-label="Other accordion">Other</button>';
afterEach(() => { controller?.destroy(); controller = null; document.body.innerHTML = ''; });

describe('Resources filter state labels', () => {
  it('names the closed control before and after the disclosure controller initialises', async () => {
    document.body.innerHTML = fixture;
    controller = initResourceFilterLabels();
    const button = document.querySelector('.filters-close-btn');
    expect(button.getAttribute('aria-label')).toBe('Open filters');
    button.setAttribute('aria-expanded', 'false'); await flush();
    expect(button.getAttribute('aria-label')).toBe('Open filters');
    expect(document.querySelector('button:not(.filters-close-btn)').getAttribute('aria-label')).toBe('Other accordion');
  });

  it('follows real open/closed state changes without changing the disclosure or filter data', async () => {
    document.body.innerHTML = fixture;
    const button = document.querySelector('.filters-close-btn');
    controller = initResourceFilterLabels();
    const content = button.innerHTML;
    button.setAttribute('aria-expanded', 'true'); await flush();
    expect(button.getAttribute('aria-label')).toBe('Close filters');
    button.setAttribute('aria-expanded', 'false'); await flush();
    expect(button.getAttribute('aria-label')).toBe('Open filters');
    expect(button.innerHTML).toBe(content);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.closest('[data-faq-item]').getAttribute('data-open')).toBe('false');
  });

  it('uses the exposed panel state when desktop removes aria-expanded, then follows mobile again', async () => {
    document.body.innerHTML = fixture;
    const button = document.querySelector('.filters-close-btn');
    controller = initResourceFilterLabels();
    button.closest('[data-faq-item]').setAttribute('data-open', 'true'); await flush();
    expect(button.getAttribute('aria-label')).toBe('Close filters');
    button.setAttribute('aria-expanded', 'true'); await flush();
    button.closest('[data-faq-item]').setAttribute('data-open', 'true');
    button.removeAttribute('aria-expanded'); await flush();
    expect(button.getAttribute('aria-label')).toBe('Close filters');
    button.setAttribute('aria-expanded', 'false'); await flush();
    expect(button.getAttribute('aria-label')).toBe('Open filters');
  });

  it('installs once and restores the original authored label on cleanup', async () => {
    document.body.innerHTML = fixture;
    controller = initResourceFilterLabels();
    expect(initResourceFilterLabels()).toBe(controller);
    const button = document.querySelector('.filters-close-btn');
    controller.destroy(); controller = null;
    expect(button.getAttribute('aria-label')).toBe('Close filters');
    button.setAttribute('aria-expanded', 'false'); await flush();
    expect(button.getAttribute('aria-label')).toBe('Close filters');
  });
});
