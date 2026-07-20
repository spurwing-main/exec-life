/**
 * Reusable Embla carousel — one module for every slider on the site.
 *
 * Embla is class-agnostic: it only needs a viewport node whose first child is
 * the track. All class names stay ours (testi_*, services_*); Embla only sets
 * transforms on the track at runtime. State is exposed as attributes so CSS can
 * own the visuals (active slide, selected dot, disabled arrow) — same "JS is
 * thin, CSS-backed" contract as the tabs.
 *
 * Markup contract (put on the carousel root):
 *   [data-carousel]                     root
 *     [data-carousel-viewport]          overflow:hidden; first child is the track
 *       <track>                         display:flex (a Webflow class)
 *         <slide> …                     flex:0 0 <width> (a Webflow class)
 *     [data-carousel-prev/-next]        arrow buttons (optional)
 *     [data-carousel-dots]              dots container — filled at runtime (optional)
 *   Options via attributes on the root:
 *     data-carousel-loop="true"
 *     data-carousel-align="start|center"
 *     data-carousel-autoplay="6000"     ms; enables autoplay + off-screen pause
 *     data-carousel-label="…"           accessible name for the carousel region
 *
 * Accessibility & UX (applied here, not in the Embeds so every slider gets it):
 *   - APG carousel semantics: role=region + aria-roledescription=carousel on the
 *     root; role=group + aria-roledescription=slide + "N of M" on each slide.
 *   - Prev/Next get button semantics, labels, and aria-disabled at the ends.
 *   - The active dot is marked aria-current.
 *   - A visually-hidden aria-live region announces the current slide (only when
 *     NOT autoplaying — a live region + auto-rotation is noise for AT users).
 *   - grab/grabbing cursor (only while actually draggable), no text selection or
 *     image ghost-drag while swiping, and :focus-visible rings — injected once.
 *   - prefers-reduced-motion: instant scroll and autoplay disabled.
 */

import EmblaCarousel from "embla-carousel";
import Autoplay from "embla-carousel-autoplay";
import { qs, qsa } from "../utils/dom.js";

const reduceMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Generic, behaviour-tied slider CSS — injected once for every slider on the
// page. Section-specific visuals (scrims, dot colours) stay in the Embeds.
function injectBaseStyles() {
  if (document.getElementById("el-carousel-base")) return;
  const style = document.createElement("style");
  style.id = "el-carousel-base";
  style.textContent = [
    /* Grab cursor only while the slider can actually be dragged. */
    '[data-carousel-viewport][data-draggable="true"]{cursor:grab;}',
    '[data-carousel-viewport][data-draggable="true"]:active{cursor:grabbing;}',
    /* No text selection or image ghost-drag while swiping. */
    "[data-carousel-viewport]{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}",
    "[data-carousel-viewport] img{-webkit-user-drag:none;user-drag:none;}",
    /* Keyboard focus visibility for the controls. */
    "[data-carousel-arrow]:focus-visible,[data-carousel-prev]:focus-visible,[data-carousel-next]:focus-visible,[data-carousel-dot]:focus-visible{outline:2px solid currentColor;outline-offset:3px;border-radius:6px;}",
    /* Disabled arrow at a scroll end. Per Figma this is a distinct state, not a
       dim: white circle + navy icon (via currentColor) + soft shadow. Targets
       the data-attribute so it works regardless of the arrow's Webflow classes. */
    '[data-carousel-arrow][disabled],[data-carousel-arrow][aria-disabled="true"],[data-carousel-prev][disabled],[data-carousel-next][disabled]{background-color:var(--_color---white--100,#fff);color:var(--_color---navy--100,#1e3a60);box-shadow:0 4px 4px rgba(0,0,0,.15);pointer-events:none;cursor:default;}',
    /* Visually-hidden live-region announcer. */
    ".el-carousel-live{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;}",
  ].join("");
  (document.head || document.documentElement).appendChild(style);
}

