/**
 * Reusable Embla carousel: one module for every slider on the site.
 *
 * Embla is class-agnostic and needs only a viewport node whose first child is
 * the track, so all class names stay ours, for example testi_* and services_*.
 * At runtime Embla sets transforms on the track and nothing else. State is
 * exposed as attributes so CSS owns the visuals: active slide, selected dot,
 * disabled arrow. Same "JS is thin, CSS-backed" contract as the tabs.
 *
 * Markup contract. Put these attributes on the carousel root:
 *   [data-carousel]                     root
 *     [data-carousel-viewport]          overflow:hidden; first child is the track
 *       <track>                         display:flex, a Webflow class
 *         <slide> …                     flex:0 0 <width>, a Webflow class
 *     [data-carousel-prev/-next]        arrow buttons, optional
 *     [data-carousel-dots]              dots container, filled at runtime, optional
 *   Options via attributes on the root:
 *     data-carousel-loop="true"
 *     data-carousel-align="start|center"
 *     data-carousel-autoplay="6000"     ms; enables autoplay + off-screen pause
 *     data-carousel-label="…"           accessible name for the carousel region
 *
 * Accessibility and UX live here, not in the Embeds, so every slider gets them:
 *   - ARIA Authoring Practices Guide (APG) carousel semantics: role=region +
 *     aria-roledescription=carousel on the root; role=group +
 *     aria-roledescription=slide + "N of M" on each slide.
 *   - Prev and Next get button semantics, labels and aria-disabled at the ends.
 *   - The active dot is marked with aria-current.
 *   - A visually-hidden aria-live region announces the current slide, but only
 *     when the carousel does not autoplay. A live region plus auto-rotation is
 *     noise for assistive technology (AT) users.
 *   - grab and grabbing cursor while actually draggable; no text selection or
 *     image ghost-drag during a swipe; :focus-visible rings. Injected once.
 *   - prefers-reduced-motion: scroll instantly, autoplay disabled.
 */

import EmblaCarousel from "embla-carousel";
import Autoplay from "embla-carousel-autoplay";
import { qs, qsa, reduceMotion } from "../utils/dom.js";

// Carousel presentation lives in the site's global interactions Embed in
// Webflow, NOT here: grab and disabled cursor, no-select during a drag, focus
// rings. This module only flips the attributes those rules key off:
// data-draggable, [disabled], data-active. Keeping the CSS in Webflow leaves
// every visual visible and editable there, with no flash of unstyled content
// (FOUC) at boot.

// One slide feel for the whole site. These are constants on purpose, NOT
// per-instance attributes: every slider must move the same way.
//
// Embla gives duration 25 and an internal friction of 0.68. Together they read
// as floaty: the slide drifts on after the arrow press, then stops very late.
// EXE-87 calls this bounciness. Two values control it, and each does a
// different job:
//   duration  A public option. It sets how long the tween runs. A lower
//             number stops sooner.
//   friction  NOT a public option. Embla keeps it as a closure constant, and
//             resets to it before every scroll. Its physics multiplies the
//             velocity by this number on each frame. Therefore a LOWER number
//             damps the movement sooner and reduces the overshoot.
const SCROLL_DURATION = 18;
const SCROLL_FRICTION = 0.6;

// A hard drag can pass more than one slide. Without this, Embla clamps the
// release to exactly one slide, whatever force the person used, which fights
// the gesture.
//
// The blast radius is small, and this was checked against Embla's source.
// skipSnaps is read at one place only: allowedForce(), which runs on pointer
// release. Therefore it cannot change an arrow, a dot, the autoplay, the
// keyboard, or an inactive breakpoint, because each of those goes through
// scrollTo instead.
//
// It also does not touch SCROLL_FRICTION above. Embla sets its own duration and
// friction for the release, and it does not call useBaseFriction, which is the
// method the patch below replaces. The two are independent.
const SKIP_SNAPS = true;

