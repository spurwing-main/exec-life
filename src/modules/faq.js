import { BREAKPOINT_QUERIES } from "../utils/breakpoints.js";
import { qsa, qs, closestWithin, reduceMotion } from "../utils/dom.js";

let uid = 0;

function getGsap() {
  const candidate = typeof window !== "undefined" ? window.gsap : null;
  if (!candidate || typeof candidate.timeline !== "function" || typeof candidate.set !== "function") {
    return null;
  }
  return candidate;
}

function parseDuration(value, fallback) {
  const match = String(value || "").trim().match(/^([\d.]+)\s*(ms|s)$/i);
  if (!match) return fallback;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return fallback;

  return match[2].toLowerCase() === "ms" ? amount / 1000 : amount;
}

const easeCache = new Map();

function cubicBezier(x1, y1, x2, y2) {
  const sample = (a, b, t) => {
    const inverse = 1 - t;
    return 3 * inverse * inverse * t * a + 3 * inverse * t * t * b + t * t * t;
  };

  return (progress) => {
    if (progress <= 0 || progress >= 1) return progress;

    let lower = 0;
    let upper = 1;
    for (let i = 0; i < 16; i += 1) {
      const midpoint = (lower + upper) / 2;
      if (sample(x1, x2, midpoint) < progress) lower = midpoint;
      else upper = midpoint;
    }

    return sample(y1, y2, (lower + upper) / 2);
  };
}

function parseEase(value, fallback = "power1.out") {
  const normalized = String(value || "").trim();
  const match = normalized.match(
    /^cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)$/i,
  );
  if (!match) return normalized || fallback;

  const key = match[0];
  if (!easeCache.has(key)) {
    easeCache.set(
      key,
      cubicBezier(Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])),
    );
  }

  return easeCache.get(key);
}

function getTiming(item) {
  const styles =
    typeof window !== "undefined" && typeof window.getComputedStyle === "function"
      ? window.getComputedStyle(item)
      : null;
  return {
    duration: parseDuration(styles?.getPropertyValue("--faq-dur"), 0.4),
    ease: parseEase(styles?.getPropertyValue("--faq-ease")),
  };
}

function disableCssMotion(entry) {
  [entry.panel, entry.inner, entry.plus, entry.minus].filter(Boolean).forEach((target) => {
    target.style.transition = "none";
  });
}

function setRestingState(entry, open) {
  const { panel, inner, plus, minus } = entry;

  panel.style.height = open ? "auto" : "0px";
  panel.style.overflow = "hidden";
  inner.style.opacity = open ? "1" : "0";

  if (plus) {
    plus.style.opacity = open ? "0" : "1";
    plus.style.transformOrigin = "50% 50%";
    plus.style.transform = `rotate(${open ? 90 : 0}deg)`;
  }

  if (minus) {
    minus.style.opacity = open ? "1" : "0";
    minus.style.transformOrigin = "50% 50%";
    minus.style.transform = `rotate(${open ? 0 : -90}deg)`;
  }
}

function createGsapMotion(entry, gsap) {
  const timing = getTiming(entry.item);
  const timeline = gsap.timeline({
    paused: true,
    defaults: {
      duration: timing.duration,
      ease: timing.ease,
      overwrite: "auto",
    },
  });

  timeline.fromTo(entry.panel, { height: 0 }, { height: "auto" });
  timeline.to(entry.inner, { opacity: 1 }, 0);

  if (entry.plus) {
    timeline.to(
      entry.plus,
      {
        opacity: 0,
        rotation: 90,
        transformOrigin: "50% 50%",
        force3D: false,
      },
      0,
    );
  }

  if (entry.minus) {
    timeline.to(
      entry.minus,
      {
        opacity: 1,
        rotation: 0,
        transformOrigin: "50% 50%",
        force3D: false,
      },
      0,
    );
  }

  function set(open, animate) {
    if (!animate) {
      timeline.progress(open ? 1 : 0).pause();
      setRestingState(entry, open);
      return;
    }

    timeline.invalidate();
    if (open) timeline.play();
    else timeline.reverse();
  }

  return {
    set,
    destroy() {
      timeline.kill();
      entry.panel.style.height = "";
      entry.panel.style.overflow = "";
      entry.inner.style.opacity = "";
      [entry.plus, entry.minus].filter(Boolean).forEach((target) => {
        target.style.opacity = "";
        target.style.transform = "";
        target.style.transformOrigin = "";
      });
      [entry.panel, entry.inner, entry.plus, entry.minus].filter(Boolean).forEach((target) => {
        target.style.transition = "";
      });
    },
  };
}

function parseBreakpoints(value) {
  if (!value) return [];

  return value
    .split(",")
    .map((breakpoint) => breakpoint.trim().toLowerCase())
    .filter((breakpoint) => breakpoint in BREAKPOINT_QUERIES);
}

