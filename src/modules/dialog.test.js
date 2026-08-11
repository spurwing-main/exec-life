import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initDialogs } from "./dialog.js";

function mount({ panel = true } = {}) {
  document.body.innerHTML = `
    <button data-dialog-open="life-rate-info">More information</button>
    <dialog id="life-rate-info" data-dialog aria-labelledby="life-rate-title">
      ${panel ? '<div data-dialog-panel>' : ""}
        <button data-dialog-close aria-label="Close">×</button>
        <h2 id="life-rate-title">Life payout rate</h2>
        <p>Explanation</p>
      ${panel ? "</div>" : ""}
    </dialog>`;

  const opener = document.querySelector("[data-dialog-open]");
  const dialog = document.querySelector("dialog");
  const surface = document.querySelector("[data-dialog-panel]") || dialog;
  const closeButton = document.querySelector("[data-dialog-close]");

  dialog.showModal = vi.fn(() => {
    dialog.setAttribute("open", "");
  });
  dialog.close = vi.fn(() => {
    dialog.removeAttribute("open");
  });

  return { opener, dialog, surface, closeButton };
}

function clickAt(target, x, y) {
  target.dispatchEvent(
    new window.MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
    })
  );
}

describe("initDialogs", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens the target with showModal and wires the invoker semantics", () => {
    const { opener, dialog } = mount();
    initDialogs();

    expect(opener.type).toBe("button");
    expect(opener.getAttribute("aria-haspopup")).toBe("dialog");
    expect(opener.getAttribute("aria-controls")).toBe(dialog.id);

    opener.click();
    expect(dialog.showModal).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(true);
  });

  it("closes from the explicit close button", () => {
    const { opener, dialog, closeButton } = mount();
    initDialogs();

    opener.click();
    closeButton.click();

    expect(closeButton.type).toBe("button");
    expect(dialog.close).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(false);
  });

  it("closes when the click is outside the visible panel", () => {
    const { opener, dialog, surface } = mount();
    surface.getBoundingClientRect = () => ({
      left: 100,
      right: 500,
      top: 100,
      bottom: 400,
      width: 400,
      height: 300,
      x: 100,
      y: 100,
      toJSON() {},
    });
    initDialogs();
    opener.click();

    clickAt(dialog, 50, 250);
    expect(dialog.close).toHaveBeenCalledTimes(1);
  });

  it("does not close for a click inside the panel or its padding", () => {
    const { opener, dialog, surface } = mount();
    surface.getBoundingClientRect = () => ({
      left: 100,
      right: 500,
      top: 100,
      bottom: 400,
      width: 400,
      height: 300,
      x: 100,
      y: 100,
      toJSON() {},
    });
    initDialogs();
    opener.click();

    clickAt(dialog, 120, 120);
    expect(dialog.close).not.toHaveBeenCalled();

    clickAt(surface, 200, 200);
    expect(dialog.close).not.toHaveBeenCalled();
  });

  it("uses the dialog bounds when no inner panel is authored", () => {
    const { opener, dialog } = mount({ panel: false });
    dialog.getBoundingClientRect = () => ({
      left: 100,
      right: 500,
      top: 100,
      bottom: 400,
      width: 400,
      height: 300,
      x: 100,
      y: 100,
      toJSON() {},
    });
    initDialogs();
    opener.click();

    clickAt(dialog, 50, 250);
    expect(dialog.close).toHaveBeenCalledTimes(1);
  });

  it("is idempotent across repeated init", () => {
    const { opener, dialog, closeButton } = mount();
    initDialogs();
    initDialogs();

    opener.click();
    closeButton.click();
    expect(dialog.showModal).toHaveBeenCalledTimes(1);
    expect(dialog.close).toHaveBeenCalledTimes(1);
  });

  it("warns instead of throwing when an opener has no matching dialog", () => {
    document.body.innerHTML = '<button data-dialog-open="missing">Open</button>';
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    initDialogs();

    document.querySelector("button").click();
    expect(warn).toHaveBeenCalledWith('[el] dialog: no <dialog> found with id="missing"');
  });

  it("does not interfere with the native cancel event used by Escape", () => {
    const { opener, dialog } = mount();
    initDialogs();
    opener.click();

    const cancel = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(false);
    expect(dialog.close).not.toHaveBeenCalled();
  });
});
