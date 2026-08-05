/**
 * Tax saving calculator: the arithmetic and nothing else.
 *
 * This module compares the true cost of two policies. A personal life
 * policy is funded from a dividend, so this module grosses the cost up for
 * BOTH dividend tax and corporation tax. A company-paid Relevant Life
 * policy is an allowable expense, so it costs the premium less corporation
 * tax relief.
 *
 *   personalMonthly = premium / (1 - bandRate) / (1 - corpRate)
 *   relevantMonthly = premium * (1 - corpRate)
 *   monthlySaving   = personalMonthly - relevantMonthly
 *
 * SIGNED OFF by the client on 2026-07-15. The confirmation is Figma comment
 * 1843887851: "ive checked these and your updated version is correct so
 * good to go". The rates and the three worked examples live in
 * `TAX-CALCULATOR.md`. `calc.test.js` asserts all nine figures. Do not
 * adjust the maths or the rounding. Read both files again first.
 *
 * Markup contract. This markup is authored in the Designer. See
 * TAX-CALCULATOR.md §3.1:
 *   <section data-calc
 *            data-calc-corp="0.25"
 *            data-calc-rate-basic="0.1075"
 *            data-calc-rate-higher="0.3575"
 *            data-calc-rate-additional="0.3935">
 *     <input data-calc-premium>            <!-- £/month -->
 *     <input data-calc-term>               <!-- years -->
 *     <input type="range" min="0" max="2" step="1" data-calc-band>
 *       Authored with step="1". At runtime, this module sets step to
 *       "any", so the thumb tracks the pointer. On release, the thumb
 *       moves back to a whole band.
 *     <div data-calc-out="monthly"></div>  <!-- also: annual, term, percent -->
 *
 * The rates are attributes on the COMPONENT DEFINITION, so one edit reaches
 * every instance. The constants below are a fallback, not a second source
 * of truth. If the markup does not set an attribute, the fallback constant
 * still gives the signed-off number, and never a wrong one. If the two
 * ever disagree, the attribute is the bug.
 */

import { qsa, qs } from "../utils/dom.js";

/** Approved 2026/27 values. See TAX-CALCULATOR.md §2. */
const DEFAULTS = {
  corp: 0.25,
  bands: [0.1075, 0.3575, 0.3935],
};

/** Band index → the name shown to the user. This module never shows the
 *  percentage. The client asked for names only, because the percentage
 *  misleads directors. */
const BAND_NAMES = ["Basic", "Higher", "Additional"];

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Whole pounds. This is how the spec sheet presents the over-term figure. */
const GBP_WHOLE = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

/** One formatter per output key, so zero and a real figure render alike. */
const FORMATTERS = {
  monthly: (v) => GBP.format(v),
  annual: (v) => GBP.format(v),
  term: (v) => GBP_WHOLE.format(v),
  percent: (v) => `${Math.round(v * 100)}%`,
  default: (v) => GBP.format(v),
};

/**
 * Read a rate off the root, or fall back to the approved default.
 *
 * This function rejects anything outside the 0–1 range. It does not simply
 * trust the value. For example, someone could type "35.75" by mistake,
 * when they mean 35.75%. Without this check, that value would make
 * `1 - rate` negative and flip the saving. That is the one failure mode
 * that produces a confident wrong number instead of an obvious blank.
 */
function readRate(root, attr, fallback) {
  const raw = root.getAttribute(attr);
  if (raw === null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    console.warn(`[el] calc: ignoring out-of-range ${attr}="${raw}"`);
    return fallback;
  }
  return value;
}

/** Parse a user-entered number. Empty, junk, and negative values all read as null. */
function readInput(input, { max = Infinity } = {}) {
  if (!input) return null;
  const value = Number(String(input.value).trim());
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.min(value, max);
}

/**
 * The model. This model is pure, so the test file can call it directly.
 *
 * It returns nulls when there is nothing to compute. The caller renders
 * that as the zero state. It never returns NaN, Infinity, or a negative
 * saving.
 */
