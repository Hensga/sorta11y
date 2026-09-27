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

// Regressions for defects found (and verified) during adversarial review.
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
  document.body.replaceChildren();
});

describe("sorta11y — review-hardening regressions", () => {
  // Cancel must not depend on data-id to restore order.
  it("cancel restores order even when items have no data-id", () => {
    const ul = document.createElement("ul");
    const els = ["A", "B", "C"].map((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      ul.appendChild(li);
      return li;
    });
    document.body.appendChild(ul);
    track(
      Sorta11y.create(ul, {
        labels: { grabbed: () => "g", moved: () => "m", cancelled: () => "c" },
      }),
    );
    els[1].focus();
    press(els[1], SPACE); // grab B
    press(els[1], "ArrowUp"); // -> B, A, C
    expect(Array.from(ul.children)).toEqual([els[1], els[0], els[2]]);
    press(els[1], "Escape");
    expect(Array.from(ul.children)).toEqual([els[0], els[1], els[2]]); // restored exactly
  });

  // refresh() must not clobber the grabbed handle's aria-pressed (handle mode,
  // where aria-pressed lives — a no-handle <li> never carries it).
  it("refresh() during an active grab keeps the handle's aria-pressed", () => {
    const ul = makeList({ handle: true });
    const inst = track(Sorta11y.create(ul, { handle: ".drag-handle" }));
    const handle = ul.children[0].querySelector(".drag-handle");
    handle.focus();
    activate(handle); // grab via the button's activation (handle-mode pickup)
    inst.refresh();
    expect(handle.getAttribute("aria-pressed")).toBe("true");
  });

  // Every item stays a tab stop after a programmatic sort.
  it("sort() keeps every item a tab stop", () => {
    const ul = makeList();
    const inst = track(Sorta11y.create(ul));
    inst.sort(["d", "c", "b", "a"]);
    expect(
      Array.from(ul.children).map((li) => li.getAttribute("tabindex")),
    ).toEqual(["0", "0", "0", "0"]);
    expect(ul.children[0].getAttribute("data-id")).toBe("d");
  });

  // destroy() must be idempotent.
  it("destroy() is idempotent (no throw on second call)", () => {
    const ul = makeList();
    const inst = Sorta11y.create(ul);
    inst.destroy();
    expect(() => inst.destroy()).not.toThrow();
  });

  // refresh() must strip ARIA from items that leave the set.
  it("refresh() cleans up items that leave the set", () => {
    const ul = document.createElement("ul");
    ["a", "b", "c"].forEach((id) => {
      const li = document.createElement("li");
      li.className = "srt";
      li.setAttribute("data-id", id);
      li.textContent = id;
      ul.appendChild(li);
    });
    document.body.appendChild(ul);
    const inst = track(Sorta11y.create(ul, { itemSelector: "li.srt" }));
    expect(ul.children[1].getAttribute("tabindex")).toBe("0"); // enhanced grab target
    ul.children[1].classList.remove("srt");
    inst.refresh();
    expect(ul.children[1].getAttribute("tabindex")).toBeNull();
    expect(ul.children[1].getAttribute("aria-describedby")).toBeNull();
    expect(ul.children[1].classList.contains("s11y-item")).toBe(false);
  });

  // option('keyboard', false) must actually disable the keyboard.
  it('option("keyboard", false) detaches the keyboard handler', () => {
    const ul = makeList();
    const inst = track(Sorta11y.create(ul));
    inst.option("keyboard", false);
    const item = ul.children[0];
    item.focus();
    press(item, SPACE);
    expect(item.classList.contains("s11y-item--grabbed")).toBe(false);
  });

  // The grabbed item leaving the set mid-grab must not strand
  // role="application" nor make a later cancel/move/destroy throw.
  it("an item removed mid-grab is torn down by refresh() without stranding role=application", () => {
    const ul = makeList();
    const onEnd = vi.fn();
    const inst = track(Sorta11y.create(ul, { labels: LABELS, onEnd }));
    const wrap = ul.parentElement;
    const item = ul.children[0];
    item.focus();
    press(item, SPACE); // grab item a
    expect(item.classList.contains("s11y-item--grabbed")).toBe(true);
    expect(wrap.getAttribute("role")).toBe("application");
    expect(document.activeElement).toBe(ul); // the grab parks focus on the list

    item.remove(); // the grabbed item leaves the DOM
    expect(() => inst.refresh()).not.toThrow();
    expect(wrap.getAttribute("role")).toBeNull(); // not stranded
    expect(inst._grabbed).toBeNull(); // grab state cleared

    // The grab ENDS like any other: focus leaves the list for the item now in
    // the vanished one's slot, the grab-time tabindex goes, the stale
    // "Picked up…" text is cleared, and onEnd reports the item gone (-1).
    const survivor = ul.children[0];
    expect(document.activeElement).toBe(survivor);
    expect(ul.hasAttribute("tabindex")).toBe(false);
    expect(liveRegionOf(ul).textContent).toBe("");
    expect(onEnd).toHaveBeenCalledOnce();
    expect(onEnd.mock.calls[0][0]).toMatchObject({
      item,
      oldIndex: 0,
      newIndex: -1,
      order: ["b", "c", "d"],
    });

    // Subsequent operations on the (now smaller) list must be safe, and the
    // keyboard works again from the refocused item.
    expect(() => press(survivor, "ArrowDown")).not.toThrow();
    expect(() => press(survivor, "Escape")).not.toThrow();
    press(survivor, SPACE);
    expect(survivor.classList.contains("s11y-item--grabbed")).toBe(true);
    press(survivor, "Escape");
    expect(() => inst.destroy()).not.toThrow();
    expect(wrap.getAttribute("role")).toBeNull();
    expect(ul.hasAttribute("tabindex")).toBe(false); // nothing survives destroy()
  });

  it("refresh() ending a grab whose item was LAST focuses the new last item's handle", () => {
    const ul = makeList({ handle: true });
    const inst = track(
      Sorta11y.create(ul, { labels: LABELS, handle: ".drag-handle" }),
    );
    const handle = ul.children[0].querySelector(".drag-handle");
    handle.focus();
    press(handle, SPACE); // grab a (focus → list)
    press(handle, "End"); // a moves to the end: [b, c, d, a], focus on its handle
    const a = ul.children[3];
    a.remove(); // focus falls to <body> with it
    inst.refresh();
    expect(document.activeElement).toBe(
      ul.children[2].querySelector(".drag-handle"),
    );
    expect(ul.hasAttribute("tabindex")).toBe(false);
  });

  it("refresh() ending a grab does not steal a focus that already left the list", () => {
    const ul = makeList();
    const outside = document.createElement("input");
    document.body.appendChild(outside);
    const inst = track(Sorta11y.create(ul, { labels: LABELS }));
    const item = ul.children[0];
    item.focus();
    press(item, SPACE);
    outside.focus(); // (its focusout cancel is still a microtask away)
    item.remove();
    inst.refresh();
    expect(document.activeElement).toBe(outside);
    expect(ul.hasAttribute("tabindex")).toBe(false);
  });

  // A {keyboard:false} list must not advertise the keyboard instructions.
  it("keyboard:false grab targets carry no aria-describedby instructions", () => {
    const ul = makeList();
    track(Sorta11y.create(ul, { keyboard: false }));
    expect(ul.children[0].getAttribute("aria-describedby")).toBeNull();
  });

  it('option("keyboard", false) clears aria-describedby; back on restores it', () => {
    const ul = makeList();
    const inst = track(Sorta11y.create(ul));
    expect(ul.children[0].getAttribute("aria-describedby")).not.toBeNull();
    inst.option("keyboard", false);
    expect(ul.children[0].getAttribute("aria-describedby")).toBeNull();
    inst.option("keyboard", true);
    expect(ul.children[0].getAttribute("aria-describedby")).not.toBeNull();
  });

  // Detached init must not inject the regions into the list.
  it("detached init does not inject regions into the list", () => {
    const ul = makeList();
    ul.remove(); // detach before init
    const inst = track(Sorta11y.create(ul));
    expect(Array.from(ul.children).every((c) => c.tagName === "LI")).toBe(true);
  });
});

