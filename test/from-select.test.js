import { describe, it, expect, afterEach } from "vitest";
import Sorta11y from "../src/sorta11y.js";
import { press, SPACE, LABELS } from "./helpers/dom.js";

// Build a <select multiple> in the body, enhance it with fromSelect, and return
// the pieces. animation:0 keeps the keyboard reorder deterministic under jsdom.
let tracked = [];
function build(values, texts, opts = {}) {
  const select = document.createElement("select");
  select.multiple = true;
  select.id = "src";
  select.setAttribute("aria-label", "Source select");
  values.forEach((v, i) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = texts[i];
    select.appendChild(o);
  });
  document.body.appendChild(select);
  const inst = Sorta11y.fromSelect(select, {
    animation: 0,
    labels: LABELS,
    ...opts,
  });
  tracked.push(inst);
  return { select, ul: inst.el, inst };
}

afterEach(() => {
  tracked.forEach((i) => {
    try {
      i && i.destroy();
    } catch {
      /* noop */
    }
  });
  tracked = [];
  document.body.replaceChildren();
});

describe("sorta11y — Sorta11y.fromSelect", () => {
  it("builds one <li data-id> per option, with the option text", () => {
    const { ul } = build(["a", "b", "c"], ["Alpha", "Beta", "Gamma"]);
    expect(ul.tagName).toBe("UL");
    expect(
      Array.from(ul.children).map((li) => li.getAttribute("data-id")),
    ).toEqual(["a", "b", "c"]);
    expect(ul.children[0].textContent).toContain("Alpha");
    expect(ul.children[2].textContent).toContain("Gamma");
  });

  it("hides the source <select> but keeps it in the DOM, before the built list", () => {
    const { select, ul } = build(["a", "b"], ["A", "B"]);
    expect(select.hidden).toBe(true);
    expect(select.getAttribute("aria-hidden")).toBe("true");
    expect(select.isConnected).toBe(true); // still submittable
    // the list precedes the select in document order (robust to the app wrapper)
    const precedes =
      ul.compareDocumentPosition(select) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(Boolean(precedes)).toBe(true);
  });

  it("generates a named handle button by default and wires it as the grab target", () => {
    const { ul } = build(["a", "b"], ["Anmeldung", "Beitrag"]);
    const btn = ul.children[0].querySelector("button.s11y-handle");
    expect(btn).not.toBeNull();
    expect(btn.getAttribute("type")).toBe("button");
    expect(btn.getAttribute("aria-label")).toBeTruthy(); // accessible name
    expect(btn.getAttribute("tabindex")).toBe("0"); // create() picked it up as the handle
  });

  it("handle:false builds no button and makes the <li> itself the tab stop", () => {
    const { ul } = build(["a", "b"], ["A", "B"], { handle: false });
    expect(ul.children[0].querySelector("button")).toBeNull();
    expect(ul.children[0].getAttribute("tabindex")).toBe("0");
  });

  it("handlePosition defaults to left: the handle comes before the text", () => {
    const { ul } = build(["a"], ["Alpha"]);
    const li = ul.children[0];
    const btn = li.querySelector("button.s11y-handle");
    expect(li.firstChild).toBe(btn); // handle is the first node
    expect(btn.classList.contains("s11y-handle--left")).toBe(true);
  });

  it("handlePosition:'right' puts the handle after the text (row end) with a --right modifier", () => {
    const { ul } = build(["a"], ["Alpha"], { handlePosition: "right" });
    const li = ul.children[0];
    const btn = li.querySelector("button.s11y-handle");
    expect(btn).not.toBeNull();
    expect(li.firstChild.nodeType).toBe(3); // a text node comes first
    expect(li.lastChild).toBe(btn); // the handle is the last node
    expect(btn.classList.contains("s11y-handle--right")).toBe(true);
    expect(btn.getAttribute("tabindex")).toBe("0"); // still the grab target
    expect(li.textContent).toContain("Alpha"); // announced name still intact
  });

  it("calls renderItem(li, option) per item and keeps its mutations", () => {
    const { ul } = build(["a", "b"], ["A", "B"], {
      renderItem: (li, opt) => {
        li.style.background = "rgb(1, 2, 3)";
        li.dataset.value = opt.value;
        li.classList.add("group-tint");
      },
    });
    expect(ul.children[0].style.background).toBe("rgb(1, 2, 3)");
    expect(ul.children[1].dataset.value).toBe("b");
    expect(ul.children[0].classList.contains("group-tint")).toBe(true);
  });

  it("keeps every option selected and mirrors a reorder back into the select", () => {
    const { select, ul } = build(["a", "b", "c"], ["A", "B", "C"], {
      handle: false,
    });
    expect(Array.from(select.options).every((o) => o.selected)).toBe(true);

    const li0 = ul.children[0];
    li0.focus();
    press(li0, SPACE); // grab (no-handle → Space picks up)
    press(li0, "ArrowDown"); // move down one
    press(li0, SPACE); // drop → onChange → mirrorToSelect

    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(Array.from(select.options).every((o) => o.selected)).toBe(true);
  });

  it("also runs a consumer onChange in addition to mirroring", () => {
    const seen = [];
    const { ul } = build(["a", "b"], ["A", "B"], {
      handle: false,
      onChange: (evt) => seen.push(evt.order.join("")),
    });
    const li0 = ul.children[0];
    li0.focus();
    press(li0, SPACE);
    press(li0, "ArrowDown");
    press(li0, SPACE);
    expect(seen).toEqual(["ba"]);
  });

  it("returns null for a missing selector or a non-select element", () => {
    expect(Sorta11y.fromSelect("#does-not-exist")).toBeNull();
    expect(Sorta11y.fromSelect(document.createElement("div"))).toBeNull();
  });
});