export function compute({ premium, years, bandRate, corpRate }) {
  if (!premium || !Number.isFinite(premium)) {
    return { monthly: null, annual: null, term: null, percent: null };
  }

  const personalMonthly = premium / (1 - bandRate) / (1 - corpRate);
  const relevantMonthly = premium * (1 - corpRate);
  const monthly = personalMonthly - relevantMonthly;

  return {
    monthly,
    annual: monthly * 12,
    // Term is optional. Without it, the other three still answer the question.
    term: years ? monthly * 12 * years : null,
    percent: monthly / personalMonthly,
  };
}

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/**
 * How long the thumb takes to settle into a band after you let go.
 *
 * This function reads the value from `--anim-dur-ui`. It does not
 * hard-code the value, because the track fill uses that same token for its
 * CSS transition. Two separate literals would drift apart, and the fill
 * would finish before the thumb. That is the one glitch people actually
 * notice.
 */
function snapDuration(root, fallback = 250) {
  const raw = getComputedStyle(root).getPropertyValue("--anim-dur-ui").trim();
  if (!raw) return fallback;
  const value = parseFloat(raw);
  // 0 is meaningful: it means "snap instantly", not "use the default".
  if (!Number.isFinite(value) || value < 0) return fallback;
  return raw.endsWith("ms") ? value : value * 1000;
}