// A consumer callback that throws must not strand the library's own cleanup:
// the grab-time tabindex on the list (which a later instance would mistake
// for the consumer's own, keeping it forever) and the focus restoration. The
// exception still reaches the page — nothing is swallowed.
describe("sorta11y — throwing consumer callbacks", () => {
  let errors;
  const onError = (e) => {
    errors.push(e.error && e.error.message);
    e.preventDefault(); // keep jsdom from logging the (expected) error
  };
  const boom = (msg) => () => {
    throw new Error(msg);
  };
  const setup = (options) => {
    errors = [];
    window.addEventListener("error", onError);
    const ul = makeList({ handle: true });
    const inst = track(
      Sorta11y.create(ul, {
        labels: LABELS,
        handle: ".drag-handle",
        animation: 0,
        ...options,
      }),
    );
    return { ul, inst, handle: ul.children[0].querySelector(".drag-handle") };
  };
  afterEach(() => window.removeEventListener("error", onError));

  it("onChange throws on a drop: cleanup still runs, the error surfaces", () => {
    const { ul, inst, handle } = setup({ onChange: boom("change") });
    handle.focus();
    press(handle, SPACE); // grab (focus → list, tabindex -1)
    press(handle, "ArrowDown");
    press(handle, SPACE); // drop → onChange throws
    expect(errors).toEqual(["change"]);
    expect(document.activeElement).toBe(handle);
    expect(ul.hasAttribute("tabindex")).toBe(false);
    inst.destroy();
    expect(ul.hasAttribute("tabindex")).toBe(false);
  });

  it("onEnd throws on a drop right after the pickup (focus still on the list)", () => {
    const { ul, inst, handle } = setup({ onEnd: boom("end") });
    handle.focus();
    press(handle, SPACE); // grab
    expect(document.activeElement).toBe(ul);
    press(handle, SPACE); // drop from the list → onEnd throws
    expect(errors).toEqual(["end"]);
    expect(document.activeElement).toBe(handle);
    expect(ul.hasAttribute("tabindex")).toBe(false);
    inst.destroy();
    expect(ul.hasAttribute("tabindex")).toBe(false);
  });

  it("onEnd throws on a cancel: order restored, focus back, no tabindex left", () => {
    const { ul, inst, handle } = setup({ onEnd: boom("end") });
    handle.focus();
    press(handle, SPACE);
    press(handle, "ArrowDown");
    press(handle, "Escape"); // cancel → onEnd throws
    expect(errors).toEqual(["end"]);
    expect(inst.toArray()).toEqual(["a", "b", "c", "d"]);
    expect(document.activeElement).toBe(handle);
    expect(ul.hasAttribute("tabindex")).toBe(false);
    inst.destroy();
    expect(ul.hasAttribute("tabindex")).toBe(false);
  });

  it("onStart throws: the pickup is still complete (focus mode, announcement)", () => {
    const { ul, handle } = setup({ onStart: boom("start") });
    handle.focus();
    press(handle, SPACE); // grab → onStart throws
    expect(errors).toEqual(["start"]);
    expect(document.activeElement).toBe(ul);
    expect(liveRegionOf(ul).textContent).toBe("GRAB A 1/4");
    press(handle, SPACE); // and it still drops cleanly
    expect(document.activeElement).toBe(handle);
    expect(ul.hasAttribute("tabindex")).toBe(false);
  });
});