// Apply the friction above. internalEngine() is Embla's own way in for physics
// that it does not expose as an option.
//
// This patches useBaseFriction, and does not only call useFriction once,
// because scrollTo resets the friction to the base value before every scroll.
// One call to useFriction is lost at the next arrow press.
function dampScrollBody(embla) {
  try {
    const scrollBody = embla.internalEngine()?.scrollBody;
    if (!scrollBody || scrollBody._elDamped) return;
    scrollBody._elDamped = true;
    const useBaseFriction = scrollBody.useBaseFriction.bind(scrollBody);
    scrollBody.useBaseFriction = () => {
      useBaseFriction();
      return scrollBody.useFriction(SCROLL_FRICTION);
    };
    scrollBody.useFriction(SCROLL_FRICTION);
  } catch {
    // Internals moved. Keep the public duration change and carry on.
  }
}

function setupCarousel(root) {
  const viewport = qs(root, "[data-carousel-viewport]");
  if (!viewport) return;

  const options = {
    loop: root.getAttribute("data-carousel-loop") === "true",
    align: root.getAttribute("data-carousel-align") || "start",
    containScroll: "trimSnaps",
    duration: SCROLL_DURATION,
    skipSnaps: SKIP_SNAPS,
  };
  // Respect reduced motion. Jump instantly, and do not animate.
  if (reduceMotion()) options.duration = 0;

  // Opt-in: disable Embla at a breakpoint so slides fall back to normal flow,
  // for example a stacked column on mobile. CSS owns the stacked layout.
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
        stopOnFocusIn: true, // pause for keyboard users who tab through
      })
    );
  }

  const embla = EmblaCarousel(viewport, options, plugins);
  root._carousel = embla; // expose so this can re-init after CMS loads, and so a developer can debug it

  // Does Embla drive this slider at the current breakpoint? It is false after
  // `data-carousel-stack` returns the slides to normal CSS flow. Read the
  // engine's resolved options, because each other Embla query answers as if
  // the slider is still active. If the internals are absent, assume active.
  // That keeps the earlier behaviour.
  const isActive = () => {
    try {
      return embla.internalEngine()?.options?.active !== false;
    } catch {
      return true;
    }
  };

  // Arrows respond to click and keyboard input, so custom role="button"
  // elements stay accessible.
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
  // [data-carousel-arrow]. A carousel can have MORE THAN ONE control surface:
  // Services shows header arrows on desktop and a separate footer row on
  // mobile, so EVERY arrow is wired, not just the first pair.
  //
  // Direction resolves per CONTROL GROUP, the arrows' shared parent: the first
  // arrow in each group is "previous", the rest are "next". This works whether
  // or not the instance carries the "previous" variant, and an explicit
  // [data-carousel-prev] or [data-carousel-next] marker still wins. Prev
  // arrows get `is-prev`, which the CSS uses to rotate the icon 180deg.
  const arrows = qsa(root, "[data-carousel-arrow]");
  const groups = new Map();
  arrows.forEach((a) => {
    const key = a.parentElement || root;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  });
  const isPrevArrow = (a) => {
    if (a.hasAttribute("data-carousel-next")) return false;
    if (a.hasAttribute("data-carousel-prev") || a.classList.contains("is-prev")) return true;
    if (/prev/i.test(a.getAttribute("data-wf--slider-arrow--variant") || "")) return true;
    const group = groups.get(a.parentElement || root) || [];
    return group.length > 1 && group[0] === a;
  };
  const prevs = arrows.filter(isPrevArrow);
  const nexts = arrows.filter((a) => !isPrevArrow(a));
  prevs.forEach((p) => p.classList.add("is-prev"));
  prevs.forEach((p) => wireControl(p, () => embla.scrollPrev()));
  nexts.forEach((n) => wireControl(n, () => embla.scrollNext()));

  // Give non-<button> controls button semantics and an accessible name.
  const labelControl = (el, text) => {
    if (!el) return;
    if (el.tagName !== "BUTTON") {
      if (!el.hasAttribute("role")) el.setAttribute("role", "button");
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
    }
    if (!el.getAttribute("aria-label")) el.setAttribute("aria-label", text);
  };
  prevs.forEach((p) => labelControl(p, "Previous slide"));
  nexts.forEach((n) => labelControl(n, "Next slide"));

  // -- Carousel and slide semantics: the WAI-ARIA APG carousel pattern -------
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

  // Visually-hidden announcer, off while the carousel autoplays to avoid
  // constant chatter.
  let live = null;
  if (!autoplayOn) {
    live = document.createElement("span");
    live.className = "u-visually-hidden"; // shared utility, from the Foundation embed
    live.setAttribute("aria-live", "polite");
    live.setAttribute("aria-atomic", "true");
    root.appendChild(live);
  }

  // Dots, built to match the snap count. Styled via the section's Embed CSS.
  const dotsWrap = qs(root, "[data-carousel-dots]");
  let dots = [];
  const buildDots = () => {
    if (!dotsWrap) return;
    // Do not test `!snaps`. scrollSnapList() gives a true array even when Embla
    // is inactive at this breakpoint. Therefore isActive makes the decision.
    // See EXE-85.
    const snaps = isActive() ? embla.scrollSnapList() : null;
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
    // EXE-85. `data-carousel-stack` makes Embla inactive at a breakpoint. The
    // slides then become a normal CSS column, and no scroll is possible.
    //
    // Embla's read-only queries do NOT show this. selectedScrollSnap() and
    // canScrollPrev/Next() continue to answer from the engine's index, whatever
    // `active` holds. Thus the arrows kept an enabled appearance, and stayed
    // clickable, but did nothing. scrollTo stops internally when inactive.
    //
    // So ask the engine for its resolved active state. Then set that state on
    // the root, which lets the CSS hide the controls, and disable each arrow.
    root.setAttribute("data-carousel-active", isActive() ? "true" : "false");
    if (!isActive()) {
      prevs.forEach((p) => setDisabled(p, true));
      nexts.forEach((n) => setDisabled(n, true));
      viewport.setAttribute("data-draggable", "false");
      (embla.slideNodes() || []).forEach((slide) => slide.removeAttribute("data-active"));
      if (live) live.textContent = "";
      return;
    }
    const selected = embla.selectedScrollSnap();
    if (selected == null) return;
    dots.forEach((dot, i) => {
      const active = i === selected;
      dot.setAttribute("data-active", active ? "true" : "false");
      dot.setAttribute("aria-current", active ? "true" : "false");
    });
    const canPrev = embla.canScrollPrev();
    const canNext = embla.canScrollNext();
    prevs.forEach((p) => setDisabled(p, !canPrev));
    nexts.forEach((n) => setDisabled(n, !canNext));
    // Grab cursor only when there is somewhere to scroll.
    viewport.setAttribute("data-draggable", canPrev || canNext ? "true" : "false");
    (embla.slideNodes() || []).forEach((slide, i) =>
      slide.setAttribute("data-active", i === selected ? "true" : "false")
    );
    if (live) live.textContent = `Slide ${selected + 1} of ${total}`;
  };

  // reInit makes a new engine. Thus apply the friction patch again each time.
  embla.on("init", () => {
    dampScrollBody(embla);
    buildDots();
    onSelect();
  });
  embla.on("reInit", () => {
    dampScrollBody(embla);
    buildDots();
    onSelect();
  });
  embla.on("select", onSelect);
  dampScrollBody(embla);
  buildDots();
  onSelect();

  // Pause autoplay while off-screen, mirroring the tabs' visibility gating.
  // `plugins()` is undefined when Embla is inactive at the current breakpoint,
  // for example a slider using `data-carousel-stack` on mobile, so guard it.
  const autoplay = embla.plugins()?.autoplay;
  if (autoplay && "IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => entries.forEach((e) => (e.isIntersecting ? autoplay.play() : autoplay.stop())),
      { threshold: 0.2 }
    ).observe(root);
  }
}

export function initCarousels(root = document) {
  // Isolate each carousel so one slider that fails cannot halt the whole boot.
  qsa(root, "[data-carousel]").forEach((el) => {
    try {
      setupCarousel(el);
    } catch (err) {
      console.error("[el] carousel init failed", el, err);
    }
  });
}

export default initCarousels;
