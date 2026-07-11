import { describe, it, expect, afterEach, vi } from "vitest";
import Sorta11y from "../src/sorta11y.js";
import {
  makeList,
  press,
  activate,
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

describe("sorta11y — keyboard grab / move / drop / cancel", () => {
  it("grabbedClass: a keyboard grab adds the consumer class alongside the built-in, and drop removes it", () => {
    const ul = makeList();
    create(ul, { grabbedClass: "is-grabbed" });
    const item = ul.children[0];
    item.focus();
    press(item, SPACE); // grab
    expect(item.classList.contains("s11y-item--grabbed")).toBe(true); // built-in stays
    expect(item.classList.contains("is-grabbed")).toBe(true); // consumer hook added
    press(item, SPACE); // drop
    expect(item.classList.contains("is-grabbed")).toBe(false);
    expect(item.classList.contains("s11y-item--grabbed")).toBe(false);
  });

  it("Space grabs the focused item: aria-pressed, class, announcement, onStart", () => {
    const ul = makeList();
    const onStart = vi.fn();
    create(ul, { onStart });
    const item = ul.children[0];
    item.focus();
    const ev = press(item, SPACE);
    expect(ev.defaultPrevented).toBe(true);
    expect(item.classList.contains("s11y-item--grabbed")).toBe(true);
    expect(item.classList.contains("s11y-item--grabbed")).toBe(true);
    expect(liveRegionOf(ul).textContent).toBe("GRAB A 1/4");
    expect(onStart).toHaveBeenCalledOnce();
  });

  it("a modifier (Shift+Space) aborts the pickup", () => {
    const ul = makeList();
    create(ul);
    const item = ul.children[0];
    item.focus();
    press(item, SPACE, { shiftKey: true });
    expect(item.classList.contains("s11y-item--grabbed")).toBe(false);
  });

  it("ArrowDown while grabbed moves the item, announces, keeps focus", () => {
    const ul = makeList();
    create(ul);
    const item = ul.children[0];
    item.focus();
    press(item, SPACE);
    const ev = press(item, "ArrowDown");
    expect(ev.defaultPrevented).toBe(true);
    expect(domOrder(ul)).toEqual(["b", "a", "c", "d"]);
    expect(liveRegionOf(ul).textContent).toBe("MOVE 2/4");
    expect(document.activeElement).toBe(item);
  });

  it("ArrowUp at the top boundary does not move but still gives feedback", () => {
    const ul = makeList();
    create(ul);
    const item = ul.children[0];
    item.focus();
    press(item, SPACE);
    press(item, "ArrowUp");
    press(item, "ArrowUp"); // identical announcement → exercises de-duplication
    expect(domOrder(ul)).toEqual(["a", "b", "c", "d"]);
    expect(liveRegionOf(ul).textContent).toBe("MOVE 1/4");
  });

  it("End moves to the last position, Home back to the first", () => {
    const ul = makeList();
    create(ul);
    const item = ul.children[0];
    item.focus();
    press(item, SPACE);
    press(item, "End");
    expect(domOrder(ul)).toEqual(["b", "c", "d", "a"]);
    press(item, "Home");
    expect(domOrder(ul)).toEqual(["a", "b", "c", "d"]);
  });

  it("Space drops: commits, fires onChange + onEnd with indices and order", () => {
    const ul = makeList();
    const onChange = vi.fn();
    const onEnd = vi.fn();
    create(ul, { onChange, onEnd });
    const item = ul.children[0];
    item.focus();
    press(item, SPACE);
    press(item, "ArrowDown");
    press(item, SPACE); // drop
    expect(item.classList.contains("s11y-item--grabbed")).toBe(false);
    expect(liveRegionOf(ul).textContent).toBe("DROP 2/4");
    expect(onChange).toHaveBeenCalledOnce();
    const evt = onChange.mock.calls[0][0];
    expect(evt).toMatchObject({ oldIndex: 0, newIndex: 1, source: "keyboard" });
    expect(evt.order).toEqual(["b", "a", "c", "d"]);
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it("Escape cancels: restores the original order, fires onEnd but not onChange", () => {
    const ul = makeList();
    const onChange = vi.fn();
    const onEnd = vi.fn();
    create(ul, { onChange, onEnd });
    const item = ul.children[0];
    item.focus();
    press(item, SPACE);
    press(item, "ArrowDown");
    press(item, "ArrowDown");
    expect(domOrder(ul)).toEqual(["b", "c", "a", "d"]);
    press(item, "Escape");
    expect(domOrder(ul)).toEqual(["a", "b", "c", "d"]); // restored
    expect(item.classList.contains("s11y-item--grabbed")).toBe(false);
    expect(liveRegionOf(ul).textContent).toBe("CANCEL 1/4");
    expect(onEnd).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("idle arrows do not move focus or reorder (Tab navigates between items)", () => {
    const ul = makeList();
    create(ul);
    const first = ul.children[0];
    first.focus();
    const ev = press(first, "ArrowDown");
    expect(ev.defaultPrevented).toBe(false); // left to the browser when idle
    expect(domOrder(ul)).toEqual(["a", "b", "c", "d"]);
    expect(document.activeElement).toBe(first); // focus unchanged
    expect(
      Array.from(ul.children).map((li) => li.getAttribute("tabindex")),
    ).toEqual(["0", "0", "0", "0"]);
  });

  it("idle Escape is a no-op", () => {
    const ul = makeList();
    create(ul);
    const item = ul.children[0];
    item.focus();
    press(item, "Escape");
    expect(item.classList.contains("s11y-item--grabbed")).toBe(false);
  });

  it("Home while grabbed at the top is a no-op move with feedback", () => {
    const ul = makeList();
    create(ul);
    const item = ul.children[0];
    item.focus();
    press(item, SPACE);
    press(item, "Home");
    expect(domOrder(ul)).toEqual(["a", "b", "c", "d"]);
    expect(liveRegionOf(ul).textContent).toBe("MOVE 1/4");
  });

  it("Tab is blocked while grabbed (focus cannot escape)", () => {
    const ul = makeList();
    create(ul);
    const item = ul.children[0];
    item.focus();
    press(item, SPACE);
    const ev = press(item, "Tab");
    expect(ev.defaultPrevented).toBe(true);
    expect(item.classList.contains("s11y-item--grabbed")).toBe(true);
  });

  it("Enter is blocked in both modes (spec decision), never grabs or drops", () => {
    const ul = makeList();
    create(ul);
    const item = ul.children[0];
    item.focus();
    const idle = press(item, "Enter");
    expect(idle.defaultPrevented).toBe(true);
    expect(item.classList.contains("s11y-item--grabbed")).toBe(false); // did not grab
    press(item, SPACE); // grab with Space
    const held = press(item, "Enter");
    expect(held.defaultPrevented).toBe(true);
    expect(item.classList.contains("s11y-item--grabbed")).toBe(true); // did not drop
  });

  it("single-drag-lock: grabbing a second list cancels the first", () => {
    const ulA = makeList();
    const ulB = makeList();
    create(ulA);
    create(ulB);
    const a0 = ulA.children[0];
    const b0 = ulB.children[0];
    a0.focus();
    press(a0, SPACE);
    expect(a0.classList.contains("s11y-item--grabbed")).toBe(true);
    b0.focus();
    press(b0, SPACE);
    expect(b0.classList.contains("s11y-item--grabbed")).toBe(true);
    expect(a0.classList.contains("s11y-item--grabbed")).toBe(false); // first was auto-cancelled
  });

  it("auto-cancels on an interrupting window resize, restoring order", () => {
    const ul = makeList();
    create(ul);
    const item = ul.children[0];
    item.focus();
    press(item, SPACE);
    press(item, "ArrowDown");
    expect(domOrder(ul)).toEqual(["b", "a", "c", "d"]);
    window.dispatchEvent(new Event("resize"));
    expect(item.classList.contains("s11y-item--grabbed")).toBe(false);
    expect(domOrder(ul)).toEqual(["a", "b", "c", "d"]); // restored
  });

  it("a held modifier during a move cancels the grab", () => {
    const ul = makeList();
    create(ul);
    const item = ul.children[0];
    item.focus();
    press(item, SPACE);
    press(item, "ArrowDown", { ctrlKey: true });
    expect(item.classList.contains("s11y-item--grabbed")).toBe(false);
    expect(domOrder(ul)).toEqual(["a", "b", "c", "d"]);
  });

  it("handle mode: aria-pressed toggles on the handle through grab → drop", () => {
    const ul = makeList({ handle: true });
    create(ul, { handle: ".drag-handle" });
    const handle = ul.children[0].querySelector(".drag-handle");
    handle.focus();
    activate(handle); // grab — the button's activation, survives browse mode
    expect(handle.getAttribute("aria-pressed")).toBe("true");
    press(handle, "ArrowDown");
    activate(handle); // drop
    expect(handle.getAttribute("aria-pressed")).toBe("false");
  });

  // clickToGrab gates only the single-pointer TAP (mouse/touch). A <button>
  // handle's own keyboard activation (Space/Enter → detail-0 click) must STILL
  // toggle grab even with clickToGrab:false, or the handle would become
  // keyboard-inoperable in a screen reader's browse mode (a WCAG 2.1.1 failure).
  it("clickToGrab:false still lets the handle button's keyboard activation toggle grab", () => {
    const ul = makeList({ handle: true });
    create(ul, { handle: ".drag-handle", clickToGrab: false });
    const handle = ul.children[0].querySelector(".drag-handle");
    handle.focus();
    activate(handle); // grab via the button's own activation
    expect(handle.getAttribute("aria-pressed")).toBe("true");
    activate(handle); // drop
    expect(handle.getAttribute("aria-pressed")).toBe("false");
  });

  it("handle mode: aria-pressed clears on cancel", () => {
    const ul = makeList({ handle: true });
    create(ul, { handle: ".drag-handle" });
    const handle = ul.children[0].querySelector(".drag-handle");
    handle.focus();
    activate(handle); // grab
    press(handle, "Escape");
    expect(handle.getAttribute("aria-pressed")).toBe("false");
  });

  // Regression: a non-button handle is still promoted to role="button" but gets
  // no synthetic click on Space, so the keydown path must grab/drop it directly.
  // (Native buttons deliberately defer to their own click for browse-mode AT.)
  it("non-button handle (span, role=button) grabs and drops via Space keydown", () => {
    const ul = makeList({ handle: true, handleTag: "span" });
    create(ul, { handle: ".drag-handle" });
    const handle = ul.children[0].querySelector(".drag-handle");
    expect(handle.tagName).toBe("SPAN");
    expect(handle.getAttribute("role")).toBe("button"); // promoted → must work
    handle.focus();
    press(handle, SPACE); // grab
    expect(handle.getAttribute("aria-pressed")).toBe("true");
    expect(ul.children[0].classList.contains("s11y-item--grabbed")).toBe(true);
    press(handle, "ArrowDown");
    press(handle, SPACE); // drop
    expect(handle.getAttribute("aria-pressed")).toBe("false");
    expect(domOrder(ul)).toEqual(["b", "a", "c", "d"]);
  });

  it("non-button handle: Escape cancels a Space-initiated grab", () => {
    const ul = makeList({ handle: true, handleTag: "span" });
    create(ul, { handle: ".drag-handle" });
    const handle = ul.children[0].querySelector(".drag-handle");
    handle.focus();
    press(handle, SPACE);
    press(handle, "Escape");
    expect(handle.getAttribute("aria-pressed")).toBe("false");
    expect(domOrder(ul)).toEqual(["a", "b", "c", "d"]);
  });

  // A promoted (non-button) handle is announced as a button, so Enter must
  // grab/drop it just like Space. (Native buttons still defer to their click;
  // a plain no-handle <li> stays Enter-inert — see the "Enter is blocked" test.)
  it("promoted (span) handle: Enter grabs, then Enter drops", () => {
    const ul = makeList({ handle: true, handleTag: "span" });
    create(ul, { handle: ".drag-handle" });
    const handle = ul.children[0].querySelector(".drag-handle");
    handle.focus();
    const grabEv = press(handle, "Enter"); // grab
    expect(grabEv.defaultPrevented).toBe(true);
    expect(handle.getAttribute("aria-pressed")).toBe("true");
    expect(ul.children[0].classList.contains("s11y-item--grabbed")).toBe(true);
    press(handle, "ArrowDown");
    const dropEv = press(handle, "Enter"); // drop
    expect(dropEv.defaultPrevented).toBe(true);
    expect(handle.getAttribute("aria-pressed")).toBe("false");
    expect(domOrder(ul)).toEqual(["b", "a", "c", "d"]);
  });

  // In no-handle mode a keydown bubbling from a nested interactive control
  // resolves to the item; Space/Enter must stay with the control (2.1.1), not
  // grab the item or get preventDefaulted.
  it("no-handle item with a nested input: Space in the input does not grab", () => {
    const ul = makeList();
    const input = document.createElement("input");
    ul.children[0].appendChild(input);
    create(ul);
    input.focus();
    const ev = press(input, SPACE);
    expect(ev.defaultPrevented).toBe(false); // Space types into the input
    expect(ul.children[0].classList.contains("s11y-item--grabbed")).toBe(false);
  });

  it("no-handle item with a nested link: Enter on the link is not blocked", () => {
    const ul = makeList();
    const a = document.createElement("a");
    a.setAttribute("href", "#target");
    a.textContent = "link";
    ul.children[0].appendChild(a);
    create(ul);
    const ev = press(a, "Enter");
    expect(ev.defaultPrevented).toBe(false); // Enter activates the link
    expect(ul.children[0].classList.contains("s11y-item--grabbed")).toBe(false);
  });

  // Focus programmatically leaving the widget (dialog/toast/validation)
  // must cancel the grab, so role="application"/aria-pressed are not left stuck
  // and a later Space cannot drop a stale item. Moving focus BETWEEN items of
  // the same list must NOT cancel.
  it("cancels the grab when focus leaves the widget entirely", async () => {
    const ul = makeList();
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    create(ul);
    const item = ul.children[0];
    item.focus();
    press(item, SPACE); // grab
    expect(item.classList.contains("s11y-item--grabbed")).toBe(true);
    expect(ul.parentElement.getAttribute("role")).toBe("application");

    outside.focus(); // a dialog/toast steals focus out of the widget
    await Promise.resolve(); // allow the null-relatedTarget microtask re-check
    expect(item.classList.contains("s11y-item--grabbed")).toBe(false);
    expect(ul.parentElement.getAttribute("role")).toBeNull(); // not stranded
    expect(ul.children[0].getAttribute("aria-pressed")).toBeNull();
  });

  it("moving focus between items of the same list does not cancel the grab", async () => {
    const ul = makeList();
    create(ul);
    const item = ul.children[0];
    const sibling = ul.children[1];
    item.focus();
    press(item, SPACE); // grab
    sibling.focus(); // focus moves to another item of the SAME list
    await Promise.resolve();
    expect(item.classList.contains("s11y-item--grabbed")).toBe(true); // still held
    expect(ul.parentElement.getAttribute("role")).toBe("application");
  });
});