// A refresh() during a keyboard grab that changes OTHER items: the start
// order a cancel restores must follow the new set.
describe("sorta11y — refresh() under a keyboard grab", () => {
  it("Escape does not resurrect an item the app removed meanwhile", () => {
    const ul = makeList();
    const onEnd = vi.fn();
    const inst = track(Sorta11y.create(ul, { labels: LABELS, onEnd }));
    const [a, b, c] = ul.children;
    c.focus();
    press(c, SPACE); // grab c (index 2)
    press(c, "ArrowUp"); // [a, c, b, d]
    a.remove();
    inst.refresh();
    press(c, "Escape");
    expect(a.isConnected).toBe(false);
    expect(inst.toArray()).toEqual(["b", "c", "d"]);
    expect(onEnd.mock.calls[0][0]).toMatchObject({ oldIndex: 1, newIndex: 1 });
    expect(b.isConnected).toBe(true);
  });

  it("an item the app added meanwhile stays registered, where it was put", () => {
    const ul = makeList();
    const inst = track(Sorta11y.create(ul, { labels: LABELS }));
    const a = ul.children[0];
    a.focus();
    press(a, SPACE);
    press(a, "ArrowDown"); // [b, a, c, d]
    const x = document.createElement("li");
    x.setAttribute("data-id", "x");
    x.textContent = "X";
    ul.insertBefore(x, ul.children[3]); // [b, a, c, x, d]
    inst.refresh();
    press(a, "Escape");
    expect(inst.toArray()).toEqual(["a", "b", "c", "x", "d"]);
    expect(x.getAttribute("tabindex")).toBe("0");
  });
});
