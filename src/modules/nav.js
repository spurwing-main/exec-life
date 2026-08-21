/**
 * Nav shell: auto-hide on scroll, dropdown panels, and mobile menu.
 *
 * Markup contract. Put these attributes in .nav_shell or in its parent:
 *   data-nav                  → auto-hide nav bar
 *   data-nav-threshold        → optional reveal zone: "100vh", "80vh", or px
 *   data-nav-trigger="{name}" → desktop dropdown trigger
 *   data-nav-panel="{name}"   → desktop dropdown panel
 *   data-nav-menu-toggle      → mobile hamburger
 *   data-nav-mobile="{name}"  → mobile view
 *   data-nav-mobile-trigger   → drill-down link inside mobile
 *   data-nav-back             → back button inside mobile view
 *
 * Desktop dropdown panels close when:
 *   - the pointer leaves the [trigger + panel] hover zone
 *   - the pointer enters a trigger that has no panel, while a panel is open
 *   - the user scrolls, presses Escape, moves focus out of the nav, or
 *     clicks outside
 */

import { qsa } from "../utils/dom.js";

/* ------------------------------------------------------------------------- */
/*  Scroll auto-hide                                                         */
/* ------------------------------------------------------------------------- */

/* Sustained travel required before the bar flips, measured from where the
   current direction run began — not frame to frame. The old frame-delta of 6px
   sat below the noise floor of touch momentum, so an 8px wobble could flip the
   bar six times in 170ms and every flip restarted the 350ms transform, which
   read as the bar snapping rather than moving. Revealing is deliberately
   eagerer than hiding: losing the nav is the costlier mistake. */
const HIDE_AFTER = 64;
const SHOW_AFTER = 32;

function thresholdPx(nav) {
  const raw = (nav.getAttribute("data-nav-threshold") || "").trim();
  if (!raw) return window.innerHeight;
  if (raw.endsWith("vh")) return (parseFloat(raw) / 100) * window.innerHeight || window.innerHeight;
  return parseFloat(raw) || window.innerHeight;
}

