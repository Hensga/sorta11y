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

// A tap is a pointer interaction: the grab model it toggles must report
// source "pointer" (the README documents 'keyboard' | 'pointer'). Drops name
// the input that committed them; a cancel is not an input of its own (Escape,
// a click elsewhere, focus loss, …), so it reports how the item was picked up.
describe("sorta11y — tap-to-reorder reports source: 'pointer'", () => {
  const setup = () => {
    const ul = makeList();
    const cb = { onStart: vi.fn(), onChange: vi.fn(), onEnd: vi.fn() };
    const inst = track(Sorta11y.create(ul, { animation: 0, ...cb }));
    fakeLayout(ul);
    const tap = (i) => {
      pdown(ul.children[i], i * 20 + 10);
      pup();
    };
    const src = (fn) => fn.mock.calls.map((c) => c[0].source);
    return { ul, inst, tap, src, ...cb };
  };

  it("tap pickup + tap on the same item: onStart/onEnd report 'pointer'", () => {
    const { tap, src, onStart, onEnd } = setup();
    tap(0);
    tap(0);
    expect(src(onStart)).toEqual(["pointer"]);
    expect(src(onEnd)).toEqual(["pointer"]);
  });

  it("tap pickup + tap placement: onChange/onEnd report 'pointer'", () => {
    const { inst, tap, src, onChange, onEnd } = setup();
    tap(0);
    tap(2); // move a into c's slot, then drop
    expect(inst.toArray()).toEqual(["b", "c", "a", "d"]);
    expect(src(onChange)).toEqual(["pointer"]);
    expect(src(onEnd)).toEqual(["pointer"]);
  });

  it("a tap pickup dropped with Space reports the keyboard drop", () => {
    const { ul, tap, src, onStart, onChange } = setup();
    tap(0);
    press(ul, "ArrowDown");
    press(ul, SPACE);
    expect(src(onStart)).toEqual(["pointer"]);
    expect(src(onChange)).toEqual(["keyboard"]);
  });

  it("a keyboard pickup placed by a tap reports the pointer drop", () => {
    const { ul, tap, src, onStart, onChange } = setup();
    ul.children[0].focus();
    press(ul.children[0], SPACE);
    tap(2);
    expect(src(onStart)).toEqual(["keyboard"]);
    expect(src(onChange)).toEqual(["pointer"]);
  });

  it("cancelling a tap pickup reports how it was picked up", () => {
    const { ul, tap, src, onEnd } = setup();
    tap(0);
    press(ul, "Escape");
    expect(src(onEnd)).toEqual(["pointer"]);
    ul.children[0].focus();
    press(ul.children[0], SPACE);
    press(ul, "Escape");
    expect(src(onEnd)).toEqual(["pointer", "keyboard"]);
  });

  it("a tap pickup whose item vanishes (refresh) reports 'pointer'", () => {
    const { ul, inst, tap, src, onEnd } = setup();
    tap(1);
    ul.children[1].remove();
    inst.refresh();
    expect(src(onEnd)).toEqual(["pointer"]);
  });
});

