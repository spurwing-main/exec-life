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
 */

import EmblaCarousel from "embla-carousel";
import Autoplay from "embla-carousel-autoplay";
import { qs, qsa } from "../utils/dom.js";

function setupCarousel(root) {
  const viewport = qs(root, "[data-carousel-viewport]");
  if (!viewport) return;

  const options = {
    loop: root.getAttribute("data-carousel-loop") === "true",
    align: root.getAttribute("data-carousel-align") || "start",
    containScroll: "trimSnaps",
  };

  // Opt-in: disable Embla at a breakpoint so the slides fall back to normal
  // flow (e.g. a stacked column on mobile). CSS owns the stacked layout.
  const stackAt = root.getAttribute("data-carousel-stack");
  if (stackAt) options.breakpoints = { [stackAt]: { active: false } };

  const plugins = [];
  const autoplayMs = parseInt(root.getAttribute("data-carousel-autoplay") || "", 10);
  if (autoplayMs > 0) {
    plugins.push(
      Autoplay({ delay: autoplayMs, stopOnInteraction: false, stopOnMouseEnter: true })
    );
  }

  const embla = EmblaCarousel(viewport, options, plugins);

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
  const prev = qs(root, "[data-carousel-prev]");
  const next = qs(root, "[data-carousel-next]");
  wireControl(prev, () => embla.scrollPrev());
  wireControl(next, () => embla.scrollNext());

  // Dots (built to match snap count; styled via the section's Embed CSS)
  const dotsWrap = qs(root, "[data-carousel-dots]");
  let dots = [];
  const buildDots = () => {
    if (!dotsWrap) return;
    dotsWrap.replaceChildren();
    dots = embla.scrollSnapList().map((_, i) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.setAttribute("data-carousel-dot", "");
      dot.setAttribute("aria-label", `Go to slide ${i + 1}`);
      dot.addEventListener("click", () => embla.scrollTo(i));
      dotsWrap.appendChild(dot);
      return dot;
    });
  };

  const onSelect = () => {
    const selected = embla.selectedScrollSnap();
    dots.forEach((dot, i) =>
      dot.setAttribute("data-active", i === selected ? "true" : "false")
    );
    if (prev) prev.toggleAttribute("disabled", !embla.canScrollPrev());
    if (next) next.toggleAttribute("disabled", !embla.canScrollNext());
    embla
      .slideNodes()
      .forEach((slide, i) => slide.setAttribute("data-active", i === selected ? "true" : "false"));
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

  // Pause autoplay while off-screen (mirrors the tabs' visibility gating)
  const autoplay = embla.plugins().autoplay;
  if (autoplay && "IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => entries.forEach((e) => (e.isIntersecting ? autoplay.play() : autoplay.stop())),
      { threshold: 0.2 }
    ).observe(root);
  }
}

export function initCarousels(root = document) {
  qsa(root, "[data-carousel]").forEach(setupCarousel);
}

export default initCarousels;