function setupCalc(root) {
  const premiumInput = qs(root, "[data-calc-premium]");
  const termInput = qs(root, "[data-calc-term]");
  const bandInput = qs(root, "[data-calc-band]");
  const outputs = qsa(root, "[data-calc-out]");
  if (!outputs.length) return;

  const corpRate = readRate(root, "data-calc-corp", DEFAULTS.corp);
  const bands = [
    readRate(root, "data-calc-rate-basic", DEFAULTS.bands[0]),
    readRate(root, "data-calc-rate-higher", DEFAULTS.bands[1]),
    readRate(root, "data-calc-rate-additional", DEFAULTS.bands[2]),
  ];

  const maxBand = bands.length - 1;

  function render() {
    // Clamp the band index. Do not simply trust the range's bounds. A
    // hand-edited embed with the wrong `max` would otherwise index past the
    // array.
    const raw = bandInput ? Number(bandInput.value) : 1;
    const rawBand = Math.round(raw);
    const band = Number.isFinite(rawBand) ? clamp(rawBand, 0, maxBand) : 1;

    // While a finger is down, the track fills to where the thumb actually is,
    // not to the band it will land on. Otherwise the fill jumps ahead of the
    // thumb at each midpoint, and the two visibly disagree.
    const dragging = root.hasAttribute("data-calc-dragging");
    const pos = dragging && Number.isFinite(raw) ? clamp(raw, 0, maxBand) : band;

    const result = compute({
      premium: readInput(premiumInput),
      years: readInput(termInput, { max: 50 }),
      bandRate: bands[band],
      corpRate,
    });

    outputs.forEach((node) => {
      const key = node.getAttribute("data-calc-out");
      const value = result[key];
      // Zero renders through the same formatter as a real figure. A field
      // never changes shape when it fills in. The display goes from £0 to
      // £22,318, not from £0.00 to £22,318.
      const format = FORMATTERS[key] || FORMATTERS.default;
      // Round only here, off the unrounded figure. If this code rounded
      // `monthly` first and then multiplied, the result would be £39,756
      // over 25 years, where the signed-off sheet says £39,757. A penny of
      // rounding turns into £1 of client-visible disagreement.
      node.textContent = format(value === null || value === undefined ? 0 : value);
    });

    // State for CSS: the band label emphasis and the slider's two-tone fill.
    // Published as a unitless fraction between 0 and 1, not as a
    // percentage. The CSS needs a plain <number> to offset the fill by half
    // the thumb width via calc(), which correctly accounts for its true
    // rendered inset. A percentage string cannot be multiplied against
    // px/% inside calc() the same way.
    root.setAttribute("data-calc-band-value", String(band));
    root.style.setProperty("--calc-band-pos", String(pos / Math.max(maxBand, 1)));

    // A range input announces "2 of 3". The band name is the useful part.
    if (bandInput && BAND_NAMES[band]) {
      bandInput.setAttribute("aria-valuetext", BAND_NAMES[band]);
      // The value is fractional mid-drag. Assistive tech should hear the band name.
      bandInput.setAttribute("aria-valuenow", String(band));
    }
  }

  // Use `input`, not `change`, so the value updates live whether someone
  // drags the slider or types.
  root.addEventListener("input", (event) => {
    if (event.target.closest("[data-calc-premium],[data-calc-term],[data-calc-band]")) {
      render();
    }
  });

  /**
   * Three bands on a `step="1"` range means the thumb teleports between
   * three fixed points. It does not follow your finger, which reads as
   * broken even though the value is right. So this makes the range
   * continuous, then reimposes the discreteness on release. The drag
   * tracks 1:1, and then the thumb eases into the nearest band. `step` is
   * set from JS, not authored in the Designer, so the control still
   * degrades to three fixed stops if this code never runs.
   */
  if (bandInput && typeof requestAnimationFrame === "function") {
    let frame = null;

    const settle = (target) => {
      cancelAnimationFrame(frame);
      const from = Number(bandInput.value);
      const finish = () => {
        bandInput.value = String(target);
        root.removeAttribute("data-calc-dragging");
        render();
      };
      const ms = snapDuration(root);
      if (!Number.isFinite(from) || from === target || ms <= 0) return finish();

      const t0 = performance.now();
      const tick = (now) => {
        const p = Math.min((now - t0) / ms, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        bandInput.value = String(from + (target - from) * eased);
        if (p < 1) {
          render();
          frame = requestAnimationFrame(tick);
        } else {
          finish();
        }
      };
      frame = requestAnimationFrame(tick);
    };

    const release = () => {
      if (!root.hasAttribute("data-calc-dragging")) return;
      settle(clamp(Math.round(Number(bandInput.value)), 0, maxBand));
    };

    bandInput.step = "any";
    bandInput.addEventListener("pointerdown", () => {
      cancelAnimationFrame(frame);
      root.setAttribute("data-calc-dragging", "");
    });
    bandInput.addEventListener("pointerup", release);
    bandInput.addEventListener("pointercancel", release);
    bandInput.addEventListener("blur", release);

    // `step="any"` leaves the arrow keys able to step by only a fraction of
    // the range. So keyboard users instead move a whole band at a time,
    // with the same easing.
    bandInput.addEventListener("keydown", (event) => {
      const current = clamp(Math.round(Number(bandInput.value)), 0, maxBand);
      let target = null;
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") target = current - 1;
      else if (event.key === "ArrowRight" || event.key === "ArrowUp") target = current + 1;
      else if (event.key === "Home") target = 0;
      else if (event.key === "End") target = maxBand;
      if (target === null) return;
      event.preventDefault();
      root.setAttribute("data-calc-dragging", "");
      settle(clamp(target, 0, maxBand));
    });
  }

  // Webflow refuses to place form controls outside a <form>, so the fields
  // sit in one. That means if someone presses Enter in a number field, the
  // form would submit and the page would reload. That would wipe the
  // result. Nothing here is ever sent anywhere. The section promises, "your
  // information is secure and will not be stored," and this code is what
  // makes that promise true, and not just aspirational.
  const form = root.querySelector("form");
  if (form) {
    form.setAttribute("novalidate", "");
    form.addEventListener("submit", (event) => event.preventDefault());
  }

  render();
}

export function initCalc(root = document) {
  qsa(root, "[data-calc]").forEach(setupCalc);
}

export default initCalc;