function setupFaq(root) {
  if (root.hasAttribute("data-faq-ready")) return null;

  const items = qsa(root, "[data-faq-item]").filter((item) => item.closest("[data-faq]") === root);
  if (!items.length) return null;

  const allowMulti = root.getAttribute("data-faq") === "multi";
  const activeBreakpoints = parseBreakpoints(root.getAttribute("data-faq-breakpoints"));
  const gsap = getGsap();
  const mediaQueries = activeBreakpoints.map((breakpoint) =>
    window.matchMedia(BREAKPOINT_QUERIES[breakpoint])
  );
  const group = `faq-${(uid += 1)}`;

  const entries = items
    .map((item, i) => {
      const toggle = qs(item, "[data-faq-toggle]");
      const panel = qs(item, "[data-faq-panel]");
      if (!toggle || !panel) return null;

      const toggleId = toggle.id || `${group}-t${i}`;
      const panelId = panel.id || `${group}-p${i}`;
      toggle.id = toggleId;
      panel.id = panelId;
      toggle.setAttribute("aria-controls", panelId);
      if (!panel.hasAttribute("role")) panel.setAttribute("role", "region");
      panel.setAttribute("aria-labelledby", toggleId);

      const inner = panel.firstElementChild || panel;

      const entry = {
        item,
        toggle,
        panel,
        inner,
        plus: qs(item, ".faq_icon-plus"),
        minus: qs(item, ".faq_icon-minus"),
        motion: null,
      };

      disableCssMotion(entry);
      entry.motion = gsap ? createGsapMotion(entry, gsap) : null;
      return entry;
    })
    .filter(Boolean);

  if (!entries.length) return;

  const toggles = entries.map((e) => e.toggle);
  let isActive = null;

  function setOpen(entry, open, animate = true) {
    const shouldAnimate = animate && !reduceMotion() && Boolean(entry.motion);
    entry.item.setAttribute("data-open", open ? "true" : "false");
    entry.toggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (entry.motion) entry.motion.set(open, shouldAnimate);
    else setRestingState(entry, open);
  }

  const initialOpen = entries.map((entry) => entry.item.getAttribute("data-open") === "true");

  const openCount = initialOpen.filter(Boolean).length;

  if (openCount === 0 && root.getAttribute("data-faq-open") !== "none") {
    initialOpen[0] = true;
  } else if (openCount > 1 && !allowMulti) {
    initialOpen.forEach((_, i) => {
      initialOpen[i] = i === 0;
    });
  }

  function evaluateBreakpointState() {
    const shouldBeActive = mediaQueries.length === 0 || mediaQueries.some((query) => query.matches);
    if (shouldBeActive === isActive) return;

    isActive = shouldBeActive;
    root.setAttribute("data-faq-active", shouldBeActive ? "true" : "false");

    entries.forEach((entry, i) => {
      if (shouldBeActive) {
        setOpen(entry, initialOpen[i], false);
      } else {
        entry.item.setAttribute("data-open", "true");
        entry.toggle.removeAttribute("aria-expanded");
        if (entry.motion) entry.motion.set(true, false);
        else setRestingState(entry, true);
      }
    });
  }

  function activate(entry) {
    if (!isActive) return;
    const isOpen = entry.item.getAttribute("data-open") === "true";
    if (!allowMulti && !isOpen) {
      entries.forEach((other) => {
        if (other !== entry && other.item.getAttribute("data-open") === "true") {
          setOpen(other, false);
        }
      });
    }
    setOpen(entry, !isOpen);
  }

  const onClick = (e) => {
    const toggle = closestWithin(root, e.target, "[data-faq-toggle]");
    if (!toggle) return;
    const entry = entries.find((x) => x.toggle === toggle);
    if (entry) activate(entry);
  };
  root.addEventListener("click", onClick);

  const onKeydown = (e) => {
    if (!isActive) return;
    const toggle = closestWithin(root, e.target, "[data-faq-toggle]");
    if (!toggle) return;
    const current = toggles.indexOf(toggle);
    if (current < 0) return;
    let next = -1;
    if (e.key === "ArrowDown") next = (current + 1) % toggles.length;
    else if (e.key === "ArrowUp") next = (current - 1 + toggles.length) % toggles.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = toggles.length - 1;
    if (next < 0) return;
    e.preventDefault();
    toggles[next].focus();
  };
  root.addEventListener("keydown", onKeydown);

  mediaQueries.forEach((query) => query.addEventListener("change", evaluateBreakpointState));
  root.setAttribute("data-faq-ready", "true");
  evaluateBreakpointState();

  return () => {
    root.removeEventListener("click", onClick);
    root.removeEventListener("keydown", onKeydown);
    mediaQueries.forEach((query) => query.removeEventListener("change", evaluateBreakpointState));
    entries.forEach((entry) => entry.motion?.destroy());
    root.removeAttribute("data-faq-ready");
  };
}

export function initFaq(root = document) {
  const cleanups = qsa(root, "[data-faq]").map(setupFaq).filter(Boolean);
  return () => cleanups.forEach((cleanup) => cleanup());
}

export default initFaq;
