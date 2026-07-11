import { describe, it, expect, afterEach } from "vitest";
import Sorta11y from "../src/sorta11y.js";
import { makeList, press, SPACE, liveRegionOf } from "./helpers/dom.js";

// Exercises the shipped built-in default labels (English, no injected labels).
// Other languages are covered in locales.test.js.

let inst;
afterEach(() => {
  if (inst) {
    try {
      inst.destroy();
    } catch {
      /* noop */
    }
    inst = null;
  }
  document.body.replaceChildren();
});

describe("sorta11y — built-in English defaults", () => {
  it("announces grab → move → drop with 1-indexed positions", () => {
    const ul = makeList();
    inst = Sorta11y.create(ul); // defaults
    const live = liveRegionOf(ul);
    const item = ul.children[0];
    item.focus();

    press(item, SPACE);
    expect(live.textContent).toMatch(/Picked up/);
    expect(live.textContent).toMatch(/Position 1 of 4/);

    press(item, "ArrowDown");
    expect(live.textContent).toMatch(/Position 2 of 4/);

    press(item, SPACE);
    expect(live.textContent).toMatch(/Dropped/);
    expect(live.textContent).toMatch(/Position 2 of 4/);
  });

  it("announces a cancel with the restored position", () => {
    const ul = makeList();
    inst = Sorta11y.create(ul);
    const live = liveRegionOf(ul);
    const item = ul.children[0];
    item.focus();
    press(item, SPACE);
    press(item, "ArrowDown");
    press(item, "Escape");
    expect(live.textContent).toMatch(/Cancelled/);
    expect(live.textContent).toMatch(/Position 1 of 4/);
  });

  it("omits the total when announceTotal is false", () => {
    const ul = makeList();
    inst = Sorta11y.create(ul, { announceTotal: false });
    const live = liveRegionOf(ul);
    const item = ul.children[0];
    item.focus();
    press(item, SPACE);
    expect(live.textContent).toMatch(/Position 1\b/);
    expect(live.textContent).not.toMatch(/of 4/);
  });

  it("seeds the instructions element from the default label", () => {
    const ul = makeList();
    inst = Sorta11y.create(ul);
    const id = ul.children[0].getAttribute("aria-describedby");
    expect(document.getElementById(id).textContent).toMatch(
      /Press Space to pick up/,
    );
  });

  it("reads cleanly when an item has no label", () => {
    const ul = document.createElement("ul");
    ["x", "y"].forEach((id) => {
      const li = document.createElement("li");
      li.setAttribute("data-id", id); // identity only — no visible label
      ul.appendChild(li);
    });
    document.body.appendChild(ul);
    inst = Sorta11y.create(ul);
    const live = liveRegionOf(ul);
    const item = ul.children[0];
    item.focus();
    press(item, SPACE);
    expect(live.textContent).toMatch(/^Picked up\. Position 1 of 2/);
    press(item, "ArrowDown");
    press(item, "Escape");
    expect(live.textContent).toMatch(/^Cancelled\. Back at Position 1 of 2/);
  });
});
