import { describe, it, expect, afterEach } from "vitest";
import Sorta11y from "../src/sorta11y.js";
import { makeList, press, SPACE } from "./helpers/dom.js";

// jsdom has no layout, so getBoundingClientRect returns zeros. To exercise the
// FLIP path we simulate a vertical layout (each child's top = DOM index * 10px).
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

function fakeVerticalLayout(ul) {
  Element.prototype.getBoundingClientRect = function () {
    const idx = Array.prototype.indexOf.call(ul.children, this);
    const top = idx < 0 ? 0 : idx * 10;
    return {
      top,
      bottom: top + 10,
      left: 0,
      right: 0,
      width: 0,
      height: 10,
      x: 0,
      y: top,
    };
  };
}

const nextFrames = () =>
  new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );

describe("sorta11y — FLIP reorder animation", () => {
  it("inverts displaced items with a transform, then plays back to rest", async () => {
    const ul = makeList();
    track(Sorta11y.create(ul, { animation: 150 }));
    fakeVerticalLayout(ul);
    const item = ul.children[0]; // 'a'
    item.focus();
    press(item, SPACE);
    press(item, "ArrowDown"); // a: index 0 -> 1, so a and b both shift

    // Invert: the moved item is transformed to look like it is still at its old box.
    expect(item.style.transform).toMatch(/translate\(/);
    expect(item.style.transition).toBe("none");

    // Play: after two frames the transform is cleared with a timed transition.
    await nextFrames();
    expect(item.style.transform).toBe("");
    expect(item.style.transition).toMatch(/transform 150ms/);
  });

  it("also animates the neighbour the grabbed item passes", async () => {
    const ul = makeList();
    track(Sorta11y.create(ul, { animation: 150 }));
    fakeVerticalLayout(ul);
    const a = ul.children[0];
    const b = ul.children[1];
    a.focus();
    press(a, SPACE);
    press(a, "ArrowDown"); // a passes b → b must shift up
    expect(b.style.transform).toMatch(/translate\(/); // the displaced neighbour moves too
  });

  it("does not animate when animation is 0 (instant reorder)", () => {
    const ul = makeList();
    const inst = track(Sorta11y.create(ul, { animation: 0 }));
    fakeVerticalLayout(ul);
    const item = ul.children[0];
    item.focus();
    press(item, SPACE);
    press(item, "ArrowDown");
    expect(item.style.transform).toBe(""); // no FLIP
    expect(inst.toArray()).toEqual(["b", "a", "c", "d"]); // reorder still applied
  });

  it("respects prefers-reduced-motion (instant, no transform)", () => {
    const ul = makeList();
    const inst = track(Sorta11y.create(ul, { animation: 150 }));
    fakeVerticalLayout(ul);
    window.matchMedia = (q) => ({
      matches: /reduce/.test(q),
      media: q,
      addListener() {},
      removeListener() {},
    });
    const item = ul.children[0];
    item.focus();
    press(item, SPACE);
    press(item, "ArrowDown");
    expect(item.style.transform).toBe("");
    expect(inst.toArray()).toEqual(["b", "a", "c", "d"]);
  });
});