function setupScrollHide(nav) {
  let lastY = window.scrollY || window.pageYOffset;
  /* Where the current run of same-direction scrolling started. Distance is
     measured from here, so a reversal restarts the count instead of flipping. */
  let anchorY = lastY;
  let runDir = 0;
  let ticking = false;

  const show = () => nav.setAttribute("data-nav-hidden", "false");

  const update = () => {
    ticking = false;
    const y = window.scrollY || window.pageYOffset;
    const delta = y - lastY;
    const dir = delta > 0 ? 1 : delta < 0 ? -1 : 0;

    /* Inside the reveal zone the bar is always shown, and the run resets so
       leaving the zone needs fresh travel to hide. */
    if (y <= thresholdPx(nav)) {
      show();
      anchorY = y;
      runDir = 0;
      lastY = y;
      return;
    }

    /* The menu owns the screen while it is open; never pull the bar out from
       under it. */
    if (nav.querySelector('[data-nav-mobile].is-open')) {
      show();
      anchorY = y;
      runDir = 0;
      lastY = y;
      return;
    }

    if (dir !== 0 && dir !== runDir) {
      runDir = dir;
      anchorY = lastY;
    }

    const travelled = Math.abs(y - anchorY);
    if (runDir === 1 && travelled > HIDE_AFTER) {
      nav.setAttribute("data-nav-hidden", "true");
      anchorY = y;
    } else if (runDir === -1 && travelled > SHOW_AFTER) {
      show();
      anchorY = y;
    }

    lastY = y;
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  update();
}

/* ------------------------------------------------------------------------- */
/*  Dropdown panels and mobile menu                                          */
/* ------------------------------------------------------------------------- */

const uid = () => Math.random().toString(36).slice(2, 8);
const hoverable = window.matchMedia("(hover: hover) and (pointer: fine)");
const isDesktop = () => window.innerWidth >= 992;
const desktopMouse = () => hoverable.matches && isDesktop();
const focusables = (el) =>
  [...el.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(
    (n) => !n.disabled && n.offsetParent !== null,
  );

function setupShell(root) {
  if (root.dataset.navReady) return;
  root.dataset.navReady = "true";

  const panels = qsa(root, "[data-nav-panel]");
  const views = qsa(root, "[data-nav-mobile]");
  const triggers = qsa(root, "[data-nav-trigger]");
  const drills = qsa(root, "[data-nav-mobile-trigger]");
  const backs = qsa(root, "[data-nav-back]");
  const toggle = root.querySelector("[data-nav-menu-toggle]");

  const panelFor = (name) => panels.find((p) => p.dataset.navPanel === name);
  const viewFor = (name) => views.find((v) => v.dataset.navMobile === name);
  const panelsOpen = () => panels.some((p) => p.classList.contains("is-open"));
  const menuOpen = () => toggle?.getAttribute("aria-expanded") === "true";

  const syncShell = () => {
    const open = panelsOpen() || menuOpen();
    root.classList.toggle("is-open", open);
    document.documentElement.classList.toggle("nav-menu-open", menuOpen());
    document.documentElement.classList.toggle("nav-open", open);
  };

  /* ---- Desktop panels ---- */
  let openTimer = null;
  let closeTimer = null;

  const openPanel = (name) => {
    panels.forEach((p) => {
      const on = p.dataset.navPanel === name;
      p.classList.toggle("is-open", on);
      p.setAttribute("aria-hidden", String(!on));
    });
    triggers.forEach((t) => t.setAttribute("aria-expanded", String(t.dataset.navTrigger === name)));
    syncShell();
  };

  const closePanels = () => {
    panels.forEach((p) => {
      p.classList.remove("is-open");
      p.setAttribute("aria-hidden", "true");
    });
    triggers.forEach((t) => t.setAttribute("aria-expanded", "false"));
    syncShell();
  };

  const focusFirstInPanel = (name) => {
    const p = panelFor(name);
    requestAnimationFrame(() => {
      const f = p && focusables(p)[0];
      if (f) f.focus();
    });
  };

  const cancelTimers = () => {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
  };

  triggers.forEach((t) => {
    const name = t.dataset.navTrigger;
    const p = panelFor(name);
    t.setAttribute("aria-haspopup", "true");
    t.setAttribute("aria-expanded", "false");
    if (p) {
      if (!p.id) p.id = "nav-panel-" + name + "-" + uid();
      t.setAttribute("aria-controls", p.id);
    }

    /* Click: toggle on touch. No-op on desktop or hover, unless already open. */
    t.addEventListener("click", (e) => {
      if (desktopMouse()) {
        if (panelFor(name)?.classList.contains("is-open")) closePanels();
        return;
      }
      e.preventDefault();
      panelFor(name)?.classList.contains("is-open") ? closePanels() : openPanel(name);
    });

    /* Hover open, with a 70ms debounce.
       If the trigger has no panel, for example Insurers or About, this
       closes any open panels. */
    t.addEventListener("mouseenter", () => {
      if (!desktopMouse()) return;
      cancelTimers();
      if (p) {
        openTimer = setTimeout(() => openPanel(name), 70);
      } else {
        closePanels();
      }
    });

    /* Hover leave. If this trigger has a panel, start a short timer, so the
       panel does not close if the pointer moves into it. A trigger without
       a panel already closed on mouseenter, so there is nothing to do
       here. */
    t.addEventListener("mouseleave", () => {
      if (!desktopMouse() || !p) return;
      cancelTimers();
      closeTimer = setTimeout(closePanels, 120);
    });

    /* Keyboard */
    t.addEventListener("keydown", (e) => {
      if (!isDesktop() || !p) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        t.getAttribute("aria-expanded") === "true" ? closePanels() : (openPanel(name), focusFirstInPanel(name));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        openPanel(name);
        focusFirstInPanel(name);
      } else if (e.key === "Escape") {
        closePanels();
      }
    });
  });

  /* Panel hover: cancel the close timer on enter, start it again on leave. */
  panels.forEach((p) => {
    p.addEventListener("mouseenter", () => {
      if (!desktopMouse()) return;
      clearTimeout(closeTimer);
    });
    p.addEventListener("mouseleave", () => {
      if (!desktopMouse()) return;
      closeTimer = setTimeout(closePanels, 120);
    });

    p.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closePanels();
        triggers.find((t) => t.dataset.navTrigger === p.dataset.navPanel)?.focus();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const items = focusables(p);
        if (!items.length) return;
        e.preventDefault();
        const i = items.indexOf(document.activeElement);
        const next = e.key === "ArrowDown" ? items[i + 1] || items[0] : items[i - 1] || items[items.length - 1];
        next.focus();
      }
    });
  });

  /* Scroll closes panels. */
  window.addEventListener(
    "scroll",
    () => {
      if (panelsOpen()) closePanels();
    },
    { passive: true },
  );

  /* This module closes panels when focus leaves the nav. */
  root.addEventListener("focusout", () => {
    setTimeout(() => {
      if (panelsOpen() && !root.contains(document.activeElement)) closePanels();
    }, 0);
  });

  /* ---- Mobile menu ---- */
  let lastFocused = null;

  const showView = (name) => {
    views.forEach((v) => {
      const on = v.dataset.navMobile === name;
      v.classList.toggle("is-open", on);
      v.setAttribute("aria-hidden", String(!on));
    });
  };

  const setMenu = (open) => {
    if (toggle) {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    }
    if (open) {
      lastFocused = document.activeElement;
      showView("main");
    } else
      views.forEach((v) => {
        v.classList.remove("is-open");
        v.setAttribute("aria-hidden", "true");
      });
    syncShell();
    if (open)
      requestAnimationFrame(() => {
        (focusables(viewFor("main") || root)[0] || toggle)?.focus();
      });
    else lastFocused?.focus?.();
  };

  if (toggle) {
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open menu");
    toggle.addEventListener("click", (e) => {
      e.preventDefault();
      setMenu(!menuOpen());
    });
  }

  drills.forEach((t) =>
    t.addEventListener("click", (e) => {
      e.preventDefault();
      showView(t.dataset.navMobileTrigger);
    }),
  );

  backs.forEach((b) =>
    b.addEventListener("click", (e) => {
      e.preventDefault();
      showView("main");
    }),
  );

  /* Scrim */
  (root.closest(".nav") || root)
    .querySelector(".nav_scrim")
    ?.addEventListener("click", () => {
      closePanels();
      if (menuOpen()) setMenu(false);
    });

  /* Tab trap */
  root.addEventListener("keydown", (e) => {
    if (e.key !== "Tab" || !menuOpen()) return;
    const f = focusables(root);
    if (!f.length) return;
    const first = f[0],
      last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  /* This module closes the menu when someone taps a real link. */
  root.addEventListener("click", (e) => {
    if (!menuOpen()) return;
    const link = e.target.closest("a[href]");
    if (!link || link.matches("[data-nav-mobile-trigger],[data-nav-back],[data-nav-menu-toggle]")) return;
    const href = link.getAttribute("href") || "";
    if (href && href !== "#") setMenu(false);
  });

  /* ---- Shared: Escape and outside click ---- */
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    closePanels();
    if (menuOpen()) setMenu(false);
  });

  document.addEventListener("click", (e) => {
    if (!root.contains(e.target)) {
      closePanels();
    }
  });
}

/* ------------------------------------------------------------------------- */
/*  Init                                                                     */
/* ------------------------------------------------------------------------- */

export function initNav(root = document) {
  qsa(root, "[data-nav]").forEach(setupScrollHide);
  qsa(root, ".nav_shell").forEach(setupShell);
}

export default initNav;