function setupCarousel(root) {
  const viewport = qs(root, "[data-carousel-viewport]");
  if (!viewport) return;

  const options = {
    loop: root.getAttribute("data-carousel-loop") === "true",
    align: root.getAttribute("data-carousel-align") || "start",
    containScroll: "trimSnaps",
  };
  // Respect reduced-motion: jump instantly instead of animating.
  if (reduceMotion()) options.duration = 0;

  // Opt-in: disable Embla at a breakpoint so the slides fall back to normal
  // flow (e.g. a stacked column on mobile). CSS owns the stacked layout.
  const stackAt = root.getAttribute("data-carousel-stack");
  if (stackAt) options.breakpoints = { [stackAt]: { active: false } };

  const plugins = [];
  const autoplayMs = parseInt(root.getAttribute("data-carousel-autoplay") || "", 10);
  const autoplayOn = autoplayMs > 0 && !reduceMotion();
  if (autoplayOn) {
    plugins.push(
      Autoplay({
        delay: autoplayMs,
        stopOnInteraction: false,
        stopOnMouseEnter: true,
        stopOnFocusIn: true, // pause for keyboard users tabbing through
      })
    );
  }

  const embla = EmblaCarousel(viewport, options, plugins);
  root._carousel = embla; // expose for re-init after CMS loads / debugging

  // Arrows (click + keyboard, so custom role="button" elements stay accessible)
  const wireControl = (elm, fn) => {
    if (!elm) return;
    elm.addEventListener("click", fn);
    elm.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fn();
      }
    });
  };
  // Arrows come from the shared "Slider Arrow" component and carry
  // [data-carousel-arrow]. Webflow can't vary an instance's classes/attributes,
  // so direction is resolved here: prefer explicit markers, else DOM order
  // (first arrow = previous). We then tag prev with `is-prev` at runtime, which
  // the CSS uses to rotate the icon 180deg.
  const arrows = qsa(root, "[data-carousel-arrow]");
  let prev = qs(root, "[data-carousel-prev]") || arrows.find((a) => a.classList.contains("is-prev"));
  if (!prev && arrows.length) prev = arrows[0];
  const next = qs(root, "[data-carousel-next]") || arrows.find((a) => a !== prev);
  if (prev) prev.classList.add("is-prev");
  wireControl(prev, () => embla.scrollPrev());
  wireControl(next, () => embla.scrollNext());

  // Give non-<button> controls button semantics + an accessible name.
  const labelControl = (el, text) => {
    if (!el) return;
    if (el.tagName !== "BUTTON") {
      if (!el.hasAttribute("role")) el.setAttribute("role", "button");
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
    }
    if (!el.getAttribute("aria-label")) el.setAttribute("aria-label", text);
  };
  labelControl(prev, "Previous slide");
  labelControl(next, "Next slide");

  // -- Carousel + slide semantics (WAI-ARIA APG carousel pattern) ------------
  const slideNodes = embla.slideNodes();
  const total = slideNodes.length;
  if (!root.hasAttribute("role")) root.setAttribute("role", "region");
  root.setAttribute("aria-roledescription", "carousel");
  const label = root.getAttribute("aria-label") || root.getAttribute("data-carousel-label");
  if (label) root.setAttribute("aria-label", label);
  slideNodes.forEach((slide, i) => {
    if (!slide.hasAttribute("role")) slide.setAttribute("role", "group");
    slide.setAttribute("aria-roledescription", "slide");
    if (!slide.getAttribute("aria-label")) slide.setAttribute("aria-label", `${i + 1} of ${total}`);
  });

  // Visually-hidden announcer — off while autoplaying (avoids constant chatter).
  let live = null;
  if (!autoplayOn) {
    live = document.createElement("span");
    live.className = "el-carousel-live";
    live.setAttribute("aria-live", "polite");
    live.setAttribute("aria-atomic", "true");
    root.appendChild(live);
  }

  // Dots (built to match snap count; styled via the section's Embed CSS)
  const dotsWrap = qs(root, "[data-carousel-dots]");
  let dots = [];
  const buildDots = () => {
    if (!dotsWrap) return;
    const snaps = embla.scrollSnapList(); // undefined when Embla is inactive
    if (!snaps) {
      dotsWrap.replaceChildren();
      dots = [];
      return;
    }
    dotsWrap.replaceChildren();
    dots = snaps.map((_, i) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.setAttribute("data-carousel-dot", "");
      dot.setAttribute("aria-label", `Go to slide ${i + 1}`);
      dot.addEventListener("click", () => embla.scrollTo(i));
      dotsWrap.appendChild(dot);
      return dot;
    });
  };

  const setDisabled = (el, disabled) => {
    if (!el) return;
    el.toggleAttribute("disabled", disabled);
    el.setAttribute("aria-disabled", disabled ? "true" : "false");
  };

  const onSelect = () => {
    const selected = embla.selectedScrollSnap(); // undefined when Embla is inactive
    if (selected == null) return;
    dots.forEach((dot, i) => {
      const active = i === selected;
      dot.setAttribute("data-active", active ? "true" : "false");
      dot.setAttribute("aria-current", active ? "true" : "false");
    });
    const canPrev = embla.canScrollPrev();
    const canNext = embla.canScrollNext();
    setDisabled(prev, !canPrev);
    setDisabled(next, !canNext);
    // Grab cursor only when there is somewhere to scroll.
    viewport.setAttribute("data-draggable", canPrev || canNext ? "true" : "false");
    (embla.slideNodes() || []).forEach((slide, i) =>
      slide.setAttribute("data-active", i === selected ? "true" : "false")
    );
    if (live) live.textContent = `Slide ${selected + 1} of ${total}`;
  };

  embla.on("init", () => {
    buildDots();
    onSelect();
  });
  embla.on("reInit", () => {
    buildDots();
    onSelect();
  });
  embla.on("select", onSelect);
  buildDots();
  onSelect();

  // Pause autoplay while off-screen (mirrors the tabs' visibility gating).
  // `plugins()` is undefined when Embla is inactive at the current breakpoint
  // (e.g. a `data-carousel-stack` slider on mobile), so guard the access.
  const autoplay = embla.plugins()?.autoplay;
  if (autoplay && "IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => entries.forEach((e) => (e.isIntersecting ? autoplay.play() : autoplay.stop())),
      { threshold: 0.2 }
    ).observe(root);
  }
}

export function initCarousels(root = document) {
  injectBaseStyles();
  // Isolate each carousel so one failing slider can't halt the whole boot.
  qsa(root, "[data-carousel]").forEach((el) => {
    try {
      setupCarousel(el);
    } catch (err) {
      console.error("[el] carousel init failed", el, err);
    }
  });
}

export default initCarousels;
