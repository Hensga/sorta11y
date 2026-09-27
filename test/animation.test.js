import { describe, it, expect, afterEach, vi } from "vitest";
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
  delete Element.prototype.scrollIntoView;
  document.body.replaceChildren();
});

// `scrolled(el)` optionally shifts an element's box, simulating a scroll.
function fakeVerticalLayout(ul, scrolled = () => 0) {
  Element.prototype.getBoundingClientRect = function () {
    const idx = Array.prototype.indexOf.call(ul.children, this);
    const top = (idx < 0 ? 0 : idx * 10) - scrolled(this);
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

const domIndex = (ul, el) => Array.prototype.indexOf.call(ul.children, el);

// Like a real rect, include the element's own (inline) translate — so a FLIP
// transform still pending from the previous move shows up in measurements.
function includeInlineTranslate() {
  const layout = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    const r = layout.call(this);
    const m = /translate\([^,]+,\s*(-?[\d.]+)px\)/.exec(this.style.transform);
    const dy = m ? Number(m[1]) : 0;
    return { ...r, top: r.top + dy, bottom: r.bottom + dy };
  };
}

const nextFrames = () =>
  new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );

// FLIP's inverted state now lives only until the style flush in the same
// task (the slide starts at once), so tests observe it there: snapshot every
// row's inline transform whenever a layout read sees a row held inverted.
function captureInversions(ul) {
  const layout = Element.prototype.getBoundingClientRect;
  let snap = null;
  Element.prototype.getBoundingClientRect = function () {
    const rows = Array.from(ul.children);
    if (rows.some((r) => r.style.transition === "none" && r.style.transform))
      snap = new Map(rows.map((r) => [r, r.style.transform]));
    return layout.call(this);
  };
  return (row) => (snap ? snap.get(row) : undefined);
}

