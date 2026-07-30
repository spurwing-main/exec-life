/**
 * Tax saving calculator — the arithmetic and nothing else.
 *
 * Compares the true cost of a personal life policy (funded from a dividend, so
 * grossed up for BOTH dividend tax and corporation tax) against a company-paid
 * Relevant Life policy (an allowable expense, so it costs the premium less
 * corporation tax relief).
 *
 *   personalMonthly = premium / (1 - bandRate) / (1 - corpRate)
 *   relevantMonthly = premium * (1 - corpRate)
 *   monthlySaving   = personalMonthly - relevantMonthly
 *
 * SIGNED OFF by the client 2026-07-15 (Figma comment 1843887851, "ive checked
 * these and your updated version is correct so good to go"). The rates and the
 * three worked examples live in `TAX-CALCULATOR.md`; `calc.test.js` asserts all
 * nine figures. Do not adjust the maths or the rounding without re-reading both.
 *
 * Markup contract (authored in the Designer, see TAX-CALCULATOR.md §3.1):
 *   <section data-calc
 *            data-calc-corp="0.25"
 *            data-calc-rate-basic="0.1075"
 *            data-calc-rate-higher="0.3575"
 *            data-calc-rate-additional="0.3935">
 *     <input data-calc-premium>            <!-- £/month -->
 *     <input data-calc-term>               <!-- years -->
 *     <input type="range" min="0" max="2" step="1" data-calc-band>
 *     <div data-calc-out="monthly"></div>  <!-- also: annual, term, percent -->
 *
 * The rates are attributes on the COMPONENT DEFINITION, so one edit reaches
 * every instance. The constants below are a fallback, not a second source of
 * truth: a missing attribute yields the signed-off number rather than a wrong
 * one. If the two ever disagree, the attribute is the bug.
 */

import { qsa, qs } from "../utils/dom.js";

/** Approved 2026/27 values — see TAX-CALCULATOR.md §2. */
const DEFAULTS = {
  corp: 0.25,
  bands: [0.1075, 0.3575, 0.3935],
};

/** Band index → the name shown to the user. Never the percentage: the client
 *  asked for names only, because the % misleads for directors. */
const BAND_NAMES = ["Basic", "Higher", "Additional"];

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Whole pounds — how the spec sheet presents the over-term figure. */
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
 * Read a rate off the root, falling back to the approved default.
 *
 * Rejects anything outside 0–1 rather than trusting it: a typo'd "35.75"
 * (meaning 35.75%) would otherwise make `1 - rate` negative and flip the
 * saving, which is the one failure mode that produces a confident wrong number
 * instead of an obvious blank.
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

/** Parse a user-entered number. Empty / junk / negative all read as null. */
function readInput(input, { max = Infinity } = {}) {
  if (!input) return null;
  const value = Number(String(input.value).trim());
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.min(value, max);
}

/**
 * The model. Pure, so the test file can call it directly.
 *
 * Returns nulls when there is nothing to compute, which the caller renders as
 * the zero state — never NaN, never Infinity, never a negative saving.
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
    // Term is optional: without it the other three still answer the question.
    term: years ? monthly * 12 * years : null,
    percent: monthly / personalMonthly,
  };
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

  function render() {
    // Clamp the band index rather than trusting the range's bounds — a hand-
    // edited embed with the wrong `max` would otherwise index past the array.
    const rawBand = bandInput ? Math.round(Number(bandInput.value)) : 1;
    const band = Number.isFinite(rawBand)
      ? Math.min(Math.max(rawBand, 0), bands.length - 1)
      : 1;

    const result = compute({
      premium: readInput(premiumInput),
      years: readInput(termInput, { max: 50 }),
      bandRate: bands[band],
      corpRate,
    });

    outputs.forEach((node) => {
      const key = node.getAttribute("data-calc-out");
      const value = result[key];
      // Zero renders through the same formatter as a real figure, so a field
      // never changes shape when it fills in (£0 → £22,318, not £0.00 → £22,318).
      const format = FORMATTERS[key] || FORMATTERS.default;
      // Round only here, off the unrounded figure. Rounding `monthly` first and
      // multiplying gives £39,756 over 25 years where the signed-off sheet says
      // £39,757 — a penny of rounding, £1 of client-visible disagreement.
      node.textContent = format(value === null || value === undefined ? 0 : value);
    });

    // State for CSS: the band label emphasis and the slider's two-tone fill.
    root.setAttribute("data-calc-band-value", String(band));
    root.style.setProperty(
      "--calc-band-pos",
      `${(band / Math.max(bands.length - 1, 1)) * 100}%`
    );

    // A range input announces "2 of 3"; the band name is the useful part.
    if (bandInput && BAND_NAMES[band]) {
      bandInput.setAttribute("aria-valuetext", BAND_NAMES[band]);
    }
  }

  // `input` (not `change`) so dragging the slider and typing both update live.
  root.addEventListener("input", (event) => {
    if (event.target.closest("[data-calc-premium],[data-calc-term],[data-calc-band]")) {
      render();
    }
  });

  // Webflow refuses to place form controls outside a <form>, so the fields sit
  // in one — which means Enter in a number field would submit and reload the
  // page, wiping the result. Nothing here is ever sent anywhere: the section
  // promises "your information is secure and will not be stored", and this is
  // what makes that true rather than aspirational.
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
