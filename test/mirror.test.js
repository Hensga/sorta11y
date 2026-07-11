import { describe, it, expect, afterEach } from "vitest";
import Sorta11y from "../src/sorta11y.js";

function makeSelect(ids) {
  const sel = document.createElement("select");
  sel.id = "mirror-target";
  sel.multiple = true;
  ids.forEach((id) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = id.toUpperCase();
    opt.selected = true;
    sel.appendChild(opt);
  });
  document.body.appendChild(sel);
  return sel;
}
const order = (sel) => Array.from(sel.options).map((o) => o.value);

afterEach(() => {
  document.body.replaceChildren();
});

describe("Sorta11y.mirrorToSelect", () => {
  it("reorders the <option> nodes to match evt.order (string selector)", () => {
    const sel = makeSelect(["a", "b", "c", "d"]);
    Sorta11y.mirrorToSelect({ order: ["d", "c", "b", "a"] }, "#mirror-target");
    expect(order(sel)).toEqual(["d", "c", "b", "a"]);
  });

  it("accepts a <select> element directly", () => {
    const sel = makeSelect(["a", "b", "c"]);
    Sorta11y.mirrorToSelect({ order: ["b", "a", "c"] }, sel);
    expect(order(sel)).toEqual(["b", "a", "c"]);
  });

  it("accepts a bare order array as the first argument", () => {
    const sel = makeSelect(["a", "b", "c"]);
    Sorta11y.mirrorToSelect(["c", "b", "a"], sel);
    expect(order(sel)).toEqual(["c", "b", "a"]);
  });

  it("preserves option selection so a form submit still carries it", () => {
    const sel = makeSelect(["a", "b"]);
    Sorta11y.mirrorToSelect({ order: ["b", "a"] }, sel);
    expect(
      Array.from(sel.selectedOptions)
        .map((o) => o.value)
        .sort(),
    ).toEqual(["a", "b"]);
  });

  it("keeps options that are not named in the order", () => {
    const sel = makeSelect(["a", "b", "c"]);
    Sorta11y.mirrorToSelect({ order: ["c", "a"] }, sel); // 'b' unmentioned
    expect(order(sel)).toContain("b");
    expect(order(sel).length).toBe(3);
  });

  it("is a graceful no-op when the select is missing", () => {
    expect(() =>
      Sorta11y.mirrorToSelect({ order: ["a"] }, "#nope"),
    ).not.toThrow();
    expect(Sorta11y.mirrorToSelect({ order: ["a"] }, "#nope")).toBeNull();
  });

  it("is a graceful no-op when evt/order is missing", () => {
    const sel = makeSelect(["a", "b"]);
    expect(() => Sorta11y.mirrorToSelect(null, sel)).not.toThrow();
    expect(order(sel)).toEqual(["a", "b"]); // unchanged
  });

  it("works as an onChange consumer end-to-end with a keyboard reorder", () => {
    const ul = document.createElement("ul");
    ["a", "b", "c"].forEach((id) => {
      const li = document.createElement("li");
      li.setAttribute("data-id", id);
      li.textContent = id;
      ul.appendChild(li);
    });
    document.body.appendChild(ul);
    const sel = makeSelect(["a", "b", "c"]);
    const inst = Sorta11y.create(ul, {
      animation: 0,
      onChange: (evt) => Sorta11y.mirrorToSelect(evt, sel),
    });
    const item = ul.children[0];
    const key = (k) =>
      item.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: k,
          bubbles: true,
          cancelable: true,
        }),
      );
    item.focus();
    key(" "); // grab
    key("ArrowDown"); // a -> index 1
    key(" "); // drop
    expect(order(sel)).toEqual(["b", "a", "c"]);
    inst.destroy();
  });
});
