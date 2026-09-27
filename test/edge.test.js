import { describe, it, expect, afterEach } from "vitest";
import Sorta11y from "../src/sorta11y.js";
import { makeList, press, SPACE, liveRegionOf } from "./helpers/dom.js";

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

describe("sorta11y — configuration & robustness", () => {
  it("throws on a non-element", () => {
    expect(() => Sorta11y.create(null)).toThrow(TypeError);
    expect(() => Sorta11y.create({})).toThrow(/DOM element/);
  });

  // The docs promise Sorta11y.create("#my-list", …); fromSelect and
  // mirrorToSelect already take selectors the same way.
  it("accepts a selector string (create, new, and the bare factory)", () => {
    const ul = makeList();
    ul.id = "my-list";
    const inst = track(Sorta11y.create("#my-list"));
    expect(inst.el).toBe(ul);
    expect(Sorta11y.get(ul)).toBe(inst);
    expect(new Sorta11y("#my-list")).toBe(inst); // idempotent per element
    expect(Sorta11y("ul#my-list")).toBe(inst);
  });

  it("throws a TypeError naming a selector that matches nothing", () => {
    expect(() => Sorta11y.create("#nope")).toThrow(TypeError);
    expect(() => Sorta11y.create("#nope")).toThrow(/#nope/);
  });

  it("can be called as a factory without `new`", () => {
    const ul = makeList();
    const inst = track(Sorta11y(ul));
    expect(inst).toBeInstanceOf(Sorta11y);
    expect(Sorta11y.get(ul)).toBe(inst);
  });

  it("supports a non-child itemSelector (querySelectorAll path)", () => {
    const ul = makeList();
    const inst = track(Sorta11y.create(ul, { itemSelector: "li" }));
    expect(inst.toArray()).toEqual(["a", "b", "c", "d"]);
  });

  it("keyboard:false leaves the list inert", () => {
    const ul = makeList();
    track(Sorta11y.create(ul, { keyboard: false }));
    const item = ul.children[0];
    item.focus();
    press(item, SPACE);
    expect(item.classList.contains("s11y-item--grabbed")).toBe(false);
  });

  it("prefers an explicit data-label for the announced item name", () => {
    const ul = makeList();
    ul.children[0].setAttribute("data-label", "Erster Eintrag");
    track(Sorta11y.create(ul, { labels: { grabbed: (c) => c.itemLabel } }));
    const item = ul.children[0];
    item.focus();
    press(item, SPACE);
    expect(liveRegionOf(ul).textContent).toBe("Erster Eintrag");
  });

  it("accepts a function for the instructions label", () => {
    const ul = makeList();
    track(Sorta11y.create(ul, { labels: { instructions: () => "DYNAMIC" } }));
    const id = ul.children[0].getAttribute("aria-describedby");
    expect(document.getElementById(id).textContent).toBe("DYNAMIC");
  });

  it("sort() tolerates a partial order, appending the rest", () => {
    const ul = makeList();
    const inst = track(Sorta11y.create(ul));
    inst.sort(["c"]);
    expect(inst.toArray()[0]).toBe("c");
    expect([...inst.toArray()].sort()).toEqual(["a", "b", "c", "d"]);
  });

  it('option("labels", …) swaps the label set live', () => {
    const ul = makeList();
    const inst = track(Sorta11y.create(ul));
    inst.option("labels", { grabbed: () => "NEU" });
    const item = ul.children[0];
    item.focus();
    press(item, SPACE);
    expect(liveRegionOf(ul).textContent).toBe("NEU");
  });

  it("option() applies a structural change (dataIdAttr) via refresh", () => {
    const ul = makeList();
    ul.children[0].setAttribute("data-key", "X");
    const inst = track(Sorta11y.create(ul));
    inst.option("dataIdAttr", "data-key");
    expect(inst.toArray()[0]).toBe("X");
  });

  it("autoInit reads data-rtl", () => {
    const ul = makeList();
    ul.setAttribute("data-sorta11y", "");
    ul.setAttribute("data-rtl", "auto");
    Sorta11y.autoInit().forEach(track);
    expect(Sorta11y.get(ul).option("rtl")).toBe("auto");
  });

  it("ignores keystrokes that originate outside the list items", () => {
    const ul = makeList();
    track(Sorta11y.create(ul));
    // A keydown bubbling from a non-item target must be a no-op.
    const ev = press(ul, "ArrowDown");
    expect(ev.defaultPrevented).toBe(false);
  });

  it("in handle mode, ignores a stray role=button outside the handle", () => {
    const ul = makeList({ handle: true });
    track(Sorta11y.create(ul, { handle: ".drag-handle" }));
    const stray = document.createElement("span");
    stray.setAttribute("role", "button");
    ul.children[0].appendChild(stray); // inside the li, but not the handle
    const ev = press(stray, SPACE);
    expect(ev.defaultPrevented).toBe(false); // only the handle drives the item
  });
});
