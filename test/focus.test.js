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

// Re-appending items (a pointer swap, sort(), a reverted drag) detaches the
// focused node for a moment, and browsers — jsdom too — then drop focus to
// <body>. The keyboard user's place must survive every such move.
const realRect = Element.prototype.getBoundingClientRect;

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
  Element.prototype.getBoundingClientRect = realRect;
  document.body.replaceChildren();
});

// 20px rows: item at index i spans [i*20, i*20+20), midpoint at i*20 + 10.
function fakeLayout(ul) {
  Element.prototype.getBoundingClientRect = function () {
    const idx = Array.prototype.indexOf.call(ul.children, this);
    const top = idx < 0 ? 0 : idx * 20;
    return { top, bottom: top + 20, left: 0, right: 0, width: 0, height: 20 };
  };
}
const ptr = (type, target, clientY) =>
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientY,
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
    }),
  );
const handleOf = (ul, i) => ul.children[i].querySelector(".drag-handle");
const microtasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("sorta11y — focus survives a pointer drag", () => {
  it("the focused handle keeps focus through a committed drag", () => {
    const ul = makeList({ handle: true });
    create(ul, { handle: ".drag-handle", animation: 0 });
    fakeLayout(ul);
    const handle = handleOf(ul, 0);
    handle.focus(); // Chromium/Gecko focus a button on mousedown
    ptr("pointerdown", handle, 10);
    ptr("pointermove", document.body, 16); // start
    ptr("pointermove", document.body, 32); // swap → the row is re-appended
    ptr("pointerup", document.body, 32);
    expect(domOrder(ul)).toEqual(["b", "a", "c", "d"]);
    expect(document.activeElement).toBe(handle);
  });

  it("a no-handle item keeps focus through a drag, and through its cancel", () => {
    const ul = makeList();
    create(ul, { animation: 0 });
    fakeLayout(ul);
    const a = ul.children[0];
    a.focus();
    ptr("pointerdown", a, 10);
    ptr("pointermove", document.body, 16);
    ptr("pointermove", document.body, 32); // [b, a, c, d]
    expect(document.activeElement).toBe(a);
    document.body.dispatchEvent(
      new MouseEvent("pointercancel", { bubbles: true }),
    ); // reverted — another re-append
    expect(domOrder(ul)).toEqual(["a", "b", "c", "d"]);
    expect(document.activeElement).toBe(a);
  });

  it("focus on ANOTHER item (Safari leaves it there on click) stays put", () => {
    const ul = makeList({ handle: true });
    create(ul, { handle: ".drag-handle", animation: 0 });
    fakeLayout(ul);
    const other = handleOf(ul, 1);
    other.focus();
    ptr("pointerdown", handleOf(ul, 0), 10);
    ptr("pointermove", document.body, 16);
    ptr("pointermove", document.body, 32); // b is re-appended too
    ptr("pointerup", document.body, 32);
    expect(document.activeElement).toBe(other);
  });

  it("restores focus without scrolling the page", () => {
    const ul = makeList({ handle: true });
    create(ul, { handle: ".drag-handle", animation: 0 });
    fakeLayout(ul);
    const handle = handleOf(ul, 0);
    handle.focus();
    const focus = vi.spyOn(handle, "focus");
    ptr("pointerdown", handle, 10);
    ptr("pointermove", document.body, 16);
    ptr("pointermove", document.body, 32);
    ptr("pointerup", document.body, 32);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("does not grab focus when nothing inside the list had it", () => {
    const outside = document.createElement("input");
    document.body.appendChild(outside);
    const ul = makeList({ handle: true });
    create(ul, { handle: ".drag-handle", animation: 0 });
    fakeLayout(ul);
    outside.focus();
    ptr("pointerdown", handleOf(ul, 0), 10);
    ptr("pointermove", document.body, 16);
    ptr("pointermove", document.body, 32);
    ptr("pointerup", document.body, 32);
    expect(document.activeElement).toBe(outside);
  });
});

describe("sorta11y — focus survives sort()", () => {
  it("keeps focus on the focused item (idle), with or without animation", () => {
    const ul = makeList();
    const inst = create(ul);
    const c = ul.children[2];
    c.focus();
    inst.sort(["d", "c", "b", "a"]);
    expect(document.activeElement).toBe(c);
    inst.sort(["a", "b", "c", "d"], false);
    expect(document.activeElement).toBe(c);
    inst.sort(["a", "b", "c", "d"]); // unchanged order still re-appends
    expect(document.activeElement).toBe(c);
  });

  it("mid-grab: the grab survives the sort and the drop reports the sorted order", async () => {
    const ul = makeList();
    const onEnd = vi.fn();
    const inst = create(ul, { onEnd, animation: 0 });
    const a = ul.children[0];
    a.focus();
    press(a, SPACE); // grab a
    press(a, "ArrowDown"); // [b, a, c, d] — focus is on a again
    expect(document.activeElement).toBe(a);
    inst.sort(["d", "c", "a", "b"]);
    expect(document.activeElement).toBe(a);
    await microtasks(); // the leaves-the-widget check must not fire
    expect(a.classList.contains("s11y-item--grabbed")).toBe(true);
    expect(domOrder(ul)).toEqual(["d", "c", "a", "b"]); // not reverted
    press(a, SPACE); // drop
    expect(onEnd).toHaveBeenCalledOnce();
    expect(onEnd.mock.calls[0][0].order).toEqual(["d", "c", "a", "b"]);
  });
});

// Only a keyboard MOVE scrolls (it reveals the moved item on purpose). Pickup,
// drop and an auto-cancel must not: the item is where the user already is, and
// a scroll would move a handle out from under the pointer (tap-to-place) or
// fight the wheel that caused the cancel.
describe("sorta11y — pickup, drop and auto-cancel never scroll the page", () => {
  const scrolls = (spy) =>
    spy.mock.calls.filter(([opts]) => !(opts && opts.preventScroll));

  it("pickup moves focus to the list without scrolling", () => {
    const ul = makeList({ handle: true });
    create(ul, { animation: 0, handle: ".drag-handle" });
    const handle = ul.querySelector("button");
    handle.focus();
    const listFocus = vi.spyOn(ul, "focus");
    press(handle, SPACE);
    expect(listFocus).toHaveBeenCalled();
    expect(scrolls(listFocus)).toEqual([]);
  });

  it("a drop without a move returns focus without scrolling", () => {
    const ul = makeList({ handle: true });
    create(ul, { animation: 0, handle: ".drag-handle" });
    const handle = ul.querySelector("button");
    handle.focus();
    press(handle, SPACE); // pickup
    const handleFocus = vi.spyOn(handle, "focus");
    press(document.activeElement, SPACE); // drop in place
    expect(handleFocus).toHaveBeenCalled();
    expect(scrolls(handleFocus)).toEqual([]);
  });

  it("a wheel auto-cancel returns focus without scrolling", () => {
    const ul = makeList();
    create(ul, { animation: 0 });
    const a = ul.children[0];
    a.focus();
    press(a, SPACE);
    const itemFocus = vi.spyOn(a, "focus");
    window.dispatchEvent(new Event("wheel"));
    expect(a.classList.contains("s11y-item--grabbed")).toBe(false);
    expect(scrolls(itemFocus)).toEqual([]);
  });
});

describe("sorta11y — destroy() after the page removed the list", () => {
  it("does not put the removed list back into the document", () => {
    const ul = makeList();
    const inst = create(ul);
    expect(ul.parentNode.classList.contains("s11y-app")).toBe(true);
    ul.remove(); // the app tears its list down first…
    inst.destroy(); // …then the widget
    expect(ul.isConnected).toBe(false);
    expect(document.querySelector(".s11y-app")).toBeNull();
  });

  it("still unwraps a list that is in place", () => {
    const ul = makeList();
    const inst = create(ul);
    const host = ul.parentNode.parentNode;
    inst.destroy();
    expect(ul.parentNode).toBe(host);
    expect(document.querySelector(".s11y-app")).toBeNull();
  });
});
