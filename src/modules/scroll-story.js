/**
 * Scroll-owned chapter stories for the reusable Why Executive Life component.
 *
 * The component keeps its existing Webflow-authored slides and navigation.
 * JavaScript only measures the section, stamps state attributes, and writes
 * normalized progress values for the component-scoped CSS to render.
 *
 * Markup contract:
 *   <section data-scroll-story>
 *     <div data-scroll-story-panels>
 *       <div>...copy and media...</div>
 *       ...
 *     </div>
 *     <div data-scroll-story-nav>
 *       <button>...</button>
 *       ...
 *     </div>
 *   </section>
 *
 * Panels and navigation items pair by position. The DOM fails open: without
 * `data-scroll-story-ready` the CSS presents the authored static layout.
 */

import { BREAKPOINT_PX } from "../utils/breakpoints.js";
import { closestWithin, qsa, reduceMotion } from "../utils/dom.js";

const ROOT_SELECTOR = "[data-scroll-story]";
const PANELS_SELECTOR = "[data-scroll-story-panels]";
const NAV_SELECTOR = "[data-scroll-story-nav]";
const TRANSITION_START = 0.55;

let uid = 0;

const clamp = (value, min = 0, max = 1) => Math.min(Math.max(value, min), max);

function directChildren(root, selector) {
  const container = root.querySelector(selector);
  return container ? Array.from(container.children) : [];
}

/** Normalize the section's current document position to a reversible 0–1 range. */
export function storyProgress({ sectionTop, sectionHeight, viewportHeight, scrollY }) {
  const distance = Math.max(sectionHeight - viewportHeight, 1);
  return clamp((scrollY - sectionTop) / distance);
}

/**
 * Return the visual state for every panel at a normalized story progress.
 * Each new chapter spends the final part of the preceding scroll segment
 * rising over the old image. The old image scales and dims by the same value.
 */
export function storyFrame(progress, panelCount) {
  if (!Number.isFinite(panelCount) || panelCount < 1) {
    return { active: -1, panels: [] };
  }

  const bounded = clamp(Number.isFinite(progress) ? progress : 0);
  const chapter = bounded * panelCount;
  const active = Math.min(Math.floor(chapter), panelCount - 1);
  const panels = Array.from({ length: panelCount }, (_, index) => {
    const incoming =
      index === 0
        ? 1
        : clamp((chapter - (index - 1 + TRANSITION_START)) / (1 - TRANSITION_START));
    const outgoing =
      index === panelCount - 1
        ? 0
        : clamp((chapter - (index + TRANSITION_START)) / (1 - TRANSITION_START));

    return {
      incoming,
      outgoing,
      content: clamp(incoming - outgoing),
    };
  });

  return { active, panels };
}