// The keyboard grab auto-cancels on competing interactions; a pointer drag
// relied on pointerup/pointercancel/lostpointercapture alone. The window
// losing focus mid-drag (an alert(), an app switch) or the tab going hidden
// can swallow the release — the drag must not stay stuck.
describe("sorta11y — pointer drag safety net (window blur / hidden tab)", () => {
  const startDrag = (options = {}) => {
    const ul = makeList();
    const onEnd = vi.fn();
    const inst = track(
      Sorta11y.create(ul, { animation: 0, labels: LABELS, onEnd, ...options }),
    );
    fakeLayout(ul);
    const a = ul.children[0];
    pdown(a, 10);
    pmove(16);
    pmove(32); // [b, a, c, d]
    return { ul, inst, a, onEnd };
  };

  it("a window blur mid-drag cancels it: order reverted, drag cleared, announced", () => {
    const { ul, inst, a, onEnd } = startDrag();
    expect(inst.toArray()).toEqual(["b", "a", "c", "d"]);
    window.dispatchEvent(new Event("blur"));
    expect(inst.toArray()).toEqual(["a", "b", "c", "d"]);
    expect(inst._ptr).toBeNull();
    expect(a.classList.contains("s11y-item--dragging")).toBe(false);
    expect(liveRegionOf(ul).textContent).toBe("CANCEL 1/4");
    expect(onEnd).toHaveBeenCalledOnce();
    expect(onEnd.mock.calls[0][0].source).toBe("pointer");
    // A later pointerup is inert, and a fresh drag works again.
    pup();
    expect(inst.toArray()).toEqual(["a", "b", "c", "d"]);
    pdown(a, 10);
    pmove(16);
    pmove(32);
    pup();
    expect(inst.toArray()).toEqual(["b", "a", "c", "d"]);
  });

  it("the tab going hidden mid-drag cancels it too", () => {
    const { inst } = startDrag();
    document.dispatchEvent(new Event("visibilitychange"));
    expect(inst.toArray()).toEqual(["a", "b", "c", "d"]);
    expect(inst._ptr).toBeNull();
  });

  it("a press that never became a drag is torn down, not left to tap on release", () => {
    const ul = makeList();
    const inst = track(Sorta11y.create(ul, { animation: 0 }));
    fakeLayout(ul);
    const a = ul.children[0];
    pdown(a, 10);
    window.dispatchEvent(new Event("blur"));
    expect(inst._ptr).toBeNull();
    pup();
    expect(a.classList.contains("s11y-item--grabbed")).toBe(false);
  });

  it("the listeners go with the drag: after a drop, or destroy(), a blur is ignored", () => {
    const { inst } = startDrag();
    pup(); // committed
    const cancel = vi.spyOn(inst, "_cancelPointer");
    window.dispatchEvent(new Event("blur"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(cancel).not.toHaveBeenCalled();

    const { inst: other } = startDrag();
    other.destroy();
    const cancel2 = vi.spyOn(other, "_cancelPointer");
    window.dispatchEvent(new Event("blur"));
    expect(cancel2).not.toHaveBeenCalled();
  });
});

// A cancelled drag re-anchors the lifted item (a transform at the spot the
// finger left it) and then settles it with a transition. Written in the same
// tick without a style flush, the browser only ever sees the final state and
// the item SNAPS 1-2 rows instead of gliding (measured in Chrome). jsdom
// cannot render, so assert the sequencing: a layout read (the flush) while
// the re-anchor transform is applied, right before the settle.
describe("sorta11y — a cancelled drag glides back", () => {
  it("flushes the re-anchor transform before the settle transition", () => {
    const ul = makeList();
    const inst = track(Sorta11y.create(ul, { animation: 150 }));
    fakeLayout(ul);
    const a = ul.children[0];
    const log = [];
    const layout = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      if (this === a) log.push(["read", a.style.transform, a.style.transition]);
      return layout.call(this);
    };
    const settle = inst._settle;
    inst._settle = function (item) {
      log.push(["settle", item.style.transform, item.style.transition]);
      return settle.call(this, item);
    };
    pdown(a, 10);
    pmove(16);
    pmove(32); // [b, a, c, d], lifted by translateY(8px)
    log.length = 0;
    document.body.dispatchEvent(
      new MouseEvent("pointercancel", { bubbles: true }),
    );
    const at = log.findIndex((entry) => entry[0] === "settle");
    // Re-anchored at the release spot (20px visual − (−8px) natural) …
    expect(log[at]).toEqual(["settle", "translateY(28px)", "none"]);
    // … and that state was committed by a read before the transition starts.
    expect(log[at - 1]).toEqual(["read", "translateY(28px)", "none"]);
    expect(a.style.transition).toMatch(/transform 150ms/);
    expect(a.style.transform).toBe("");
  });
});

// Tap-to-place (WCAG 2.5.7) must survive the scrolling it takes to reach a
// far target: a mouse wheel, and on mobile the URL bar collapsing under a
// touch scroll (which fires window `resize`). Those cancel a KEYBOARD grab
// only. Presses outside the widget, focus leaving it and a hidden tab still
// cancel either kind.
describe("sorta11y — auto-cancel by how the item was picked up", () => {
  const setup = () => {
    const ul = makeList();
    const inst = track(Sorta11y.create(ul, { animation: 0 }));
    fakeLayout(ul);
    const a = ul.children[0];
    const held = () => a.classList.contains("s11y-item--grabbed");
    const tapPickup = () => {
      pdown(a, 10);
      pup();
    };
    const keyPickup = () => {
      a.focus();
      press(a, SPACE);
    };
    return { ul, inst, a, held, tapPickup, keyPickup };
  };

  it("a tap pickup survives wheel and resize, and still places afterwards", () => {
    const { ul, inst, held, tapPickup } = setup();
    tapPickup();
    window.dispatchEvent(new Event("wheel"));
    window.dispatchEvent(new Event("resize")); // the mobile URL bar collapsing
    expect(held()).toBe(true);
    pdown(ul.children[2], 50);
    pup(); // the placement tap at the far target
    expect(held()).toBe(false);
    expect(inst.toArray()).toEqual(["b", "c", "a", "d"]);
  });

  it("a keyboard pickup is still cancelled by wheel and by resize", () => {
    const { held, keyPickup } = setup();
    keyPickup();
    window.dispatchEvent(new Event("wheel"));
    expect(held()).toBe(false);
    keyPickup();
    window.dispatchEvent(new Event("resize"));
    expect(held()).toBe(false);
  });

  it("an outside press, focus loss or a hidden tab cancels either kind", async () => {
    const { held, tapPickup, keyPickup } = setup();
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    // A complete press (a tap hold judges it by its release — see below).
    const outsidePress = () => {
      outside.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      outside.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    };
    for (const pickup of [tapPickup, keyPickup]) {
      pickup();
      outsidePress();
      expect(held()).toBe(false);
      pickup();
      document.dispatchEvent(new Event("visibilitychange"));
      expect(held()).toBe(false);
      pickup();
      outside.focus();
      await Promise.resolve();
      expect(held()).toBe(false);
    }
  });
});

// refresh() while a pointer press/drag is live: the app removed (or
// re-rendered) items under it. The gesture must end cleanly, and a later
// cancel must never resurrect a row the app removed.
describe("sorta11y — refresh() under a live pointer drag", () => {
  const setup = (options = {}) => {
    const ul = makeList();
    Array.from(ul.children).forEach((li) => li.classList.add("srt"));
    const onEnd = vi.fn();
    const inst = track(
      Sorta11y.create(ul, {
        animation: 0,
        itemSelector: "li.srt",
        onEnd,
        ...options,
      }),
    );
    fakeLayout(ul);
    return { ul, inst, onEnd };
  };

  it("the dragged item removed: drag torn down, onEnd -1, later events inert, new drag works", () => {
    const { ul, inst, onEnd } = setup();
    const a = ul.children[0];
    pdown(a, 10);
    pmove(16);
    pmove(32); // [b, a, c, d]
    a.remove();
    expect(() => inst.refresh()).not.toThrow();
    expect(inst._ptr).toBeNull();
    expect(ul.style.userSelect).toBe("");
    expect(a.classList.contains("s11y-item--dragging")).toBe(false);
    expect(onEnd).toHaveBeenCalledOnce();
    expect(onEnd.mock.calls[0][0]).toMatchObject({
      item: a,
      oldIndex: 0,
      newIndex: -1,
      source: "pointer",
    });
    expect(() => {
      pmove(60);
      pup();
    }).not.toThrow();
    expect(inst.toArray()).toEqual(["b", "c", "d"]);
    expect(onEnd).toHaveBeenCalledOnce();
    pdown(ul.children[0], 10); // a fresh drag on what is left
    pmove(16);
    pmove(32);
    pup();
    expect(inst.toArray()).toEqual(["c", "b", "d"]);
  });

  it("releases the pointer capture of a row that left the set but not the DOM", () => {
    const { ul, inst } = setup();
    const a = ul.children[0];
    a.setPointerCapture = vi.fn();
    a.releasePointerCapture = vi.fn();
    pdown(a, 10, { pointerId: 7 });
    pmove(16);
    a.classList.remove("srt"); // still in the DOM, no longer an item
    inst.refresh();
    expect(a.releasePointerCapture).toHaveBeenCalled();
    expect(inst._ptr).toBeNull();
  });

  it("a press (no drag yet) on a vanished item is dropped silently: no onEnd, no tap later", () => {
    const { ul, inst, onEnd } = setup();
    const errors = [];
    const onError = (e) => {
      errors.push(e.error);
      e.preventDefault();
    };
    window.addEventListener("error", onError);
    const a = ul.children[0];
    pdown(a, 10);
    a.remove();
    inst.refresh();
    pup(); // used to tap-grab the departed row and throw on its lost handle
    window.removeEventListener("error", onError);
    expect(errors).toEqual([]);
    expect(inst._ptr).toBeNull();
    expect(onEnd).not.toHaveBeenCalled();
    expect(
      Array.from(ul.children).some((li) =>
        li.classList.contains("s11y-item--grabbed"),
      ),
    ).toBe(false);
  });

  it("another item removed mid-drag is not resurrected by the cancel", () => {
    const { ul, inst } = setup();
    const [a, b] = ul.children;
    pdown(a, 10);
    pmove(16);
    pmove(52); // a past c: [b, c, a, d]
    b.remove();
    inst.refresh();
    document.body.dispatchEvent(
      new MouseEvent("pointercancel", { bubbles: true }),
    );
    expect(b.isConnected).toBe(false);
    expect(inst.toArray()).toEqual(["a", "c", "d"]);
  });
});

// The pointer-click guard ignores a click within 700 ms of a press on the same
// item (it is that press's own click). A genuine KEYBOARD activation in that
// window — Space/Enter on the button right after tapping it — must get
// through: it is the detail-0 click following a Space/Enter keydown on that
// very button, with no pointer press in between.
describe("sorta11y — keyboard activation right after a tap", () => {
  const setup = () => {
    const ul = makeList({ handle: true });
    const inst = track(
      Sorta11y.create(ul, { handle: ".drag-handle", animation: 0 }),
    );
    fakeLayout(ul);
    const handle = ul.children[0].querySelector(".drag-handle");
    const held = () => handle.getAttribute("aria-pressed") === "true";
    const tap = () => {
      pdown(handle, 10);
      pup();
    };
    return { ul, inst, handle, held, tap };
  };

  it("tap to pick up, tap to drop, then Space on the handle picks up again", () => {
    const { handle, held, tap } = setup();
    tap();
    tap();
    expect(held()).toBe(false);
    expect(document.activeElement).toBe(handle);
    press(handle, SPACE); // within the 700 ms window of the last tap
    expect(held()).toBe(true);
  });

  it("tap pickup, a keyboard move, then Space/Enter on the handle drops", () => {
    const { inst, handle, held, tap } = setup();
    tap();
    press(handle, "ArrowDown"); // focus lands on the handle again
    press(handle, SPACE);
    expect(held()).toBe(false);
    expect(inst.toArray()).toEqual(["b", "a", "c", "d"]);
    tap(); // pick up again (a is now 2nd — tap its handle directly)
    press(handle, "ArrowUp");
    press(handle, "Enter");
    expect(held()).toBe(false);
  });

  it("a pointer press after the keydown puts the guard back in charge", () => {
    const { handle, held, tap } = setup();
    handle.focus();
    handle.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: SPACE,
        bubbles: true,
        cancelable: true,
      }),
    ); // a keydown whose click never came
    tap(); // pick up
    expect(held()).toBe(true);
    activate(handle); // the tap's own (ghost) click: still ignored
    expect(held()).toBe(true);
  });
});

