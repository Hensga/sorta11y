import { describe, it, expect, afterEach, vi } from "vitest";
import Sorta11y from "../src/sorta11y.js";
import {
  makeList,
  press,
  SPACE,
  LABELS,
  domOrder,
  liveRegionOf,
} from "./helpers/dom.js";

let instances = [];
function create(ul, options = {}) {
  const inst = Sorta11y.create(ul, { labels: LABELS, ...options });
  instances.push(inst);
  return inst;
}
afterEach(() => {
  instances.forEach((i) => {
    try {
      i.destroy();
    } catch {
      /* noop */
    }
  });
  instances = [];
  document.body.replaceChildren();
});

describe("sorta11y — public API", () => {
  it("toArray() reports the current data-id order", () => {
    const ul = makeList();
    const inst = create(ul);
    expect(inst.toArray()).toEqual(["a", "b", "c", "d"]);
  });

  it("sort(order) reorders the DOM to match", () => {
    const ul = makeList();
    const inst = create(ul);
    inst.sort(["d", "c", "b", "a"]);
    expect(domOrder(ul)).toEqual(["d", "c", "b", "a"]);
    expect(inst.toArray()).toEqual(["d", "c", "b", "a"]);
  });

  it("option() gets and sets; liveness updates the live region", () => {
    const ul = makeList();
    const inst = create(ul);
    expect(inst.option("announceTotal")).toBe(true);
    inst.option("liveness", "assertive");
    expect(liveRegionOf(ul).getAttribute("aria-live")).toBe("assertive");
  });

  it("onChange does not fire when an item is dropped at its original position", () => {
    const ul = makeList();
    const onChange = vi.fn();
    create(ul, { onChange });
    const item = ul.children[0];
    item.focus();
    press(item, SPACE); // grab
    press(item, SPACE); // drop, no move
    expect(onChange).not.toHaveBeenCalled();
  });

  it("autoInit() enhances every [data-sorta11y] list and respects data-handle", () => {
    const ul = makeList({ handle: true });
    ul.setAttribute("data-sorta11y", "");
    ul.setAttribute("data-handle", ".drag-handle");
    const created = Sorta11y.autoInit();
    created.forEach((i) => instances.push(i));
    expect(created.length).toBe(1);
    expect(Sorta11y.get(ul)).toBe(created[0]);
    // Native <button> handle is enhanced with the grab state (aria-pressed),
    // not a redundant role="button".
    const handle = ul.querySelector(".drag-handle");
    expect(handle.tagName).toBe("BUTTON");
    expect(handle.getAttribute("aria-pressed")).toBe("false");
  });
});
