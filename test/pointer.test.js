import { describe, it, expect, afterEach, vi } from "vitest";
import Sorta11y from "../src/sorta11y.js";
import {
  makeList,
  press,
  activate,
  SPACE,
  LABELS,
  liveRegionOf,
} from "./helpers/dom.js";

// jsdom has neither layout nor PointerEvent. We simulate a vertical layout and
// dispatch MouseEvents with the same type names (listeners fire on type match).
const realRect = Element.prototype.getBoundingClientRect;

let instances = [];
const track = (i) => {
  instances.push(i);
  return i;
};
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
  delete window.matchMedia;
  document.body.replaceChildren();
});

// 20px rows: item at index i spans [i*20, i*20+20), midpoint at i*20 + 10.
function fakeLayout(ul) {
  Element.prototype.getBoundingClientRect = function () {
    const idx = Array.prototype.indexOf.call(ul.children, this);
    const top = idx < 0 ? 0 : idx * 20;
    return {
      top,
      bottom: top + 20,
      left: 0,
      right: 0,
      width: 0,
      height: 20,
      x: 0,
      y: top,
    };
  };
}
// Dispatch document-level pointer events via document.body so the capture-phase
// listeners on `document` are reliably reached (jsdom does not fire a node's own
// capture listeners for events dispatched directly on that node).
const pdown = (el, clientY, opts = {}) =>
  el.dispatchEvent(
    new MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      clientY,
      button: 0,
      ...opts,
    }),
  );
// buttons:1 = the primary button is held, as it is throughout a real mouse
// drag. The library now treats a non-touch move with buttons:0 as a lost
// pointerup and cancels, so a simulated drag must report the button held.
const pmove = (clientY, opts = {}) =>
  document.body.dispatchEvent(
    new MouseEvent("pointermove", {
      bubbles: true,
      cancelable: true,
      clientY,
      buttons: 1,
      ...opts,
    }),
  );
const pup = () =>
  document.body.dispatchEvent(
    new MouseEvent("pointerup", { bubbles: true, cancelable: true }),
  );
// pointerType cannot go through the MouseEvent init dict (unknown members are
// silently dropped — an assertion against it would be silently green), so it is
// stamped on afterwards. buttons:1 = touch contact / held primary button.
const ptrEvt = (type, pointerType, props = {}) => {
  const ev = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: 1,
    ...props,
  });
  Object.defineProperty(ev, "pointerType", { value: pointerType });
  return ev;
};
const tdown = (el, clientY) =>
  el.dispatchEvent(ptrEvt("pointerdown", "touch", { clientY }));
const tmove = (clientY) =>
  document.body.dispatchEvent(ptrEvt("pointermove", "touch", { clientY }));
const tup = () => document.body.dispatchEvent(ptrEvt("pointerup", "touch"));
const tcancel = () =>
  document.body.dispatchEvent(ptrEvt("pointercancel", "touch"));