// A dragged row that vanishes takes a focus it held with it: hand that focus
// to the row now in its slot, as a vanished keyboard grab does — but only if
// the row really held it (a click that focused nothing must not pull focus
// into the list).
describe("sorta11y — focus when a pointer-dragged row vanishes", () => {
  const setup = () => {
    const ul = makeList({ handle: true });
    const inst = track(
      Sorta11y.create(ul, { handle: ".drag-handle", animation: 0 }),
    );
    fakeLayout(ul);
    const handleOf = (i) => ul.children[i].querySelector(".drag-handle");
    return { ul, inst, handleOf };
  };

  it("a focused handle's row removed mid-drag: focus moves to the next row's handle", () => {
    const { ul, inst, handleOf } = setup();
    const a = handleOf(0);
    pdown(a, 10);
    a.focus(); // the mousedown that follows the pointerdown focuses the button
    pmove(16); // drag starts
    ul.children[0].remove();
    inst.refresh();
    expect(document.activeElement).toBe(handleOf(0)); // b's handle, same slot
  });

  it("a focused handle's pending press (no drag yet): focus still moves on", () => {
    const { ul, inst, handleOf } = setup();
    const d = handleOf(3);
    d.focus(); // tabbed there, then pressed it
    pdown(d, 70);
    ul.children[3].remove();
    inst.refresh();
    expect(document.activeElement).toBe(handleOf(2)); // the new last row
  });

  it("a row that never held focus: focus is left alone", () => {
    const { ul, inst, handleOf } = setup();
    pdown(handleOf(0), 10); // e.g. Safari: a click focuses nothing
    pmove(16);
    ul.children[0].remove();
    inst.refresh();
    expect(document.activeElement).toBe(document.body);
  });
});