describe("sorta11y — FLIP reorder animation", () => {
  it("inverts displaced items, flushes, then plays back to rest in the same task", () => {
    const ul = makeList();
    track(Sorta11y.create(ul, { animation: 150 }));
    fakeVerticalLayout(ul);
    const item = ul.children[0]; // 'a'
    item.focus();
    press(item, SPACE);
    // Record the item's inline style at every layout read (a style flush).
    const layout = Element.prototype.getBoundingClientRect;
    const flushes = [];
    Element.prototype.getBoundingClientRect = function () {
      if (this === item)
        flushes.push([item.style.transform, item.style.transition]);
      return layout.call(this);
    };
    press(item, "ArrowDown"); // a: index 0 -> 1, so a and b both shift

    // Invert: flushed while transformed to look like it is still at its old box…
    expect(flushes).toContainEqual(["translate(0px, -10px)", "none"]);
    // …then play at once: transform cleared with a timed transition.
    expect(item.style.transform).toBe("");
    expect(item.style.transition).toMatch(/transform 150ms/);
  });

  // A held arrow key repeats faster than two frames. Waiting for frames before
  // playing let every press re-measure the still-unmoved item and restart the
  // wait: the item froze (drifting off-screen as the reveal scrolled on) and
  // then jumped the whole distance at once.
  it("a held arrow key cannot starve the slide: every move starts sliding at once", () => {
    const ul = makeList();
    track(Sorta11y.create(ul, { animation: 150 }));
    fakeVerticalLayout(ul);
    const a = ul.children[0];
    a.focus();
    press(a, SPACE);
    for (let i = 0; i < 3; i++) {
      press(a, "ArrowDown");
      expect(a.style.transform).toBe("");
      expect(a.style.transition).toMatch(/transform 150ms/);
    }
  });

  it("keeps neighbours' transform-immune boxes for the whole slide, then drops them", async () => {
    const ul = makeList();
    track(Sorta11y.create(ul, { animation: 20 }));
    fakeVerticalLayout(ul);
    const [a, b] = ul.children;
    a.focus();
    press(a, SPACE);
    press(a, "ArrowDown"); // b slides up
    expect(b._s11yRect).toBeTruthy();
    await nextFrames();
    expect(b._s11yRect).toBeTruthy(); // still mid-flight
    await new Promise((r) => setTimeout(r, 120));
    expect(b._s11yRect).toBeFalsy();
  });

  it("also animates the neighbour the grabbed item passes", async () => {
    const ul = makeList();
    track(Sorta11y.create(ul, { animation: 150 }));
    fakeVerticalLayout(ul);
    const a = ul.children[0];
    const b = ul.children[1];
    a.focus();
    press(a, SPACE);
    const inverted = captureInversions(ul);
    press(a, "ArrowDown"); // a passes b → b must shift up
    expect(inverted(b)).toMatch(/translate\(/); // the displaced neighbour moves too
  });

  // A held arrow key moves again while the previous slide still runs: a
  // row's First must be where it visibly is (mid-slide) and its Last its
  // natural new box, or it jumps and slides back.
  it("slides a mid-flight neighbour on from where it visibly is", () => {
    const ul = makeList();
    track(Sorta11y.create(ul, { animation: 150 }));
    fakeVerticalLayout(ul);
    includeInlineTranslate();
    const a = ul.children[0];
    const b = ul.children[1];
    a.focus();
    press(a, SPACE);
    press(a, "ArrowDown"); // a ↓ (natural top 10), b ↑ (natural top 0)
    // Mid-flight, b is visibly 4px below its box (a real browser animates
    // this; jsdom needs it inline to show up in the rect).
    b.style.transform = "translate(0px, 4px)";
    const inverted = captureInversions(ul);
    press(a, "ArrowUp"); // b's new box is at 10: it slides on from 4
    expect(inverted(b)).toBe("translate(0px, -6px)"); // from where it was
    expect(inverted(a)).toBe("translate(0px, 10px)");
    expect(b.style.transform).toBe(""); // …and is sliding to rest
    expect(a.style.transform).toBe("");
    // Rows the animation never touched keep no inline styles (a stray
    // transition:none would kill the page's own CSS transitions on them).
    [ul.children[2], ul.children[3]].forEach((row) => {
      expect(row.style.transition).toBe("");
      expect(row.style.transform).toBe("");
    });
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

// A keyboard move re-focuses the moved item while FLIP still holds it (by
// transform) at its OLD, visible spot — so the browser's focus-scroll never
// fires and the item then slides out of view (past the viewport edge, under
// a sticky header). The move itself must reveal the item at its FINAL spot
// (scrollIntoView honours scroll-padding), and FLIP must measure positions
// relative to the list so that scroll cannot fake a movement. jsdom has no
// scrollIntoView — it is stubbed here, which also lets it simulate a scroll.
describe("sorta11y — a keyboard move keeps the moved item in view", () => {
  const stubScroll = (impl = () => {}) => {
    const spy = vi.fn(impl);
    Element.prototype.scrollIntoView = spy;
    return spy;
  };

  it("each move reveals the moved item at its final position (nearest), focus without scroll", () => {
    const ul = makeList();
    track(Sorta11y.create(ul, { animation: 150 }));
    fakeVerticalLayout(ul);
    const scroll = stubScroll();
    const item = ul.children[0];
    item.focus();
    press(item, SPACE); // pickup: nothing moved, nothing scrolls
    expect(scroll).not.toHaveBeenCalled();
    const focus = vi.spyOn(item, "focus");
    press(item, "ArrowDown");
    expect(scroll).toHaveBeenCalledOnce();
    expect(scroll.mock.contexts[0]).toBe(item); // the row, not the list
    expect(scroll).toHaveBeenCalledWith({ block: "nearest" });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    press(item, "End");
    press(item, "Home");
    expect(scroll).toHaveBeenCalledTimes(3);
    press(item, "ArrowUp"); // boundary: nothing moved
    press(item, SPACE); // drop
    expect(scroll).toHaveBeenCalledTimes(3);
  });

  it("the reveal happens while the item sits at its final spot (no FLIP transform yet)", () => {
    const ul = makeList();
    track(Sorta11y.create(ul, { animation: 150 }));
    fakeVerticalLayout(ul);
    includeInlineTranslate();
    const item = ul.children[0];
    const seen = [];
    stubScroll(function () {
      seen.push([this.style.transform, domIndex(ul, this)]);
    });
    item.focus();
    press(item, SPACE);
    press(item, "ArrowDown");
    // A held arrow key repeats faster than a slide: the next move arrives
    // while the item is still visibly near its old spot, which must not skew
    // the reveal by a row. (Simulate the just-started slide inline.)
    item.style.transform = "translate(0px, -10px)";
    const inverted = captureInversions(ul);
    press(item, "ArrowDown", { repeat: true });
    expect(seen).toEqual([
      ["", 1],
      ["", 2],
    ]);
    // …and FLIP still starts the item from where it visibly was.
    expect(inverted(item)).toBe("translate(0px, -20px)");
  });

  it("reveals on the no-animation and reduced-motion paths too", () => {
    const ul = makeList();
    const inst = track(Sorta11y.create(ul, { animation: 0 }));
    const scroll = stubScroll();
    const item = ul.children[0];
    item.focus();
    press(item, SPACE);
    press(item, "ArrowDown");
    expect(scroll).toHaveBeenCalledTimes(1);
    inst.option("animation", 150);
    window.matchMedia = (q) => ({ matches: /reduce/.test(q), media: q });
    press(item, "ArrowDown");
    expect(scroll).toHaveBeenCalledTimes(2);
  });

  it("FLIP deltas are unaffected by the page scrolling during the reveal", () => {
    const ul = makeList();
    track(Sorta11y.create(ul, { animation: 150 }));
    let pageY = 0;
    fakeVerticalLayout(ul, () => pageY);
    stubScroll(() => {
      pageY = 25; // the reveal scrolls the page by 25px
    });
    const item = ul.children[0];
    item.focus();
    press(item, SPACE);
    const inverted = captureInversions(ul);
    press(item, "ArrowDown"); // a: 0 → 1, one 10px row down
    expect(inverted(item)).toBe("translate(0px, -10px)");
    expect(inverted(ul.children[0])).toBe("translate(0px, 10px)");
  });

  it("FLIP deltas are unaffected when the LIST is the scroll container", () => {
    const ul = makeList();
    track(Sorta11y.create(ul, { animation: 150 }));
    let listScroll = 0;
    Object.defineProperty(ul, "scrollTop", { get: () => listScroll });
    // Items move inside the list's scrollport; the list's own box stays put.
    fakeVerticalLayout(ul, (el) => (el === ul ? 0 : listScroll));
    stubScroll(() => {
      listScroll = 25;
    });
    const item = ul.children[0];
    item.focus();
    press(item, SPACE);
    const inverted = captureInversions(ul);
    press(item, "ArrowDown");
    expect(inverted(item)).toBe("translate(0px, -10px)");
  });

  it("Escape after a move reveals the restored item; a silent cancel scrolls nothing", async () => {
    const ul = makeList();
    track(Sorta11y.create(ul, { animation: 150 }));
    fakeVerticalLayout(ul);
    const scroll = stubScroll();
    const item = ul.children[0];
    item.focus();
    press(item, SPACE);
    press(item, "ArrowDown");
    scroll.mockClear();
    const focus = vi.spyOn(item, "focus");
    press(item, "Escape"); // item slides back to the top
    expect(scroll).toHaveBeenCalledOnce();
    expect(scroll.mock.contexts[0]).toBe(item);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    // An auto-cancel (a press elsewhere, wheel, resize) must not scroll: it
    // would move the page under the pointer mid-click, or fight the wheel.
    press(item, SPACE);
    press(item, "ArrowDown");
    scroll.mockClear();
    window.dispatchEvent(new Event("resize"));
    expect(item.classList.contains("s11y-item--grabbed")).toBe(false);
    expect(scroll).not.toHaveBeenCalled();
    // Cancelled because focus left the widget: the user is elsewhere now.
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    press(item, SPACE);
    press(item, "ArrowDown");
    scroll.mockClear();
    outside.focus();
    await Promise.resolve();
    expect(item.classList.contains("s11y-item--grabbed")).toBe(false);
    expect(scroll).not.toHaveBeenCalled();
  });
});

// The inline `transition` is the library's only for the length of a slide:
// left behind, it overrides the page's own CSS transitions on the item (a
// hover fade, the held state's colour/shadow change) so those snap instead.
describe("sorta11y — slide styles do not outlive the slide", () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  it("a keyboard move's inline transition is removed once the slide is over", async () => {
    const ul = makeList();
    track(Sorta11y.create(ul, { animation: 20 }));
    fakeVerticalLayout(ul);
    const [a, b] = ul.children;
    a.focus();
    press(a, SPACE);
    press(a, "ArrowDown");
    await nextFrames();
    expect(a.style.transition).toMatch(/transform 20ms/); // sliding
    await sleep(120);
    expect(a.style.transition).toBe("");
    expect(b.style.transition).toBe("");
  });

  it("a row halted for measuring but not moved gets no sticky transition:none", () => {
    const ul = makeList();
    track(Sorta11y.create(ul, { animation: 150 }));
    fakeVerticalLayout(ul);
    const [a, b] = ul.children;
    a.focus();
    press(a, SPACE);
    press(a, "ArrowDown"); // b slides up (inverse transform pending)
    press(a, "ArrowDown"); // before any frame: b is halted, measured, unmoved
    expect(b.style.transform).toBe("");
    expect(b.style.transition).toBe("");
  });

  it("a newer slide keeps its transition when an older slide's cleanup fires", async () => {
    const ul = makeList();
    track(Sorta11y.create(ul, { animation: 20 }));
    fakeVerticalLayout(ul);
    const a = ul.children[0];
    a.focus();
    press(a, SPACE);
    press(a, "ArrowDown");
    await nextFrames();
    await sleep(15); // the first slide's cleanup is due soon…
    press(a, "ArrowDown"); // …but a new slide starts on the same item
    await nextFrames();
    expect(a.style.transition).toMatch(/transform 20ms/);
    await sleep(120);
    expect(a.style.transition).toBe("");
  });

  it("the pointer drop's settle transition is removed afterwards too", async () => {
    const ul = makeList();
    const inst = track(Sorta11y.create(ul, { animation: 20 }));
    const a = ul.children[0];
    a.style.transform = "translate(0px, 7px)";
    inst._settle(a);
    expect(a.style.transition).toMatch(/transform 20ms/);
    await sleep(120);
    expect(a.style.transition).toBe("");
  });
});

describe("sorta11y — a released item is left alone by pending slide cleanup", () => {
  it("destroy() cancels the slide cleanup, so a later app transition survives", async () => {
    const ul = makeList();
    const inst = Sorta11y.create(ul, { animation: 20 });
    fakeVerticalLayout(ul);
    const [a, b] = ul.children;
    a.focus();
    press(a, SPACE);
    press(a, "ArrowDown"); // b slides, its cleanup is scheduled
    inst.destroy();
    b.style.transition = "transform 300ms ease-out"; // the app's own animation
    await new Promise((r) => setTimeout(r, 120)); // past the stale cleanup
    expect(b.style.transition).toBe("transform 300ms ease-out");
  });
});
