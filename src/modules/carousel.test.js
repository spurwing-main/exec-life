/**
 * Arrow direction resolution.
 *
 * This is the riskiest logic in the carousel module, and until now it had no
 * test. An explicit marker wins; after that the decision falls to DOM ORDER.
 * So a person who drags two arrows in the Designer to swap them visually also
 * swaps what they do, and the Designer shows no sign that order matters. These
 * cases pin the behaviour so a refactor cannot invert it quietly.
 *
 * Embla never runs here. The function under test reads the DOM only.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { resolveArrowDirection } from "./carousel.js";

function build(html) {
  document.body.innerHTML = `<div data-carousel>${html}</div>`;
  const root = document.querySelector("[data-carousel]");
  const arrows = [...root.querySelectorAll("[data-carousel-arrow]")];
  return { root, arrows, ...resolveArrowDirection(arrows, root) };
}

const arrow = (attrs = "") => `<button data-carousel-arrow ${attrs}></button>`;

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("resolveArrowDirection", () => {
  it("treats the first of a pair as back, and the second as forward", () => {
    const { arrows, prevs, nexts } = build(`<div>${arrow()}${arrow()}</div>`);
    expect(prevs).toEqual([arrows[0]]);
    expect(nexts).toEqual([arrows[1]]);
  });

  it("resolves each control surface on its own", () => {
    // A header pair and a footer pair. Each must produce one back and one
    // forward, not one back for the whole carousel.
    const { arrows, prevs, nexts } = build(
      `<div class="head">${arrow()}${arrow()}</div><div class="foot">${arrow()}${arrow()}</div>`
    );
    expect(prevs).toEqual([arrows[0], arrows[2]]);
    expect(nexts).toEqual([arrows[1], arrows[3]]);
  });

  it("lets an explicit marker beat DOM order", () => {
    const { arrows, prevs, nexts } = build(
      `<div>${arrow('data-carousel-next')}${arrow('data-carousel-prev')}</div>`
    );
    expect(prevs).toEqual([arrows[1]]);
    expect(nexts).toEqual([arrows[0]]);
  });

  it("reads the variant name when there is no marker", () => {
    const { arrows, prevs } = build(
      `<div>${arrow()}${arrow("data-wf--slider-arrow--variant=\"previous\"")}</div>`
    );
    // Both resolve to back here: the first by order, the second by its variant.
    // That is the existing behaviour, and it is why an explicit marker is safer.
    expect(prevs).toEqual([arrows[0], arrows[1]]);
  });

  it("treats a lone arrow as forward, not back", () => {
    // One arrow means "next". A single back arrow would trap a person on slide 1.
    const { arrows, prevs, nexts } = build(`<div>${arrow()}</div>`);
    expect(prevs).toEqual([]);
    expect(nexts).toEqual([arrows[0]]);
  });

  it("makes only the first of three go back", () => {
    // A third arrow is a client edit nobody designed for. It must not become a
    // second back arrow.
    const { arrows, prevs, nexts } = build(`<div>${arrow()}${arrow()}${arrow()}</div>`);
    expect(prevs).toEqual([arrows[0]]);
    expect(nexts).toEqual([arrows[1], arrows[2]]);
  });

  it("keeps `is-prev` meaning back, so a second run agrees with the first", () => {
    // setupCarousel stamps is-prev on each back arrow. A re-init must reach the
    // same answer, or the arrows swap on the second pass.
    const { arrows, prevs, nexts } = build(
      `<div>${arrow('class="is-prev"')}${arrow()}</div>`
    );
    expect(prevs).toEqual([arrows[0]]);
    expect(nexts).toEqual([arrows[1]]);
  });

  it("handles no arrows without failing", () => {
    const { prevs, nexts } = build(`<div></div>`);
    expect(prevs).toEqual([]);
    expect(nexts).toEqual([]);
  });

  it("swaps direction when the two arrows are reordered", () => {
    // The documented hazard, stated as a test. Drag the arrows to swap them and
    // the behaviour swaps too. If this ever stops being true, the module changed
    // its contract and the comment above it needs rewriting.
    const first = build(`<div>${arrow('id="a"')}${arrow('id="b"')}</div>`);
    expect(first.prevs[0].id).toBe("a");
    const second = build(`<div>${arrow('id="b"')}${arrow('id="a"')}</div>`);
    expect(second.prevs[0].id).toBe("b");
  });
});
