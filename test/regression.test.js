import { describe, it, expect, afterEach } from "vitest";
import Sorta11y from "../src/sorta11y.js";
import { makeList, press, activate, SPACE, LABELS } from "./helpers/dom.js";

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
    const inst = track(Sorta11y.create(ul, { labels: LABELS }));
    const wrap = ul.parentElement;
    const item = ul.children[0];
    item.focus();
    press(item, SPACE); // grab item a
    expect(item.classList.contains("s11y-item--grabbed")).toBe(true);
    expect(wrap.getAttribute("role")).toBe("application");

    item.remove(); // the grabbed item leaves the DOM
    expect(() => inst.refresh()).not.toThrow();
    expect(wrap.getAttribute("role")).toBeNull(); // not stranded
    expect(inst._grabbed).toBeNull(); // grab state cleared

    // Subsequent operations on the (now smaller) list must be safe no-ops.
    const survivor = ul.children[0];
    expect(() => press(survivor, "ArrowDown")).not.toThrow();
    expect(() => press(survivor, "Escape")).not.toThrow();
    expect(() => inst.destroy()).not.toThrow();
    expect(wrap.getAttribute("role")).toBeNull();
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
