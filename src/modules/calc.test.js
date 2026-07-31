import { describe, it, expect, beforeEach } from "vitest";
import { initCalc, compute } from "./calc.js";

/**
 * The nine numbers the client signed off on 2026-07-15, from
 * `exec-life-tax-calculator-spec` rows 14–16: £100/month over a 25-year term.
 *
 * These are the contract. If one of these fails, the calculator is telling
 * clients a different number from the one their adviser approved.
 */
const SIGNED_OFF = [
  { band: 0, name: "Basic", rate: 0.1075, monthly: "£74.39", term: "£22,318", percent: "50%" },
  { band: 1, name: "Higher", rate: 0.3575, monthly: "£132.52", term: "£39,757", percent: "64%" },
  { band: 2, name: "Additional", rate: 0.3935, monthly: "£144.84", term: "£43,452", percent: "66%" },
];

/** The markup the Designer produces (TAX-CALCULATOR.md §3.1). */
function mount({ premium = "", term = "", band = "1", rates = {} } = {}) {
  const attrs = {
    "data-calc-corp": "0.25",
    "data-calc-rate-basic": "0.1075",
    "data-calc-rate-higher": "0.3575",
    "data-calc-rate-additional": "0.3935",
    ...rates,
  };
  const attrString = Object.entries(attrs)
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");

  document.body.innerHTML = `
    <section class="calc" data-calc ${attrString}>
      <input class="calc_input" data-calc-premium value="${premium}">
      <input class="calc_input" data-calc-term value="${term}">
      <input type="range" min="0" max="2" step="1" value="${band}" data-calc-band>
      <div class="calc_value" data-calc-out="annual"></div>
      <div class="calc_value" data-calc-out="monthly"></div>
      <div class="calc_value" data-calc-out="percent"></div>
      <div class="calc_value" data-calc-out="term"></div>
    </section>`;

  return {
    root: document.querySelector("[data-calc]"),
    premium: document.querySelector("[data-calc-premium]"),
    term: document.querySelector("[data-calc-term]"),
    band: document.querySelector("[data-calc-band]"),
    out: (key) => document.querySelector(`[data-calc-out="${key}"]`).textContent,
  };
}