function setupStory(root) {
  if (root.hasAttribute("data-scroll-story-bound")) return null;

  const panels = directChildren(root, PANELS_SELECTOR);
  const navItems = directChildren(root, NAV_SELECTOR);
  if (panels.length < 2 || panels.length !== navItems.length) return null;

  const storyId = `scroll-story-${++uid}`;
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const widthQuery = window.matchMedia(`(min-width: ${BREAKPOINT_PX.tabletMin}px)`);
  let frameId = null;
  let mode = null;
  let active = -1;
  let sectionTop = 0;
  let sectionHeight = 0;
  let viewportHeight = 0;

  root.setAttribute("data-scroll-story-bound", "");
  root.style.setProperty("--scroll-story-count", String(panels.length));
  root.style.setProperty("--scroll-story-height", `${panels.length + 1}00svh`);

  navItems.forEach((item, index) => {
    const panel = panels[index];
    if (!item.id) item.id = `${storyId}-nav-${index + 1}`;
    if (!panel.id) panel.id = `${storyId}-panel-${index + 1}`;
    item.setAttribute("aria-controls", panel.id);
    item.setAttribute("aria-label", item.getAttribute("aria-label") || `Go to chapter ${index + 1}`);
    if (item.tagName === "BUTTON" && !item.hasAttribute("type")) item.setAttribute("type", "button");
    panel.style.setProperty("--scroll-story-index", String(index));
  });

  function setActive(index) {
    if (index === active) return;
    active = index;
    root.setAttribute("data-scroll-story-active", String(index + 1));
    panels.forEach((panel, panelIndex) => {
      panel.toggleAttribute("data-scroll-story-current", panelIndex === index);
      if (mode === "scroll") panel.setAttribute("aria-hidden", panelIndex !== index ? "true" : "false");
      else panel.removeAttribute("aria-hidden");
    });
    navItems.forEach((item, itemIndex) => {
      const current = itemIndex === index;
      item.toggleAttribute("data-scroll-story-current", current);
      if (current) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });
  }

  function measure() {
    const rect = root.getBoundingClientRect();
    viewportHeight = window.innerHeight;
    sectionTop = window.scrollY + rect.top;
    sectionHeight = root.offsetHeight || rect.height;
  }

  function render() {
    frameId = null;
    if (mode !== "scroll") return;
    const progress = storyProgress({ sectionTop, sectionHeight, viewportHeight, scrollY: window.scrollY });
    const state = storyFrame(progress, panels.length);
    root.style.setProperty("--scroll-story-progress", String(progress));
    state.panels.forEach((panelState, index) => {
      panels[index].style.setProperty("--scroll-story-in", String(panelState.incoming));
      panels[index].style.setProperty("--scroll-story-out", String(panelState.outgoing));
      panels[index].style.setProperty("--scroll-story-content", String(panelState.content));
      panels[index].style.setProperty("--scroll-story-media-y", `${(1 - panelState.incoming) * 100}%`);
      panels[index].style.setProperty("--scroll-story-media-scale", String(1 - panelState.outgoing * 0.08));
      panels[index].style.setProperty("--scroll-story-shade", String(panelState.outgoing * 0.28));
      panels[index].style.setProperty("--scroll-story-content-y", `${(1 - panelState.content) * 0.75}rem`);
    });
    setActive(state.active);
  }

  function requestRender() {
    if (frameId !== null || mode !== "scroll") return;
    frameId = window.requestAnimationFrame(render);
  }

  function clearPanelStyles() {
    root.style.removeProperty("--scroll-story-progress");
    panels.forEach((panel) => {
      panel.style.removeProperty("--scroll-story-in");
      panel.style.removeProperty("--scroll-story-out");
      panel.style.removeProperty("--scroll-story-content");
      panel.style.removeProperty("--scroll-story-media-y");
      panel.style.removeProperty("--scroll-story-media-scale");
      panel.style.removeProperty("--scroll-story-shade");
      panel.style.removeProperty("--scroll-story-content-y");
      panel.removeAttribute("aria-hidden");
    });
  }

  function updateMode() {
    const next = widthQuery.matches && !motionQuery.matches && !reduceMotion() ? "scroll" : "static";
    if (next === mode) {
      if (next === "scroll") {
        measure();
        requestRender();
      }
      return;
    }

    mode = next;
    root.setAttribute("data-scroll-story-mode", mode);
    // Ready must land before measuring scroll mode: it is the CSS gate that
    // expands the static fail-open stack into the tall sticky track.
    root.setAttribute("data-scroll-story-ready", "");
    if (mode === "scroll") {
      measure();
      render();
    } else {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      frameId = null;
      clearPanelStyles();
      setActive(0);
    }
  }

  function scrollToChapter(index) {
    if (mode !== "scroll") return;
    measure();
    const distance = Math.max(sectionHeight - viewportHeight, 0);
    const progress = index / panels.length;
    window.scrollTo({
      top: sectionTop + distance * progress,
      behavior: "smooth",
    });
  }

  function onClick(event) {
    const item = closestWithin(root, event.target, `${NAV_SELECTOR} > *`);
    if (!item) return;
    const index = navItems.indexOf(item);
    if (index >= 0) scrollToChapter(index);
  }

  function onKeydown(event) {
    const item = closestWithin(root, event.target, `${NAV_SELECTOR} > *`);
    if (!item) return;
    const current = navItems.indexOf(item);
    if (current < 0) return;
    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % navItems.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (current - 1 + navItems.length) % navItems.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = navItems.length - 1;
    if (next < 0) return;
    event.preventDefault();
    navItems[next].focus();
    scrollToChapter(next);
  }

  root.addEventListener("click", onClick);
  root.addEventListener("keydown", onKeydown);
  window.addEventListener("scroll", requestRender, { passive: true });
  window.addEventListener("resize", updateMode, { passive: true });
  widthQuery.addEventListener("change", updateMode);
  motionQuery.addEventListener("change", updateMode);
  updateMode();

  return () => {
    if (frameId !== null) window.cancelAnimationFrame(frameId);
    root.removeEventListener("click", onClick);
    root.removeEventListener("keydown", onKeydown);
    window.removeEventListener("scroll", requestRender);
    window.removeEventListener("resize", updateMode);
    widthQuery.removeEventListener("change", updateMode);
    motionQuery.removeEventListener("change", updateMode);
    clearPanelStyles();
    root.style.removeProperty("--scroll-story-count");
    root.style.removeProperty("--scroll-story-height");
    root.removeAttribute("data-scroll-story-active");
    root.removeAttribute("data-scroll-story-mode");
    root.removeAttribute("data-scroll-story-ready");
    root.removeAttribute("data-scroll-story-bound");
    panels.forEach((panel) => panel.removeAttribute("data-scroll-story-current"));
    navItems.forEach((item) => {
      item.removeAttribute("data-scroll-story-current");
      item.removeAttribute("aria-current");
    });
  };
}

export function initScrollStories(root = document) {
  const cleanups = qsa(root, ROOT_SELECTOR).map(setupStory).filter(Boolean);
  return () => cleanups.forEach((cleanup) => cleanup());
}

export default initScrollStories;
