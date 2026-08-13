import { BREAKPOINT_PX } from "../utils/breakpoints.js";
import { closestWithin, qsa, reduceMotion } from "../utils/dom.js";

const ROOT_SELECTOR = "[data-scroll-story]";
const PANELS_SELECTOR = "[data-scroll-story-panels]";
const NAV_SELECTOR = "[data-scroll-story-nav]";
const TRANSITION_START = 0.15;
const EXIT_SCALE = 0.8;
const EXIT_SHADE = 0.65;
const DEFAULT_STEP_VH = 100;
const END_HOLD = 0.25;

let uid = 0;

const clamp = (value, min = 0, max = 1) => Math.min(Math.max(value, min), max);

function directChildren(root, selector) {
  const container = root.querySelector(selector);
  return container ? Array.from(container.children) : [];
}

function numberAttribute(root, name, fallback, min, max) {
  const value = Number.parseFloat(root.getAttribute(name));
  return Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

function restoreAttribute(element, name, value) {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

function prepareNav(root, count) {
  const container = root.querySelector(NAV_SELECTOR);
  if (!container) return { items: [], restore() {} };

  const originals = Array.from(container.children);
  const snapshots = originals.map((item) => ({
    item,
    hidden: item.hidden,
    id: item.getAttribute("id"),
    controls: item.getAttribute("aria-controls"),
    label: item.getAttribute("aria-label"),
    current: item.getAttribute("aria-current"),
    type: item.getAttribute("type"),
  }));
  const generated = [];
  const items = originals.slice(0, count);
  const template = originals[0];

  while (template && items.length < count) {
    const item = template.cloneNode(true);
    item.removeAttribute("id");
    item.querySelectorAll("[id]").forEach((child) => child.removeAttribute("id"));
    item.removeAttribute("aria-controls");
    item.removeAttribute("aria-current");
    item.removeAttribute("data-scroll-story-current");
    item.setAttribute("data-scroll-story-generated", "");
    container.append(item);
    generated.push(item);
    items.push(item);
  }

  originals.forEach((item, index) => {
    item.hidden = index >= count;
  });

  return {
    items,
    restore() {
      generated.forEach((item) => item.remove());
      snapshots.forEach(({ item, hidden, id, controls, label, current, type }) => {
        item.hidden = hidden;
        restoreAttribute(item, "id", id);
        restoreAttribute(item, "aria-controls", controls);
        restoreAttribute(item, "aria-label", label);
        restoreAttribute(item, "aria-current", current);
        restoreAttribute(item, "type", type);
        item.removeAttribute("data-scroll-story-current");
      });
    },
  };
}

export function storyProgress({ sectionTop, sectionHeight, viewportHeight, scrollY }) {
  const distance = Math.max(sectionHeight - viewportHeight, 1);
  return clamp((scrollY - sectionTop) / distance);
}

export function storyFrame(progress, panelCount, transitionStart = TRANSITION_START) {
  if (!Number.isFinite(panelCount) || panelCount < 1) {
    return { active: -1, panels: [] };
  }

  const bounded = clamp(Number.isFinite(progress) ? progress : 0);
  const transition = clamp(transitionStart, 0, 0.95);
  const chapter = bounded * (panelCount + END_HOLD);
  const active = Math.min(Math.max(Math.floor(chapter) - 1, 0), panelCount - 1);
  const panels = Array.from({ length: panelCount }, (_, index) => {
    const incoming =
      index === 0
        ? 1
        : clamp((chapter - (index + transition)) / (1 - transition));
    const outgoing =
      index === panelCount - 1
        ? 0
        : clamp((chapter - (index + 1 + transition)) / (1 - transition));

    return {
      incoming,
      outgoing,
      content: index === active ? 1 : 0,
    };
  });

  return { active, panels };
}

function setupStory(root) {
  if (root.hasAttribute("data-scroll-story-bound")) return null;

  const panels = directChildren(root, PANELS_SELECTOR);
  if (panels.length < 2) return null;

  const storyId = `scroll-story-${++uid}`;
  const nav = prepareNav(root, panels.length);
  const navItems = nav.items;
  const panelSnapshots = panels.map((panel) => ({
    panel,
    id: panel.getAttribute("id"),
    index: panel.style.getPropertyValue("--scroll-story-index"),
    current: panel.getAttribute("data-scroll-story-current"),
    next: panel.getAttribute("data-scroll-story-next"),
    future: panel.getAttribute("data-scroll-story-future"),
    hidden: panel.getAttribute("aria-hidden"),
  }));
  const stepVh = numberAttribute(root, "data-scroll-story-step", DEFAULT_STEP_VH, 50, 200);
  const transitionStart = numberAttribute(root, "data-scroll-story-transition", TRANSITION_START, 0, 0.95);
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
  root.style.setProperty("--scroll-story-height", `${100 + panels.length * stepVh}svh`);

  navItems.forEach((item, index) => {
    const panel = panels[index];
    if (!item.id) item.id = `${storyId}-nav-${index + 1}`;
    if (!panel.id) panel.id = `${storyId}-panel-${index + 1}`;
    item.setAttribute("aria-controls", panel.id);
    if (item.hasAttribute("data-scroll-story-generated") || !item.hasAttribute("aria-label")) {
      item.setAttribute("aria-label", `Go to chapter ${index + 1}`);
    }
    if (item.tagName === "BUTTON" && !item.hasAttribute("type")) item.setAttribute("type", "button");
    panel.style.setProperty("--scroll-story-index", String(index));
  });

  function setActive(index) {
    panels.forEach((panel, panelIndex) => {
      panel.toggleAttribute("data-scroll-story-next", mode === "scroll" && panelIndex === index + 1);
      panel.toggleAttribute("data-scroll-story-future", mode === "scroll" && panelIndex > index);
    });
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
    measure();
    const progress = storyProgress({ sectionTop, sectionHeight, viewportHeight, scrollY: window.scrollY });
    const state = storyFrame(progress, panels.length, transitionStart);
    root.style.setProperty("--scroll-story-progress", String(progress));
    state.panels.forEach((panelState, index) => {
      panels[index].style.setProperty("--scroll-story-in", String(panelState.incoming));
      panels[index].style.setProperty("--scroll-story-out", String(panelState.outgoing));
      panels[index].style.setProperty("--scroll-story-content", String(panelState.content));
      panels[index].style.setProperty("--scroll-story-media-y", `${(1 - panelState.incoming) * 100}%`);
      panels[index].style.setProperty(
        "--scroll-story-media-scale",
        String(1 - panelState.outgoing * (1 - EXIT_SCALE)),
      );
      panels[index].style.setProperty("--scroll-story-shade", String(panelState.outgoing * EXIT_SHADE));
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
      panel.removeAttribute("data-scroll-story-next");
      panel.removeAttribute("data-scroll-story-future");
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
    const progress = index === 0 ? 0 : (index + 1) / (panels.length + END_HOLD);
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
    panelSnapshots.forEach(({ panel, id, index, current, next, future, hidden }) => {
      restoreAttribute(panel, "id", id);
      restoreAttribute(panel, "data-scroll-story-current", current);
      restoreAttribute(panel, "data-scroll-story-next", next);
      restoreAttribute(panel, "data-scroll-story-future", future);
      restoreAttribute(panel, "aria-hidden", hidden);
      if (index) panel.style.setProperty("--scroll-story-index", index);
      else panel.style.removeProperty("--scroll-story-index");
    });
    nav.restore();
  };
}

export function initScrollStories(root = document) {
  const cleanups = qsa(root, ROOT_SELECTOR).map(setupStory).filter(Boolean);
  return () => cleanups.forEach((cleanup) => cleanup());
}

export default initScrollStories;
