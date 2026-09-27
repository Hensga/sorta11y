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

// sort() moves only what is out of place: every re-append restarts the row's
// CSS animations and hover state (and briefly detaches it).
describe("sorta11y — sort() moves as little as possible", () => {
  const movedBy = (ul, fn) => {
    const mo = new MutationObserver(() => {});
    mo.observe(ul, { childList: true });
    fn();
    const moved = new Set();
    mo.takeRecords().forEach((r) =>
      r.addedNodes.forEach((n) => moved.add(n.getAttribute("data-id"))),
    );
    mo.disconnect();
    return [...moved].sort();
  };

  it("an unchanged order touches nothing", () => {
    const ul = makeList();
    const inst = create(ul);
    expect(movedBy(ul, () => inst.sort(["a", "b", "c", "d"]))).toEqual([]);
    expect(movedBy(ul, () => inst.sort(["a", "b", "c", "d"], false))).toEqual(
      [],
    );
  });

  it("one item out of place moves just that item", () => {
    const ul = makeList();
    const inst = create(ul);
    expect(movedBy(ul, () => inst.sort(["b", "c", "d", "a"]))).toEqual(["a"]);
    expect(domOrder(ul)).toEqual(["b", "c", "d", "a"]);
    expect(movedBy(ul, () => inst.sort(["a", "b", "c", "d"]))).toEqual(["a"]);
    expect(movedBy(ul, () => inst.sort(["a", "c", "d", "b"]))).toEqual(["b"]);
    expect(domOrder(ul)).toEqual(["a", "c", "d", "b"]);
  });

  it("a full reversal still lands exactly, with items not named appended", () => {
    const ul = makeList();
    const inst = create(ul);
    inst.sort(["d", "c", "b", "a"]);
    expect(domOrder(ul)).toEqual(["d", "c", "b", "a"]);
    inst.sort(["b"]);
    expect(domOrder(ul)).toEqual(["b", "d", "c", "a"]);
    expect(inst.toArray()).toEqual(["b", "d", "c", "a"]);
  });

  it("lands every permutation exactly (randomised), non-items staying last", () => {
    const ul = makeList({ count: 6 });
    const tailNote = document.createElement("div");
    ul.appendChild(tailNote);
    const inst = create(ul, { animation: 0 });
    const ids = ["a", "b", "c", "d", "e", "f"];
    let seed = 7; // deterministic LCG, so a failure is reproducible
    const rand = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    for (let n = 0; n < 60; n++) {
      const want = ids.slice().sort(() => rand() - 0.5);
      inst.sort(want);
      expect(domOrder(ul)).toEqual(want);
      expect(inst.toArray()).toEqual(want);
      expect(ul.lastElementChild).toBe(tailNote);
    }
  });

  it("keeps non-item children where they are", () => {
    const ul = makeList();
    const note = document.createElement("div"); // e.g. an empty-state row
    ul.appendChild(note);
    const inst = create(ul);
    inst.sort(["b", "a", "c", "d"]);
    expect(ul.lastElementChild).toBe(note);
    expect(domOrder(ul)).toEqual(["b", "a", "c", "d"]);
  });
});