/** Fire the event the module listens for. */
function type(input, value) {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Make the snap instant. Waiting on the real animation made these tests
 * time-dependent, and they failed under load — the behaviour being asserted is
 * where the thumb lands, not how long it takes to get there.
 */
function instantSnap(el) {
  el.root.style.setProperty("--anim-dur-ui", "0ms");
}

describe("compute", () => {
  it.each(SIGNED_OFF)(
    "matches the signed-off $name-rate figures for £100/mo over 25 years",
    ({ rate, monthly, term, percent }) => {
      const r = compute({ premium: 100, years: 25, bandRate: rate, corpRate: 0.25 });

      expect(`£${r.monthly.toFixed(2)}`).toBe(monthly);
      expect(`£${Math.round(r.term).toLocaleString("en-GB")}`).toBe(term);
      expect(`${Math.round(r.percent * 100)}%`).toBe(percent);
    }
  );

  it("derives the term figure from the unrounded monthly saving", () => {
    // Rounding monthly to £132.52 first gives £39,756 — the sheet says £39,757.
    const r = compute({ premium: 100, years: 25, bandRate: 0.3575, corpRate: 0.25 });
    expect(Math.round(r.term)).toBe(39757);
    expect(Math.round(Number(r.monthly.toFixed(2)) * 300)).toBe(39756);
  });

  it("scales linearly with the premium", () => {
    const one = compute({ premium: 100, years: 25, bandRate: 0.3575, corpRate: 0.25 });
    const ten = compute({ premium: 1000, years: 25, bandRate: 0.3575, corpRate: 0.25 });
    expect(ten.monthly).toBeCloseTo(one.monthly * 10, 6);
    // The percentage is premium-independent — it's a property of the tax rates.
    expect(ten.percent).toBeCloseTo(one.percent, 12);
  });

  it("returns nulls rather than NaN when there is no premium", () => {
    expect(compute({ premium: null, years: 25, bandRate: 0.3575, corpRate: 0.25 })).toEqual({
      monthly: null,
      annual: null,
      term: null,
      percent: null,
    });
  });

  it("still answers the monthly/annual question with no term entered", () => {
    const r = compute({ premium: 100, years: null, bandRate: 0.3575, corpRate: 0.25 });
    expect(r.monthly).toBeCloseTo(132.5227, 4);
    expect(r.term).toBeNull();
  });
});

describe("initCalc", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it.each(SIGNED_OFF)(
    "renders the signed-off $name-rate figures end to end",
    ({ band, monthly, term, percent }) => {
      const el = mount({ premium: "100", term: "25", band: String(band) });
      initCalc();

      expect(el.out("monthly")).toBe(monthly);
      expect(el.out("term")).toBe(term);
      expect(el.out("percent")).toBe(percent);
    }
  );

  it("renders the annual figure as twelve months of saving", () => {
    const el = mount({ premium: "100", term: "25", band: "1" });
    initCalc();
    expect(el.out("annual")).toBe("£1,590.27");
  });

  it("shows a zero state before anything is entered", () => {
    const el = mount();
    initCalc();

    expect(el.out("monthly")).toBe("£0.00");
    expect(el.out("annual")).toBe("£0.00");
    expect(el.out("term")).toBe("£0");
    expect(el.out("percent")).toBe("0%");
  });

  it.each([
    ["empty", ""],
    ["zero", "0"],
    ["negative", "-500"],
    ["junk", "abc"],
    ["an email address", "hi@example.com"],
  ])("falls back to the zero state for %s input", (_label, value) => {
    const el = mount({ premium: "100", term: "25" });
    initCalc();
    type(el.premium, value);

    expect(el.out("monthly")).toBe("£0.00");
    expect(el.out("percent")).toBe("0%");
  });

  it("recalculates live as the premium is typed", () => {
    const el = mount({ term: "25", band: "1" });
    initCalc();

    type(el.premium, "100");
    expect(el.out("monthly")).toBe("£132.52");
    type(el.premium, "200");
    expect(el.out("monthly")).toBe("£265.05");
  });

  it("recalculates when the band slider moves", () => {
    const el = mount({ premium: "100", term: "25", band: "1" });
    initCalc();
    expect(el.out("monthly")).toBe("£132.52");

    type(el.band, "0");
    expect(el.out("monthly")).toBe("£74.39");
    type(el.band, "2");
    expect(el.out("monthly")).toBe("£144.84");
  });

  it("caps the term at 50 years so the over-term figure stays credible", () => {
    const el = mount({ premium: "100", term: "999", band: "1" });
    initCalc();
    // 50 years, not 999.
    expect(el.out("term")).toBe("£79,514");
  });

  it("publishes band state for the CSS to style off", () => {
    const el = mount({ premium: "100", band: "0" });
    initCalc();

    expect(el.root.getAttribute("data-calc-band-value")).toBe("0");
    expect(el.root.style.getPropertyValue("--calc-band-pos")).toBe("0%");

    type(el.band, "1");
    expect(el.root.getAttribute("data-calc-band-value")).toBe("1");
    expect(el.root.style.getPropertyValue("--calc-band-pos")).toBe("50%");

    type(el.band, "2");
    expect(el.root.style.getPropertyValue("--calc-band-pos")).toBe("100%");
  });

  it("announces the band by name, never as a percentage", () => {
    const el = mount({ premium: "100", band: "0" });
    initCalc();

    expect(el.band.getAttribute("aria-valuetext")).toBe("Basic");
    type(el.band, "2");
    expect(el.band.getAttribute("aria-valuetext")).toBe("Additional");
    // The client was explicit that the % misleads for directors.
    expect(el.band.getAttribute("aria-valuetext")).not.toMatch(/%/);
  });

  it("clamps a band index outside the rate table", () => {
    const el = mount({ premium: "100", term: "25", band: "1" });
    initCalc();

    type(el.band, "7");
    expect(el.out("monthly")).toBe("£144.84"); // clamped to Additional
    type(el.band, "-3");
    expect(el.out("monthly")).toBe("£74.39"); // clamped to Basic
  });

  it("reads overridden rates off the root", () => {
    const el = mount({
      premium: "100",
      term: "25",
      band: "1",
      // The pre-2022 rates the old site still runs — proves the attribute wins.
      rates: { "data-calc-rate-higher": "0.325", "data-calc-corp": "0.19" },
    });
    initCalc();
    // 100/(1-0.325)/(1-0.19) − 100×(1-0.19) = 182.899 − 81
    expect(el.out("monthly")).toBe("£101.90");
  });

  it("ignores a rate expressed as a percentage instead of a fraction", () => {
    // "35.75" would make (1 - rate) negative and invert the saving — the one
    // failure mode that yields a confident wrong number.
    const el = mount({
      premium: "100",
      term: "25",
      band: "1",
      rates: { "data-calc-rate-higher": "35.75" },
    });
    initCalc();
    expect(el.out("monthly")).toBe("£132.52"); // fell back to the approved rate
  });

  it("falls back to the approved rates when the attributes are absent", () => {
    const el = mount({
      premium: "100",
      term: "25",
      band: "1",
      rates: {
        "data-calc-corp": null,
        "data-calc-rate-basic": null,
        "data-calc-rate-higher": null,
        "data-calc-rate-additional": null,
      },
    });
    initCalc();
    expect(el.out("monthly")).toBe("£132.52");
  });

  it("makes the range continuous so the thumb can follow the pointer", () => {
    const el = mount({ premium: "100", band: "1" });
    expect(el.band.getAttribute("step")).toBe("1"); // as authored
    initCalc();
    expect(el.band.step).toBe("any");
  });

  it("fills the track to the thumb, not the band, while dragging", () => {
    const el = mount({ premium: "100", band: "1" });
    initCalc();

    // Not dragging: a fractional value still reports its band's position.
    type(el.band, "1.4");
    expect(el.root.style.getPropertyValue("--calc-band-pos")).toBe("50%");

    el.root.setAttribute("data-calc-dragging", "");
    type(el.band, "1.4");
    expect(el.root.style.getPropertyValue("--calc-band-pos")).toBe("70%");
  });

  it("rounds a mid-drag value to the nearest band for the figures", () => {
    const el = mount({ premium: "100", term: "25", band: "0" });
    initCalc();
    el.root.setAttribute("data-calc-dragging", "");

    type(el.band, "0.49"); // still Basic
    expect(el.out("monthly")).toBe("£74.39");
    expect(el.root.getAttribute("data-calc-band-value")).toBe("0");

    type(el.band, "0.51"); // crossed into Higher
    expect(el.out("monthly")).toBe("£132.52");
    expect(el.root.getAttribute("data-calc-band-value")).toBe("1");
  });

  it("announces the band, never the fractional value, mid-drag", () => {
    const el = mount({ premium: "100", band: "0" });
    initCalc();
    el.root.setAttribute("data-calc-dragging", "");

    type(el.band, "1.8");
    expect(el.band.getAttribute("aria-valuenow")).toBe("2");
    expect(el.band.getAttribute("aria-valuetext")).toBe("Additional");
  });

  it("moves a whole band per arrow key, not a fraction of the range", () => {
    const el = mount({ premium: "100", term: "25", band: "0" });
    instantSnap(el);
    initCalc();

    const press = (key) =>
      el.band.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

    press("ArrowRight");
    expect(el.band.value).toBe("1");
    expect(el.out("monthly")).toBe("£132.52");

    press("End");
    expect(el.band.value).toBe("2");

    // Already at the top — must not run past the last band.
    press("ArrowRight");
    expect(el.band.value).toBe("2");

    press("Home");
    expect(el.band.value).toBe("0");
  });

  it("clears the dragging flag once the thumb has settled", () => {
    const el = mount({ premium: "100", band: "0" });
    instantSnap(el);
    initCalc();

    el.band.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    expect(el.root.hasAttribute("data-calc-dragging")).toBe(false);
    expect(el.root.style.getPropertyValue("--calc-band-pos")).toBe("50%");
  });

  it("still eases when a duration token is present", async () => {
    const el = mount({ premium: "100", band: "0" });
    el.root.style.setProperty("--anim-dur-ui", "0.25s");
    initCalc();

    el.band.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    // Mid-flight: still animating, so the flag is up and the value is fractional.
    expect(el.root.hasAttribute("data-calc-dragging")).toBe(true);
    expect(Number(el.band.value)).toBeGreaterThanOrEqual(0);
    expect(Number(el.band.value)).toBeLessThanOrEqual(1);

    const deadline = Date.now() + 5000;
    while (el.root.hasAttribute("data-calc-dragging") && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 16));
    }
    expect(el.band.value).toBe("1");
  });

  it("does nothing when the section has no outputs", () => {
    document.body.innerHTML = `<section data-calc></section>`;
    expect(() => initCalc()).not.toThrow();
  });

  it("handles more than one calculator on a page independently", () => {
    document.body.innerHTML = `
      <section data-calc><input data-calc-premium value="100">
        <input type="range" min="0" max="2" value="0" data-calc-band>
        <div data-calc-out="monthly"></div></section>
      <section data-calc><input data-calc-premium value="100">
        <input type="range" min="0" max="2" value="2" data-calc-band>
        <div data-calc-out="monthly"></div></section>`;
    initCalc();

    const [first, second] = document.querySelectorAll('[data-calc-out="monthly"]');
    expect(first.textContent).toBe("£74.39");
    expect(second.textContent).toBe("£144.84");
  });
});