// An outside press during a TAP hold is judged by how it ends: released in
// place (a tap/click elsewhere) = letting go of the hold → cancel; taken over
// by the browser for scrolling (pointercancel), moved beyond the tap slop, or
// on a scrollbar = scrolling to a far target → the hold stays. A keyboard
// grab still cancels on the outside press itself.
describe("sorta11y — outside presses during a tap hold", () => {
  const setup = () => {
    const ul = makeList();
    const onEnd = vi.fn();
    const inst = track(Sorta11y.create(ul, { animation: 0, onEnd }));
    fakeLayout(ul);
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    const a = ul.children[0];
    const held = () => a.classList.contains("s11y-item--grabbed");
    const tapHold = () => {
      pdown(a, 10);
      pup();
    };
    // An outside touch pointer with its own id (pointerType + pointerId
    // stamped as the real events carry them).
    const touch = (type, id, props = {}) => {
      const ev = ptrEvt(type, "touch", props);
      Object.defineProperty(ev, "pointerId", { value: id });
      outside.dispatchEvent(ev);
    };
    return { ul, inst, onEnd, outside, a, held, tapHold, touch };
  };

  it("a touch scroll starting outside keeps the hold; a placement tap then works", () => {
    const { ul, inst, held, tapHold, touch } = setup();
    tapHold();
    touch("pointerdown", 5, { clientY: 300 });
    outsideCompat(ul);
    touch("pointercancel", 5); // the browser takes the gesture for scrolling
    expect(held()).toBe(true);
    pdown(ul.children[3], 70);
    pup(); // the placement tap at the far target
    expect(held()).toBe(false);
    expect(inst.toArray()).toEqual(["b", "c", "d", "a"]);
  });

  it("an outside tap releases the hold: order reverted, onEnd source pointer", () => {
    const { inst, onEnd, a, held, tapHold, touch } = setup();
    tapHold();
    press(a, "ArrowDown"); // [b, a, c, d]
    touch("pointerdown", 5, { clientY: 300 });
    expect(held()).toBe(true); // not yet — it might still become a scroll
    touch("pointerup", 5, { clientY: 302 });
    expect(held()).toBe(false);
    expect(inst.toArray()).toEqual(["a", "b", "c", "d"]);
    expect(onEnd).toHaveBeenCalledOnce();
    expect(onEnd.mock.calls[0][0].source).toBe("pointer");
  });

  it("an outside tap releases without a scrolling focus steal-back", () => {
    // On touch the release is judged at pointerup, BEFORE the tap's
    // compatibility mousedown/click: a scrolling grab.focus() here would move
    // the page back to the list under the finger, so the click could miss.
    const { a, held, tapHold, touch } = setup();
    tapHold();
    const focusSpy = vi.spyOn(a, "focus");
    touch("pointerdown", 5, { clientY: 300 });
    touch("pointerup", 5, { clientY: 300 });
    expect(held()).toBe(false);
    expect(focusSpy).toHaveBeenCalled();
    for (const [opts] of focusSpy.mock.calls) {
      expect(opts).toEqual({ preventScroll: true });
    }
    expect(document.activeElement).toBe(a); // not left on the list / <body>
  });

  it("an outside tap keeps focus that onEnd moved elsewhere", () => {
    const ul = makeList();
    const elsewhere = document.createElement("button");
    document.body.appendChild(elsewhere);
    track(
      Sorta11y.create(ul, { animation: 0, onEnd: () => elsewhere.focus() }),
    );
    fakeLayout(ul);
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    pdown(ul.children[0], 10);
    pup(); // tap hold
    for (const type of ["pointerdown", "pointerup"]) {
      const ev = ptrEvt(type, "touch", { clientY: 300 });
      Object.defineProperty(ev, "pointerId", { value: 5 });
      outside.dispatchEvent(ev);
    }
    expect(document.activeElement).toBe(elsewhere);
  });

  it("an outside press that moves past the tap slop is a scroll, not a tap", () => {
    const { held, tapHold, touch } = setup();
    tapHold();
    touch("pointerdown", 5, { clientY: 300 });
    touch("pointermove", 5, { clientY: 340 });
    touch("pointerup", 5, { clientY: 340 });
    expect(held()).toBe(true);
  });

  it("a press on the page scrollbar is a scroll, not a tap", () => {
    const { held, tapHold } = setup();
    tapHold();
    const root = document.documentElement;
    Object.defineProperty(root, "clientWidth", {
      configurable: true,
      value: 1000,
    });
    try {
      const at = { bubbles: true, button: 0, clientX: 1005, clientY: 50 };
      root.dispatchEvent(new MouseEvent("pointerdown", at));
      root.dispatchEvent(new MouseEvent("pointerup", at));
      expect(held()).toBe(true);
    } finally {
      delete root.clientWidth;
    }
  });

  // A scroll container's scrollbar is the band between its client box and
  // its border — its border itself is ordinary page, where a tap releases.
  it("a scroll container: its scrollbar keeps the hold, its border does not", () => {
    const { held, tapHold, outside } = setup();
    outside.style.border = "2px solid";
    const size = (prop, value) =>
      Object.defineProperty(outside, prop, { configurable: true, value });
    size("clientWidth", 200); // content + padding, scrollbar excluded
    size("offsetWidth", 219); // 2 + 200 + 15 (scrollbar) + 2
    size("clientHeight", 100);
    size("offsetHeight", 104); // no horizontal scrollbar
    const pressAt = (offsetX, offsetY = 50) => {
      ["pointerdown", "pointerup"].forEach((type) => {
        const ev = new MouseEvent(type, { bubbles: true, button: 0 });
        Object.defineProperty(ev, "offsetX", { value: offsetX });
        Object.defineProperty(ev, "offsetY", { value: offsetY });
        outside.dispatchEvent(ev);
      });
    };
    tapHold();
    pressAt(205); // inside the 15px scrollbar band
    expect(held()).toBe(true);
    pressAt(50, 101); // the bottom border (no scrollbar there)
    expect(held()).toBe(false);
    tapHold();
    pressAt(216); // the right border, beyond the scrollbar
    expect(held()).toBe(false);
  });

  it("two outside pointers: each is judged on its own", () => {
    const { held, tapHold, touch } = setup();
    tapHold();
    touch("pointerdown", 5, { clientY: 300 });
    touch("pointerdown", 6, { clientY: 400 });
    touch("pointercancel", 5); // one finger scrolls…
    expect(held()).toBe(true);
    touch("pointerup", 6, { clientY: 400 }); // …the other one taps
    expect(held()).toBe(false);
  });

  it("the gesture's mousedown/touchstart echoes do not cancel early", () => {
    const { ul, held, tapHold, touch } = setup();
    tapHold();
    touch("pointerdown", 5, { clientY: 300 });
    outsideCompat(ul);
    expect(held()).toBe(true);
    touch("pointercancel", 5);
    expect(held()).toBe(true);
  });

  it("a keyboard grab still cancels on the outside press itself", () => {
    const { a, outside } = setup();
    a.focus();
    press(a, SPACE);
    outside.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    expect(a.classList.contains("s11y-item--grabbed")).toBe(false);
  });

  it("the outside-press listeners go with the hold: drop, cancel, destroy", () => {
    const { inst, ul, tapHold, touch } = setup();
    const cancel = vi.spyOn(inst, "_cancel");
    const tapOutside = (id) => {
      touch("pointerdown", id, { clientY: 300 });
      touch("pointerup", id, { clientY: 300 });
    };
    tapHold();
    pdown(ul.children[0], 10);
    pup(); // dropped by a tap on itself
    tapOutside(1);
    tapHold();
    press(ul, "Escape"); // cancelled
    cancel.mockClear();
    touch("pointerdown", 2, { clientY: 300 }); // a press left pending…
    tapOutside(3);
    expect(cancel).not.toHaveBeenCalled();
    tapHold();
    touch("pointerdown", 4, { clientY: 300 });
    inst.destroy(); // …and one pending at destroy
    cancel.mockClear();
    touch("pointerup", 4, { clientY: 300 });
    tapOutside(5);
    expect(cancel).not.toHaveBeenCalled();
  });
});

// The compatibility events a touch/mouse press also fires, outside the list.
function outsideCompat(ul) {
  const where = ul.parentElement.parentElement; // outside the s11y-app wrapper
  where.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  where.dispatchEvent(new Event("touchstart", { bubbles: true }));
}