describe("sorta11y — pointer/touch drag", () => {
  it("starts a drag past the threshold: dragging class + onStart", () => {
    const ul = makeList();
    const onStart = vi.fn();
    track(Sorta11y.create(ul, { onStart, animation: 0 }));
    fakeLayout(ul);
    const item = ul.children[0];
    pdown(item, 10);
    pmove(16); // 6px > threshold
    expect(item.classList.contains("s11y-item--dragging")).toBe(true);
    expect(item.getAttribute("aria-pressed")).toBeNull(); // no role=button on a no-handle <li>
    expect(onStart).toHaveBeenCalledOnce();
    pup();
  });

  it("draggingClass: a pointer drag adds the consumer class alongside the built-in, and release removes it", () => {
    const ul = makeList();
    track(Sorta11y.create(ul, { draggingClass: "is-dragging", animation: 0 }));
    fakeLayout(ul);
    const item = ul.children[0];
    pdown(item, 10);
    pmove(16); // 6px > threshold → drag starts
    expect(item.classList.contains("s11y-item--dragging")).toBe(true); // built-in stays
    expect(item.classList.contains("is-dragging")).toBe(true); // consumer hook added
    pup();
    expect(item.classList.contains("is-dragging")).toBe(false);
    expect(item.classList.contains("s11y-item--dragging")).toBe(false);
  });

  it("reorders down past a neighbour midpoint and commits on up", () => {
    const ul = makeList();
    const onChange = vi.fn();
    const onEnd = vi.fn();
    const inst = track(Sorta11y.create(ul, { onChange, onEnd, animation: 0 }));
    fakeLayout(ul);
    const a = ul.children[0];
    pdown(a, 10);
    pmove(16); // start
    pmove(32); // past item1 midpoint (30) -> swap down
    expect(inst.toArray()).toEqual(["b", "a", "c", "d"]);
    pup();
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0]).toMatchObject({
      oldIndex: 0,
      newIndex: 1,
      source: "pointer",
    });
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it("reorders up past the previous midpoint", () => {
    const ul = makeList();
    const inst = track(Sorta11y.create(ul, { animation: 0 }));
    fakeLayout(ul);
    const d = ul.children[3]; // index 3, top 60
    pdown(d, 70);
    pmove(64); // start
    pmove(48); // above item2 midpoint (50) -> swap up
    expect(inst.toArray()).toEqual(["a", "b", "d", "c"]);
    pup();
  });

  // WCAG 2.5.7: a single-pointer tap (no drag) is the non-drag reorder
  // alternative. A tap picks the item up, and a second tap on the same item
  // drops it (in place → no reorder).
  it("a tap on an item picks it up; a second tap on it drops in place", () => {
    const ul = makeList();
    const onEnd = vi.fn();
    const inst = track(Sorta11y.create(ul, { onEnd, animation: 0 }));
    fakeLayout(ul);
    const a = ul.children[0];
    pdown(a, 10);
    pup(); // tap → pick up
    expect(a.classList.contains("s11y-item--grabbed")).toBe(true);
    expect(ul.parentElement.getAttribute("role")).toBe("application");
    pdown(a, 10);
    pup(); // tap again → drop in place
    expect(a.classList.contains("s11y-item--grabbed")).toBe(false);
    expect(ul.parentElement.getAttribute("role")).toBeNull();
    expect(inst.toArray()).toEqual(["a", "b", "c", "d"]); // no reorder
    expect(onEnd).toHaveBeenCalledOnce(); // fired once, on the drop
  });

  // clickToGrab: opt-out of the single-pointer tap-to-toggle so the mouse can
  // ONLY drag, never click-to-pick-up. Default true keeps the WCAG 2.5.7 path.
  it("clickToGrab:false — a tap no longer picks up (pointer is drag-only)", () => {
    const ul = makeList();
    const onStart = vi.fn();
    const inst = track(
      Sorta11y.create(ul, { clickToGrab: false, onStart, animation: 0 }),
    );
    fakeLayout(ul);
    const a = ul.children[0];
    pdown(a, 10);
    pup(); // tap → was a pickup; now a no-op
    expect(a.classList.contains("s11y-item--grabbed")).toBe(false);
    expect(ul.parentElement.getAttribute("role")).toBeNull(); // no focus mode
    expect(inst.toArray()).toEqual(["a", "b", "c", "d"]);
    expect(onStart).not.toHaveBeenCalled();
  });

  it("clickToGrab:false — dragging still reorders and commits", () => {
    const ul = makeList();
    const onChange = vi.fn();
    const inst = track(
      Sorta11y.create(ul, { clickToGrab: false, onChange, animation: 0 }),
    );
    fakeLayout(ul);
    const a = ul.children[0];
    pdown(a, 10);
    pmove(16); // past threshold → drag starts
    pmove(32); // past neighbour midpoint → swap
    expect(inst.toArray()).toEqual(["b", "a", "c", "d"]);
    pup();
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("clickToGrab is live: option() toggles tap pickup off and on", () => {
    const ul = makeList();
    const inst = track(Sorta11y.create(ul, { animation: 0 }));
    fakeLayout(ul);
    const a = ul.children[0];
    // default on: a tap picks up, a second tap drops
    pdown(a, 10);
    pup();
    expect(a.classList.contains("s11y-item--grabbed")).toBe(true);
    pdown(a, 10);
    pup();
    expect(a.classList.contains("s11y-item--grabbed")).toBe(false);
    // turn off live: taps become no-ops
    inst.option("clickToGrab", false);
    expect(inst.option("clickToGrab")).toBe(false);
    pdown(a, 10);
    pup();
    expect(a.classList.contains("s11y-item--grabbed")).toBe(false);
    // turn back on: taps pick up again
    inst.option("clickToGrab", true);
    pdown(a, 10);
    pup();
    expect(a.classList.contains("s11y-item--grabbed")).toBe(true);
  });

  // Regression: a no-op tap (clickToGrab:false) must NOT clear the cross-list
  // single-drag-lock. Otherwise a keyboard-held item is stranded — grabbing on
  // another list would not abort it, leaving two items held at once.
  it("clickToGrab:false — a no-op tap keeps a keyboard-held item abortable by another list", () => {
    const ulA = makeList();
    const ulB = makeList();
    const instA = track(
      Sorta11y.create(ulA, { clickToGrab: false, animation: 0 }),
    );
    track(Sorta11y.create(ulB, { animation: 0 }));
    const a = ulA.children[0];
    const b = ulB.children[0];
    // keyboard-grab A on list A
    a._s11yGrab.focus();
    press(a, " ");
    expect(a.classList.contains("s11y-item--grabbed")).toBe(true);
    // a no-op tap on A (clickToGrab off) must leave A held AND the lock intact
    pdown(a, 10);
    pup();
    expect(a.classList.contains("s11y-item--grabbed")).toBe(true);
    // grabbing on list B must abort the still-held A via the single-drag-lock
    b._s11yGrab.focus();
    press(b, " ");
    expect(b.classList.contains("s11y-item--grabbed")).toBe(true);
    expect(a.classList.contains("s11y-item--grabbed")).toBe(false); // aborted, not stranded
  });

  it("Escape during a drag cancels and restores order", () => {
    const ul = makeList();
    const onChange = vi.fn();
    const inst = track(Sorta11y.create(ul, { onChange, animation: 0 }));
    fakeLayout(ul);
    const a = ul.children[0];
    pdown(a, 10);
    pmove(16);
    pmove(32); // -> [b, a, c, d]
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(inst.toArray()).toEqual(["a", "b", "c", "d"]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("pointercancel restores the original order", () => {
    const ul = makeList();
    const onChange = vi.fn();
    const inst = track(Sorta11y.create(ul, { onChange, animation: 0 }));
    fakeLayout(ul);
    const a = ul.children[0];
    pdown(a, 10);
    pmove(16);
    pmove(32);
    document.body.dispatchEvent(
      new MouseEvent("pointercancel", { bubbles: true }),
    );
    expect(inst.toArray()).toEqual(["a", "b", "c", "d"]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores a non-primary button", () => {
    const ul = makeList();
    const onStart = vi.fn();
    track(Sorta11y.create(ul, { onStart, animation: 0 }));
    fakeLayout(ul);
    pdown(ul.children[0], 10, { button: 2 });
    pmove(40);
    expect(onStart).not.toHaveBeenCalled();
  });

  it("pointer:false disables drag entirely", () => {
    const ul = makeList();
    const onStart = vi.fn();
    track(Sorta11y.create(ul, { onStart, pointer: false, animation: 0 }));
    fakeLayout(ul);
    const a = ul.children[0];
    pdown(a, 10);
    pmove(40);
    expect(onStart).not.toHaveBeenCalled();
    expect(a.classList.contains("s11y-item--dragging")).toBe(false);
  });

  it("settles the lifted item with a transition on drop (animation on)", () => {
    const ul = makeList();
    track(Sorta11y.create(ul, { animation: 150 }));
    fakeLayout(ul);
    const a = ul.children[0];
    pdown(a, 10);
    pmove(16);
    pup();
    expect(a.style.transition).toMatch(/transform 150ms/);
    expect(a.style.transform).toBe("");
  });

  it("settles instantly under reduced motion", () => {
    const ul = makeList();
    track(Sorta11y.create(ul, { animation: 150 }));
    fakeLayout(ul);
    window.matchMedia = (q) => ({
      matches: /reduce/.test(q),
      media: q,
      addListener() {},
      removeListener() {},
    });
    const a = ul.children[0];
    pdown(a, 10);
    pmove(16);
    pup();
    expect(a.style.transform).toBe("");
    expect(a.style.transition).toBe("");
  });

  it("a pointer drag pre-empts a keyboard grab on another list (single-drag-lock)", () => {
    const ulA = makeList();
    const ulB = makeList();
    track(Sorta11y.create(ulA, { animation: 0 }));
    track(Sorta11y.create(ulB, { animation: 0 }));
    fakeLayout(ulB);
    // grab on A via keyboard
    ulA.children[0].focus();
    ulA.children[0].dispatchEvent(
      new KeyboardEvent("keydown", {
        key: " ",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(ulA.children[0].classList.contains("s11y-item--grabbed")).toBe(true);
    // start a pointer drag on B
    pdown(ulB.children[0], 10);
    pmove(16);
    expect(ulA.children[0].classList.contains("s11y-item--grabbed")).toBe(
      false,
    ); // A was aborted
    pup();
  });

  it("a keyboard grab on another list pre-empts an active pointer drag", () => {
    const ulA = makeList();
    const ulB = makeList();
    track(Sorta11y.create(ulA, { animation: 0 }));
    track(Sorta11y.create(ulB, { animation: 0 }));
    fakeLayout(ulA);
    pdown(ulA.children[0], 10);
    pmove(16);
    expect(ulA.children[0].classList.contains("s11y-item--dragging")).toBe(
      true,
    );
    // keyboard-grab on B aborts A's pointer drag
    ulB.children[0].focus();
    ulB.children[0].dispatchEvent(
      new KeyboardEvent("keydown", {
        key: " ",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(ulA.children[0].classList.contains("s11y-item--dragging")).toBe(
      false,
    );
    expect(ulB.children[0].classList.contains("s11y-item--grabbed")).toBe(true);
  });

  it("ignores a second pointerdown while already dragging", () => {
    const ul = makeList();
    const onStart = vi.fn();
    track(Sorta11y.create(ul, { onStart, animation: 0 }));
    fakeLayout(ul);
    pdown(ul.children[0], 10);
    pmove(16);
    pdown(ul.children[1], 30); // second press while dragging — ignored
    expect(onStart).toHaveBeenCalledOnce();
    pup();
  });

  it("pointercancel before the threshold is a clean no-op", () => {
    const ul = makeList();
    const onEnd = vi.fn();
    const inst = track(Sorta11y.create(ul, { onEnd, animation: 0 }));
    fakeLayout(ul);
    pdown(ul.children[0], 10); // no movement past threshold
    document.body.dispatchEvent(
      new MouseEvent("pointercancel", { bubbles: true }),
    );
    expect(inst.toArray()).toEqual(["a", "b", "c", "d"]);
    expect(onEnd).not.toHaveBeenCalled();
  });

  // --- pointer edge-case regressions ---

  it("ignores events from a different concurrent pointer (multi-touch)", () => {
    const ul = makeList();
    const inst = track(Sorta11y.create(ul, { animation: 0 }));
    fakeLayout(ul);
    const a = ul.children[0];
    const withId = (type, clientY, id) => {
      const ev = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientY,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1, // primary held until release
      });
      Object.defineProperty(ev, "pointerId", { value: id });
      return ev;
    };
    a.dispatchEvent(withId("pointerdown", 10, 1));
    document.body.dispatchEvent(withId("pointermove", 40, 2)); // foreign pointer — ignored
    expect(inst.toArray()).toEqual(["a", "b", "c", "d"]);
    expect(a.classList.contains("s11y-item--dragging")).toBe(false);
    document.body.dispatchEvent(withId("pointermove", 40, 1)); // the real pointer
    expect(a.classList.contains("s11y-item--dragging")).toBe(true);
    document.body.dispatchEvent(withId("pointerup", 0, 1));
  });

  it("a fast move across several rows swaps multiple positions at once", () => {
    const ul = makeList();
    const inst = track(Sorta11y.create(ul, { animation: 0 }));
    fakeLayout(ul);
    const a = ul.children[0];
    pdown(a, 10);
    pmove(16); // start
    pmove(75); // past c (50) and d (70) midpoints in one move
    expect(inst.toArray()).toEqual(["b", "c", "d", "a"]);
    pup();
  });

  it('option("pointer", false) disables drag; true re-enables it', () => {
    const ul = makeList();
    const onStart = vi.fn();
    const inst = track(Sorta11y.create(ul, { onStart, animation: 0 }));
    fakeLayout(ul);
    inst.option("pointer", false);
    pdown(ul.children[0], 10);
    pmove(40);
    expect(onStart).not.toHaveBeenCalled();
    inst.option("pointer", true);
    pdown(ul.children[0], 10);
    pmove(40);
    expect(onStart).toHaveBeenCalledOnce();
    pup();
  });

  it("handle mode: aria-pressed toggles on the handle during a pointer drag", () => {
    const ul = makeList({ handle: true });
    track(Sorta11y.create(ul, { handle: ".drag-handle", animation: 0 }));
    fakeLayout(ul);
    const handle = ul.children[0].querySelector(".drag-handle");
    pdown(handle, 10);
    pmove(16);
    expect(handle.getAttribute("aria-pressed")).toBe("true");
    pup();
    expect(handle.getAttribute("aria-pressed")).toBe("false");
  });

  // --- WCAG 2.5.7: single-pointer tap-to-toggle (non-drag alternative) ---

  it("keyboard arrows move a tap-picked item; a tap then drops the reorder", () => {
    const ul = makeList();
    const onChange = vi.fn();
    const inst = track(Sorta11y.create(ul, { onChange, animation: 0 }));
    fakeLayout(ul);
    const a = ul.children[0];
    pdown(a, 10);
    pup(); // pick up via tap
    expect(a.classList.contains("s11y-item--grabbed")).toBe(true);
    press(a, "ArrowDown"); // focus-mode arrow key still moves the tap-picked item
    expect(inst.toArray()).toEqual(["b", "a", "c", "d"]);
    pdown(a, 30);
    pup(); // tap again → drop the reorder
    expect(a.classList.contains("s11y-item--grabbed")).toBe(false);
    expect(inst.toArray()).toEqual(["b", "a", "c", "d"]);
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0]).toMatchObject({
      oldIndex: 0,
      newIndex: 1,
    });
  });

  it("tapping a different item while holding moves the held item there and drops", () => {
    const ul = makeList();
    const inst = track(Sorta11y.create(ul, { animation: 0 }));
    fakeLayout(ul);
    const a = ul.children[0];
    const c = ul.children[2];
    pdown(a, 10);
    pup(); // pick up a
    expect(a.classList.contains("s11y-item--grabbed")).toBe(true);
    pdown(c, 50);
    pup(); // tap c → move a into c's slot, then drop
    expect(a.classList.contains("s11y-item--grabbed")).toBe(false);
    expect(inst.toArray()).toEqual(["b", "c", "a", "d"]);
  });

  it("Escape cancels a tap-pickup without stranding role=application", () => {
    const ul = makeList();
    const inst = track(Sorta11y.create(ul, { animation: 0 }));
    fakeLayout(ul);
    const a = ul.children[0];
    pdown(a, 10);
    pup(); // pick up
    expect(a.classList.contains("s11y-item--grabbed")).toBe(true);
    press(a, "Escape");
    expect(a.classList.contains("s11y-item--grabbed")).toBe(false);
    expect(ul.parentElement.getAttribute("role")).toBeNull();
    expect(inst.toArray()).toEqual(["a", "b", "c", "d"]);
  });

  // --- a lost pointerup must not leave the drag stuck ---

  it("a mouse move with no buttons held cancels a stuck drag (lost pointerup)", () => {
    const ul = makeList();
    const onChange = vi.fn();
    const inst = track(Sorta11y.create(ul, { onChange, animation: 0 }));
    fakeLayout(ul);
    const a = ul.children[0];
    pdown(a, 10);
    pmove(16); // start drag (primary button held)
    pmove(32); // reorder → [b, a, c, d]
    expect(inst.toArray()).toEqual(["b", "a", "c", "d"]);
    pmove(40, { buttons: 0 }); // button no longer held → lost release → cancel
    expect(inst.toArray()).toEqual(["a", "b", "c", "d"]); // reverted
    expect(a.classList.contains("s11y-item--dragging")).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("lostpointercapture mid-drag is non-fatal — the drag continues and still commits", () => {
    // A swap re-inserts the dragged row in the DOM, which can release the
    // implicit pointer capture in some browsers. Because move/up are bound on
    // `document`, the drag must keep going (else it would drop after a single
    // swap — a downstream nested-layout regression). pointerup still commits.
    const ul = makeList();
    const inst = track(Sorta11y.create(ul, { animation: 0 }));
    fakeLayout(ul);
    const a = ul.children[0];
    const onChange = vi.fn();
    inst.option("onChange", onChange);
    pdown(a, 10);
    pmove(16);
    pmove(32); // [b, a, c, d]
    expect(inst.toArray()).toEqual(["b", "a", "c", "d"]);
    document.body.dispatchEvent(
      new MouseEvent("lostpointercapture", { bubbles: true }),
    );
    // NOT reverted — the drag survives the lost capture.
    expect(inst.toArray()).toEqual(["b", "a", "c", "d"]);
    expect(a.classList.contains("s11y-item--dragging")).toBe(true);
    pup();
    expect(inst.toArray()).toEqual(["b", "a", "c", "d"]); // committed
    expect(onChange).toHaveBeenCalled();
  });

  // --- the pointer commit/cancel path announces to the live region ---

  it("a committed pointer drag announces the drop", () => {
    const ul = makeList();
    track(Sorta11y.create(ul, { labels: LABELS, animation: 0 }));
    fakeLayout(ul);
    const a = ul.children[0];
    pdown(a, 10);
    pmove(16);
    pmove(32); // [b, a, c, d]
    pup();
    expect(liveRegionOf(ul).textContent).toBe("DROP 2/4");
  });

  it("a cancelled pointer drag announces the cancel", () => {
    const ul = makeList();
    track(Sorta11y.create(ul, { labels: LABELS, animation: 0 }));
    fakeLayout(ul);
    const a = ul.children[0];
    pdown(a, 10);
    pmove(16);
    pmove(32); // [b, a, c, d]
    document.body.dispatchEvent(
      new MouseEvent("pointercancel", { bubbles: true }),
    );
    expect(liveRegionOf(ul).textContent).toBe("CANCEL 1/4");
  });
});

// ---------------------------------------------------------------------------
// dragOnItem — with a handle, the POINTER surface widens to the whole item.
// The a11y contract must not move: the handle stays the only tab stop and the
// aria-pressed carrier (WCAG 2.1.1 / 4.1.2), taps keep the single-pointer
// grab/drop alternative (WCAG 2.5.7), and presses on nested interactive
// controls keep their native behavior.
// ---------------------------------------------------------------------------
describe("sorta11y — dragOnItem (whole-item pointer surface with a handle)", () => {
  it("default off: a press on the item body neither drags nor grabs", () => {
    const ul = makeList({ handle: true });
    const onChange = vi.fn();
    const inst = track(
      Sorta11y.create(ul, { handle: ".drag-handle", animation: 0, onChange }),
    );
    fakeLayout(ul);
    const a = ul.children[0];
    pdown(a, 10);
    pmove(16);
    pmove(32);
    pup();
    expect(onChange).not.toHaveBeenCalled();
    expect(inst.toArray()).toEqual(["a", "b", "c", "d"]);
    pdown(a, 10);
    pup(); // a tap on the body must not grab either
    expect(a.querySelector(".drag-handle").getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("dragOnItem: a drag from the item body reorders and commits", () => {
    const ul = makeList({ handle: true });
    const onChange = vi.fn();
    const inst = track(
      Sorta11y.create(ul, {
        handle: ".drag-handle",
        dragOnItem: true,
        animation: 0,
        onChange,
      }),
    );
    fakeLayout(ul);
    const a = ul.children[0];
    pdown(a, 10); // on the <li> itself, not the handle
    pmove(16); // > threshold → drag starts
    expect(a.classList.contains("s11y-item--dragging")).toBe(true);
    expect(a.querySelector(".drag-handle").getAttribute("aria-pressed")).toBe(
      "true",
    );
    pmove(32); // past B's midpoint → swap down
    pup();
    expect(inst.toArray()).toEqual(["b", "a", "c", "d"]);
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0]).toMatchObject({
      oldIndex: 0,
      newIndex: 1,
      source: "pointer",
    });
  });

  it("dragOnItem: a body tap grabs — focus moves to the list, aria-pressed to the handle", () => {
    const ul = makeList({ handle: true });
    track(
      Sorta11y.create(ul, {
        handle: ".drag-handle",
        dragOnItem: true,
        animation: 0,
      }),
    );
    fakeLayout(ul);
    const a = ul.children[0];
    const handle = a.querySelector(".drag-handle");
    pdown(a, 10);
    pup(); // no movement → tap = pick up
    expect(handle.getAttribute("aria-pressed")).toBe("true");
    // Focus sits on the list during a grab (screen-reader mode switch); the
    // list-level keydown handler keeps the keyboard working from here.
    expect(document.activeElement).toBe(ul);
    pdown(a, 10);
    pup(); // tap again → drop in place
    expect(handle.getAttribute("aria-pressed")).toBe("false");
    expect(document.activeElement).toBe(handle); // released back to the handle
  });

  it("dragOnItem + clickToGrab:false — a body tap stays a no-op but a body drag works", () => {
    const ul = makeList({ handle: true });
    const inst = track(
      Sorta11y.create(ul, {
        handle: ".drag-handle",
        dragOnItem: true,
        clickToGrab: false,
        animation: 0,
      }),
    );
    fakeLayout(ul);
    const a = ul.children[0];
    pdown(a, 10);
    pup(); // tap
    expect(a.querySelector(".drag-handle").getAttribute("aria-pressed")).toBe(
      "false",
    );
    pdown(a, 10);
    pmove(16);
    pmove(32);
    pup(); // drag
    expect(inst.toArray()).toEqual(["b", "a", "c", "d"]);
  });

  it("a press on a nested interactive control never drags or grabs", () => {
    const ul = makeList({ handle: true });
    const inst = track(
      Sorta11y.create(ul, {
        handle: ".drag-handle",
        dragOnItem: true,
        animation: 0,
      }),
    );
    fakeLayout(ul);
    const a = ul.children[0];
    const other = document.createElement("button");
    other.type = "button";
    other.className = "other";
    other.textContent = "open";
    a.appendChild(other);
    pdown(other, 10);
    pmove(16);
    pmove(32);
    pup();
    expect(inst.toArray()).toEqual(["a", "b", "c", "d"]);
    expect(a.classList.contains("s11y-item--dragging")).toBe(false);
    pdown(other, 10);
    pup(); // a tap on the nested control must not grab either
    expect(a.querySelector(".drag-handle").getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("keyboard semantics stay on the handle: no tabindex on the item, body Space inert", () => {
    const ul = makeList({ handle: true });
    track(
      Sorta11y.create(ul, {
        handle: ".drag-handle",
        dragOnItem: true,
        animation: 0,
      }),
    );
    const a = ul.children[0];
    expect(a.hasAttribute("tabindex")).toBe(false); // handle stays the only tab stop
    press(a, SPACE); // keydown from the item body — not the handle
    expect(a.querySelector(".drag-handle").getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("dragOnItem: while an item is held, a tap on another item's body places and drops it (WCAG 2.5.7)", () => {
    const ul = makeList({ handle: true });
    const inst = track(
      Sorta11y.create(ul, {
        handle: ".drag-handle",
        dragOnItem: true,
        animation: 0,
      }),
    );
    fakeLayout(ul);
    const aHandle = ul.children[0].querySelector(".drag-handle");
    activate(aHandle); // keyboard-style pickup via the handle button
    expect(aHandle.getAttribute("aria-pressed")).toBe("true");
    const c = ul.children[2];
    pdown(c, 50);
    pup(); // placement tap on C's body
    expect(inst.toArray()).toEqual(["b", "c", "a", "d"]);
    expect(aHandle.getAttribute("aria-pressed")).toBe("false"); // dropped
  });

  it("option('dragOnItem', …) toggles the body surface live", () => {
    const ul = makeList({ handle: true });
    const inst = track(
      Sorta11y.create(ul, { handle: ".drag-handle", animation: 0 }),
    );
    fakeLayout(ul);
    pdown(ul.children[0], 10);
    pmove(16);
    pmove(32);
    pup();
    expect(inst.toArray()).toEqual(["a", "b", "c", "d"]); // off: body is inert
    inst.option("dragOnItem", true);
    pdown(ul.children[0], 10);
    pmove(16);
    pmove(32);
    pup();
    expect(inst.toArray()).toEqual(["b", "a", "c", "d"]); // on: body drags
  });

  it("dragOnItem alone keeps the body scrollable: native touch-action on the item, none on the handle", () => {
    const ul = makeList({ handle: true });
    track(Sorta11y.create(ul, { handle: ".drag-handle", dragOnItem: true }));
    const a = ul.children[0];
    // A full-screen list must still pan on touch — touch-action:none on every
    // item would be a scroll trap. The handle stays the touch drag surface.
    expect(a.style.touchAction).toBe("");
    expect(a.querySelector(".drag-handle").style.touchAction).toBe("none");
  });

  it("dragOnItemTouch:true applies touch-action:none to the item and cleans it up again", () => {
    const ul = makeList({ handle: true });
    const inst = track(
      Sorta11y.create(ul, {
        handle: ".drag-handle",
        dragOnItem: true,
        dragOnItemTouch: true,
      }),
    );
    const a = ul.children[0];
    expect(a.style.touchAction).toBe("none"); // body presses must not pan the page
    expect(a.querySelector(".drag-handle").style.touchAction).toBe("none");
    inst.option("dragOnItemTouch", false);
    expect(a.style.touchAction).toBe(""); // live-off restores scrolling
    inst.option("dragOnItemTouch", true);
    expect(a.style.touchAction).toBe("none"); // live-on re-applies
    inst.destroy();
    expect(a.style.touchAction).toBe(""); // destroy leaves no styles behind
  });
});

// ---------------------------------------------------------------------------
// dragOnItemTouch — the mobile scroll guard. By default a TOUCH press on the
// item body may TAP (pickup / placement — a stationary tap never competes with
// panning) but never DRAG: the body keeps its native touch-action so a long
// list still scrolls, and the handle stays the touch drag surface. Mouse/pen
// drags on the body are unaffected (decided per pointerdown via pointerType,
// so hybrid devices get both). dragOnItemTouch:true restores the full-surface
// touch drag for short/unscrollable lists.
// ---------------------------------------------------------------------------
describe("sorta11y — dragOnItemTouch (mobile scroll guard)", () => {
  const make = (extra = {}) => {
    const ul = makeList({ handle: true });
    const inst = track(
      Sorta11y.create(ul, {
        handle: ".drag-handle",
        dragOnItem: true,
        animation: 0,
        ...extra,
      }),
    );
    fakeLayout(ul);
    return { ul, inst };
  };

  it("default: a touch drag from the item body neither drags nor reorders — and is no tap either", () => {
    const onStart = vi.fn();
    const { ul, inst } = make({ onStart });
    const a = ul.children[0];
    tdown(a, 10);
    tmove(16); // past the threshold — a mouse would be dragging by now
    tmove(32);
    expect(a.classList.contains("s11y-item--dragging")).toBe(false);
    tup();
    expect(onStart).not.toHaveBeenCalled();
    expect(inst.toArray()).toEqual(["a", "b", "c", "d"]);
    // the moved press must not count as a tap pickup on release
    expect(a.querySelector(".drag-handle").getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("default: touch taps on the body still pick up and place (WCAG 2.5.7)", () => {
    const { ul, inst } = make();
    const handle = ul.children[0].querySelector(".drag-handle");
    tdown(ul.children[0], 10);
    tup(); // stationary tap = pickup
    expect(handle.getAttribute("aria-pressed")).toBe("true");
    tdown(ul.children[2], 50);
    tup(); // placement tap on C's body
    expect(inst.toArray()).toEqual(["b", "c", "a", "d"]);
    expect(handle.getAttribute("aria-pressed")).toBe("false");
  });

  it("default: a touch drag from the HANDLE still reorders", () => {
    const { ul, inst } = make();
    tdown(ul.children[0].querySelector(".drag-handle"), 10);
    tmove(16);
    tmove(32);
    tup();
    expect(inst.toArray()).toEqual(["b", "a", "c", "d"]);
  });

  it("default: a mouse drag from the body still reorders (per-pointer, not per-device)", () => {
    const { ul, inst } = make();
    ul.children[0].dispatchEvent(
      ptrEvt("pointerdown", "mouse", { clientY: 10 }),
    );
    pmove(16);
    pmove(32);
    pup();
    expect(inst.toArray()).toEqual(["b", "a", "c", "d"]);
  });

  it("default: a pen press on the body is tap-only too — touch-action governs pens, not just fingers", () => {
    // Chromium/WebKit pan with a stylus by default (pen is a direct-
    // manipulation pointer), so a body pen-drag would lift, get
    // pointercancelled by the browser's pan and announce a false "cancelled".
    const onStart = vi.fn();
    const { ul, inst } = make({ onStart });
    const a = ul.children[0];
    const handle = a.querySelector(".drag-handle");
    a.dispatchEvent(ptrEvt("pointerdown", "pen", { clientY: 10 }));
    document.body.dispatchEvent(ptrEvt("pointermove", "pen", { clientY: 32 }));
    expect(a.classList.contains("s11y-item--dragging")).toBe(false);
    document.body.dispatchEvent(ptrEvt("pointerup", "pen"));
    expect(onStart).not.toHaveBeenCalled();
    expect(inst.toArray()).toEqual(["a", "b", "c", "d"]);
    // …but a stationary pen TAP on the body still picks up
    a.dispatchEvent(ptrEvt("pointerdown", "pen", { clientY: 10 }));
    document.body.dispatchEvent(ptrEvt("pointerup", "pen"));
    expect(handle.getAttribute("aria-pressed")).toBe("true");
  });

  it("default: a pen drag from the HANDLE still reorders (handle keeps touch-action:none)", () => {
    const { ul, inst } = make();
    ul.children[0]
      .querySelector(".drag-handle")
      .dispatchEvent(ptrEvt("pointerdown", "pen", { clientY: 10 }));
    document.body.dispatchEvent(ptrEvt("pointermove", "pen", { clientY: 16 }));
    document.body.dispatchEvent(ptrEvt("pointermove", "pen", { clientY: 32 }));
    document.body.dispatchEvent(ptrEvt("pointerup", "pen"));
    expect(inst.toArray()).toEqual(["b", "a", "c", "d"]);
  });

  it("default: body-tap jitter inside the platform tap slop still picks up (tremor input)", () => {
    // Real touch taps report a few px of pointermove; browsers classify up to
    // ~10px as a tap. The noDrag teardown must use that slop, not the 4px
    // DRAG_THRESHOLD — else jittery taps die silently on the one surface that
    // exists to enlarge the WCAG 2.5.7 tap target.
    const { ul, inst } = make();
    const handle = ul.children[0].querySelector(".drag-handle");
    tdown(ul.children[0], 10);
    tmove(15); // 5px jitter: a drag for a mouse, still a TAP for touch
    tup();
    expect(handle.getAttribute("aria-pressed")).toBe("true"); // picked up
    tdown(ul.children[0], 10);
    tup(); // drop again
    expect(handle.getAttribute("aria-pressed")).toBe("false");
    // At the slop boundary the press stops being a tap and is torn down.
    tdown(ul.children[0], 10);
    tmove(20); // 10px: past the platform tap slop → pan attempt
    tup();
    expect(handle.getAttribute("aria-pressed")).toBe("false");
    expect(inst.toArray()).toEqual(["a", "b", "c", "d"]);
  });

  it("dragOnItemTouch:true restores the whole-item touch drag", () => {
    const { ul, inst } = make({ dragOnItemTouch: true });
    tdown(ul.children[0], 10);
    tmove(16);
    tmove(32);
    tup();
    expect(inst.toArray()).toEqual(["b", "a", "c", "d"]);
  });

  it("option('dragOnItemTouch', …) applies live to the next press", () => {
    const { ul, inst } = make();
    tdown(ul.children[0], 10);
    tmove(16);
    tmove(32);
    tup();
    expect(inst.toArray()).toEqual(["a", "b", "c", "d"]); // off: body touch is tap-only
    inst.option("dragOnItemTouch", true);
    expect(ul.children[0].style.touchAction).toBe("none");
    tdown(ul.children[0], 10);
    tmove(16);
    tmove(32);
    tup();
    expect(inst.toArray()).toEqual(["b", "a", "c", "d"]); // on: body touch drags
  });

  it("a pointercancel mid placement-tap (browser claims the scroll) keeps the item held", () => {
    const { ul, inst } = make();
    const aHandle = ul.children[0].querySelector(".drag-handle");
    activate(aHandle); // pick A up via the handle button
    expect(aHandle.getAttribute("aria-pressed")).toBe("true");
    tdown(ul.children[2], 50); // finger lands on another item's body…
    tcancel(); // …but the browser takes the gesture for scrolling
    expect(aHandle.getAttribute("aria-pressed")).toBe("true"); // still held
    // and the hold is fully alive: a later placement tap still commits
    tdown(ul.children[2], 50);
    tup();
    expect(inst.toArray()).toEqual(["b", "c", "a", "d"]);
    expect(aHandle.getAttribute("aria-pressed")).toBe("false");
  });

  it("a pointercancel on a never-started press is inert: no restore churn, no styles, focus survives", () => {
    // Every touch scroll that starts on an item body now runs this path
    // (pointerdown → browser claims the pan → pointercancel), so it must not
    // re-append items (blurs a focused handle, resets hover/animations) nor
    // write transition styles on the item.
    const ul = makeList({ handle: true });
    const inst = track(
      Sorta11y.create(ul, { handle: ".drag-handle", dragOnItem: true }),
    ); // default animation:150 — a leaked _settle would write a transition
    fakeLayout(ul);
    const a = ul.children[0];
    const handle = a.querySelector(".drag-handle");
    handle.focus();
    tdown(a, 10);
    tcancel(); // browser takes the gesture for scrolling
    expect(a.style.transition).toBe("");
    expect(inst.toArray()).toEqual(["a", "b", "c", "d"]);
    expect(document.activeElement).toBe(handle); // scroll start must not steal focus
  });

  it("a cancelled placement tap keeps the single-grab lock: a grab elsewhere still aborts the hold", () => {
    const ul1 = makeList({ handle: true });
    const ul2 = makeList({ handle: true });
    track(
      Sorta11y.create(ul1, {
        handle: ".drag-handle",
        dragOnItem: true,
        animation: 0,
      }),
    );
    track(Sorta11y.create(ul2, { handle: ".drag-handle", animation: 0 }));
    fakeLayout(ul1);
    const h1 = ul1.children[0].querySelector(".drag-handle");
    activate(h1);
    expect(h1.getAttribute("aria-pressed")).toBe("true");
    tdown(ul1.children[2], 50);
    tcancel(); // the browser steals the placement tap for scrolling
    expect(h1.getAttribute("aria-pressed")).toBe("true"); // hold survives
    // The single-grab lock must survive too: grabbing in ANOTHER list aborts
    // this hold instead of co-holding two items at once.
    const h2 = ul2.children[0].querySelector(".drag-handle");
    activate(h2);
    expect(h2.getAttribute("aria-pressed")).toBe("true");
    expect(h1.getAttribute("aria-pressed")).toBe("false");
  });
});

// ---------------------------------------------------------------------------
// dragOnItem — edge-case regression guards.
// ---------------------------------------------------------------------------
describe("sorta11y — dragOnItem review regressions", () => {
  it("no-handle list keeps native dragstart suppression across refresh (unguarded-remove regression)", () => {
    const ul = makeList(); // no handle: grab IS the item
    const inst = track(Sorta11y.create(ul, { animation: 0 }));
    inst.refresh();
    const ev = new Event("dragstart", { bubbles: true, cancelable: true });
    ul.children[0].dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("dragOnItem works with a promoted non-<button> handle too", () => {
    const ul = makeList({ handle: true, handleTag: "span" });
    const inst = track(
      Sorta11y.create(ul, {
        handle: ".drag-handle",
        dragOnItem: true,
        animation: 0,
      }),
    );
    fakeLayout(ul);
    pdown(ul.children[0], 10); // press on the item body
    pmove(16);
    pmove(32);
    pup();
    expect(inst.toArray()).toEqual(["b", "a", "c", "d"]);
  });

  it("presses on a nested <label> or custom ARIA widget never grab or drag", () => {
    const ul = makeList({ handle: true });
    const inst = track(
      Sorta11y.create(ul, {
        handle: ".drag-handle",
        dragOnItem: true,
        animation: 0,
      }),
    );
    fakeLayout(ul);
    const a = ul.children[0];
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    label.appendChild(box);
    a.appendChild(label);
    const sw = document.createElement("span");
    sw.setAttribute("role", "switch");
    a.appendChild(sw);
    pdown(label, 10);
    pup(); // tap on the label — toggles the checkbox, must not grab
    expect(a.querySelector(".drag-handle").getAttribute("aria-pressed")).toBe(
      "false",
    );
    pdown(sw, 10);
    pmove(16);
    pmove(32);
    pup(); // drag attempt from the custom switch — must not reorder
    expect(inst.toArray()).toEqual(["a", "b", "c", "d"]);
  });

  it("a press inside a NESTED sorta11y list never grabs the outer item", () => {
    const outer = makeList({ handle: true });
    const inner = document.createElement("ul");
    ["x", "y"].forEach((id) => {
      const li = document.createElement("li");
      li.setAttribute("data-id", id);
      li.textContent = id;
      inner.appendChild(li);
    });
    outer.children[0].appendChild(inner);
    track(
      Sorta11y.create(outer, {
        handle: ".drag-handle",
        dragOnItem: true,
        animation: 0,
      }),
    );
    track(Sorta11y.create(inner, { animation: 0 }));
    fakeLayout(outer);
    pdown(inner.children[0], 10);
    pup(); // tap inside the inner list
    // The tap belongs to the inner list (its own pickup)…
    expect(inner.children[0].classList.contains("s11y-item--grabbed")).toBe(
      true,
    );
    // …and must NOT have grabbed the outer item.
    expect(
      outer.children[0]
        .querySelector(".drag-handle")
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });
});

// ---------------------------------------------------------------------------
// Assistive-technology activation clicks. Measured sequences (AT-SPI "press",
// the same engine path NVDA/JAWS drive on Windows):
//   Gecko:    mousedown(1) → mouseup(1) → click(detail 1)  — no pointer events
//   Chromium: pointerdown(0) → pointerup(0) → click(detail 1)
// The browser's own keyboard activation (focus mode) stays click(detail 0),
// so `detail` alone cannot identify an activation click.
// ---------------------------------------------------------------------------
describe("sorta11y — assistive-technology activation clicks", () => {
  const handleOf = (ul, i = 0) => ul.children[i].querySelector(".drag-handle");

  it("a bare click(detail 1) with no pointer history (Gecko AT press) toggles the grab", () => {
    const ul = makeList({ handle: true });
    track(Sorta11y.create(ul, { handle: ".drag-handle", labels: LABELS }));
    const handle = handleOf(ul);
    activate(handle, 1); // AT press: only a click, detail 1
    expect(ul.children[0].classList.contains("s11y-item--grabbed")).toBe(true);
    expect(handle.getAttribute("aria-pressed")).toBe("true");
    activate(handle, 1); // second press drops
    expect(ul.children[0].classList.contains("s11y-item--grabbed")).toBe(false);
    expect(handle.getAttribute("aria-pressed")).toBe("false");
  });

  it("an AT press toggles even with clickToGrab:false (activation, not a pointer tap)", () => {
    const ul = makeList({ handle: true });
    track(Sorta11y.create(ul, { handle: ".drag-handle", clickToGrab: false }));
    const handle = handleOf(ul);
    activate(handle, 1);
    expect(ul.children[0].classList.contains("s11y-item--grabbed")).toBe(true);
  });

  it("Chromium AT press (synthetic pointer tap + click detail 1) toggles exactly once", () => {
    const ul = makeList({ handle: true });
    track(Sorta11y.create(ul, { handle: ".drag-handle" }));
    const handle = handleOf(ul);
    pdown(handle, 10);
    pup();
    expect(ul.children[0].classList.contains("s11y-item--grabbed")).toBe(true); // tap toggled
    activate(handle, 1); // the trailing click must not re-toggle
    expect(ul.children[0].classList.contains("s11y-item--grabbed")).toBe(true);
  });

  it("a mouse press held past the guard window does not double-toggle via its click", () => {
    const ul = makeList({ handle: true });
    track(Sorta11y.create(ul, { handle: ".drag-handle" }));
    const handle = handleOf(ul);
    const t0 = performance.now();
    const down = new MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    Object.defineProperty(down, "timeStamp", { value: t0 });
    handle.dispatchEvent(down);
    const up = new MouseEvent("pointerup", { bubbles: true, cancelable: true });
    Object.defineProperty(up, "timeStamp", { value: t0 + 1200 }); // long hold
    document.body.dispatchEvent(up);
    expect(ul.children[0].classList.contains("s11y-item--grabbed")).toBe(true); // tap on release
    const click = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      detail: 1,
    });
    Object.defineProperty(click, "timeStamp", { value: t0 + 1210 });
    handle.dispatchEvent(click); // pointer-born → ignored
    expect(ul.children[0].classList.contains("s11y-item--grabbed")).toBe(true);
  });

  it("clickToGrab:false — a mouse tap and its synthesised click stay a no-op", () => {
    const ul = makeList({ handle: true });
    track(Sorta11y.create(ul, { handle: ".drag-handle", clickToGrab: false }));
    const handle = handleOf(ul);
    pdown(handle, 10);
    pup();
    expect(ul.children[0].classList.contains("s11y-item--grabbed")).toBe(false); // tap gated
    activate(handle, 1); // pointer-born click must not sneak a grab in
    expect(ul.children[0].classList.contains("s11y-item--grabbed")).toBe(false);
  });
});
