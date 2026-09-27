import { describe, it, expect, afterEach } from "vitest";
import axe from "axe-core";
import Sorta11y from "../src/sorta11y.js";
import {
  makeList,
  press,
  activate,
  SPACE,
  LABELS,
  liveRegionOf,
} from "./helpers/dom.js";

// The keyboard grab relies on Space + arrow keys reaching the widget. NVDA/JAWS
// swallow those in their default browse mode; the reader only passes them
// through in focus/application mode. Following GitHub's sortable pattern (and
// MDN's "scope it as small as possible, last resort" guidance), sorta11y engages
// role="application" ONLY during an active grab, on a wrapper <div> so the <ul>
// keeps real list/listitem semantics — and toggles it back off on drop/cancel so
// the idle list stays fully readable. Pickup is driven by the handle button's
// activation (a click, which survives browse mode), not a raw Space keydown.
const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } };
async function axeClean(el) {
  const { violations } = await axe.run(el, AXE_OPTIONS);
  return violations.map((v) => v.id);
}
const handleOf = (li) => li.querySelector(".drag-handle");

let inst;
afterEach(() => {
  if (inst) {
    try {
      inst.destroy();
    } catch {
      /* already destroyed */
    }
    inst = null;
  }
  document.body.replaceChildren();
});

describe("sorta11y — application role (screen-reader focus mode)", () => {
  it("wraps the list in a role-LESS application wrapper when idle (list stays readable)", () => {
    const ul = makeList();
    inst = Sorta11y.create(ul, { labels: LABELS });
    const wrap = ul.parentElement;
    expect(wrap.classList.contains("s11y-app")).toBe(true);
    expect(wrap.getAttribute("role")).toBeNull(); // NOT application while idle
    expect(ul.getAttribute("role")).toBeNull(); // <ul> keeps native list semantics
  });

  it("keeps the live region OUTSIDE the wrapper, as the wrapper's next sibling", () => {
    const ul = makeList();
    inst = Sorta11y.create(ul, { labels: LABELS });
    const wrap = ul.parentElement;
    const live = liveRegionOf(ul); // the wrapper's next sibling
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live).toBe(wrap.nextElementSibling);
    expect(wrap.contains(live)).toBe(false); // never a descendant of the wrapper
    expect(ul.nextElementSibling).toBeNull(); // the list is the wrapper's only child
  });

  // A live announcement must not fire from inside an active application
  // region — NVDA/JAWS handle a live region nested in role="application"
  // inconsistently (see docs/at-test-matrix). The regions stay siblings.
  it("keeps the live region out of the role=application subtree during a grab", () => {
    const ul = makeList();
    inst = Sorta11y.create(ul, { labels: LABELS });
    const wrap = ul.parentElement;
    const live = liveRegionOf(ul);
    const first = ul.children[0];
    first.focus();
    press(first, SPACE); // grab → wrapper becomes role=application
    expect(wrap.getAttribute("role")).toBe("application");
    expect(wrap.contains(live)).toBe(false); // announcement source stays outside
    expect(live.textContent).toBe("GRAB A 1/4"); // and it still announces
  });

  it("engages role=application on the wrapper only for the duration of a grab", () => {
    const ul = makeList({ handle: true });
    inst = Sorta11y.create(ul, { handle: ".drag-handle", labels: LABELS });
    const wrap = ul.parentElement;
    const handle = handleOf(ul.children[0]);

    activate(handle); // keyboard activation → pick up
    expect(ul.children[0].classList.contains("s11y-item--grabbed")).toBe(true);
    expect(handle.getAttribute("aria-pressed")).toBe("true");
    expect(wrap.getAttribute("role")).toBe("application"); // engaged for the grab

    activate(handle); // activate again → drop
    expect(ul.children[0].classList.contains("s11y-item--grabbed")).toBe(false);
    expect(handle.getAttribute("aria-pressed")).toBe("false");
    expect(wrap.getAttribute("role")).toBeNull(); // released again
  });

  it("arrow keys move the item while grabbed via the handle button", () => {
    const ul = makeList({ handle: true });
    inst = Sorta11y.create(ul, { handle: ".drag-handle", labels: LABELS });
    activate(handleOf(ul.children[0])); // grab item a
    press(handleOf(ul.children[0]), "ArrowDown");
    expect(inst.toArray()).toEqual(["b", "a", "c", "d"]);
  });

  // A real mouse click is pointerdown → pointerup → click; a bare click with
  // no pointer history is an AT activation and grabs (see pointer.test.js).
  // With clickToGrab:false the pointer tap and its click must stay a no-op.
  it("a real mouse click (pointer tap + click) with clickToGrab:false does NOT grab", () => {
    const ul = makeList({ handle: true });
    inst = Sorta11y.create(ul, {
      handle: ".drag-handle",
      labels: LABELS,
      clickToGrab: false,
    });
    const handle = handleOf(ul.children[0]);
    handle.dispatchEvent(
      new MouseEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        button: 0,
      }),
    );
    document.body.dispatchEvent(
      new MouseEvent("pointerup", { bubbles: true, cancelable: true }),
    );
    activate(handle, 1); // the click the browser synthesises for the tap
    expect(ul.children[0].classList.contains("s11y-item--grabbed")).toBe(false);
    expect(ul.parentElement.getAttribute("role")).toBeNull();
  });

  // WCAG 2.5.7: a single-pointer tap picks up the item.
  // The ghost click the browser synthesises right after must not re-toggle it —
  // it lands within the pointer-click guard window and is ignored — so the item
  // stays grabbed, not immediately dropped.
  it("a touch tap on the handle picks up; its ghost click does not undo the pickup", () => {
    const ul = makeList({ handle: true });
    inst = Sorta11y.create(ul, { handle: ".drag-handle", labels: LABELS });
    const handle = handleOf(ul.children[0]);
    handle.dispatchEvent(
      new MouseEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        button: 0,
      }),
    );
    document.body.dispatchEvent(
      new MouseEvent("pointerup", { bubbles: true, cancelable: true }),
    );
    expect(ul.children[0].classList.contains("s11y-item--grabbed")).toBe(true); // tap picked up
    activate(handle); // ghost click within the guard window → ignored
    expect(ul.children[0].classList.contains("s11y-item--grabbed")).toBe(true); // still held
    expect(handle.getAttribute("aria-pressed")).toBe("true");
  });

  it("no-handle: Space keydown still grabs and toggles the wrapper role", () => {
    const ul = makeList();
    inst = Sorta11y.create(ul, { labels: LABELS });
    const wrap = ul.parentElement;
    const first = ul.children[0];
    first.focus();
    press(first, SPACE);
    expect(first.classList.contains("s11y-item--grabbed")).toBe(true);
    expect(wrap.getAttribute("role")).toBe("application");
    press(first, SPACE); // drop
    expect(wrap.getAttribute("role")).toBeNull();
  });

  it("applicationRole:false leaves a bare native list (no wrapper)", () => {
    const ul = makeList();
    inst = Sorta11y.create(ul, { labels: LABELS, applicationRole: false });
    expect(ul.parentElement).toBe(document.body);
    expect(ul.getAttribute("role")).toBeNull();
    // and a grab does not fabricate one
    ul.children[0].focus();
    press(ul.children[0], SPACE);
    expect(ul.parentElement).toBe(document.body);
  });

  it("does not wrap when keyboard is off (application mode is a keyboard concern)", () => {
    const ul = makeList();
    inst = Sorta11y.create(ul, { labels: LABELS, keyboard: false });
    expect(ul.parentElement).toBe(document.body);
  });

  it("has no axe violations idle or mid-grab (wrapper + list + listitems)", async () => {
    const ul = makeList({ handle: true });
    inst = Sorta11y.create(ul, { handle: ".drag-handle" });
    const wrap = ul.parentElement;
    expect(await axeClean(wrap)).toEqual([]); // idle: wrapper has no role
    activate(handleOf(ul.children[0])); // grab → wrapper becomes role=application
    expect(wrap.getAttribute("role")).toBe("application");
    expect(await axeClean(wrap)).toEqual([]); // still clean under application mode
  });

  // role="application" requires an accessible name. The wrapper gets one
  // only for the duration of a grab, mirroring the list's own name when present.
  it("names the application wrapper by mirroring the list's aria-label during a grab", () => {
    const ul = makeList(); // makeList sets aria-label="Test list"
    inst = Sorta11y.create(ul, { labels: LABELS });
    const wrap = ul.parentElement;
    const first = ul.children[0];
    first.focus();
    press(first, SPACE); // grab
    expect(wrap.getAttribute("role")).toBe("application");
    expect(wrap.getAttribute("aria-label")).toBe("Test list"); // mirrors the list
    press(first, SPACE); // drop
    expect(wrap.getAttribute("aria-label")).toBeNull(); // name removed with the role
  });

  it("names the application wrapper via aria-labelledby when the list uses one", () => {
    const ul = makeList();
    const heading = document.createElement("h2");
    heading.id = "heading-x";
    heading.textContent = "Order";
    document.body.prepend(heading);
    ul.removeAttribute("aria-label");
    ul.setAttribute("aria-labelledby", "heading-x");
    inst = Sorta11y.create(ul, { labels: LABELS });
    const wrap = ul.parentElement;
    const first = ul.children[0];
    first.focus();
    press(first, SPACE);
    expect(wrap.getAttribute("aria-labelledby")).toBe("heading-x");
    expect(wrap.getAttribute("aria-label")).toBeNull();
    press(first, SPACE);
    expect(wrap.getAttribute("aria-labelledby")).toBeNull();
  });

  // accname: aria-labelledby beats aria-label — but a reference to nothing
  // names nothing, and then aria-label (or the default) applies.
  it("aria-labelledby beats aria-label on the wrapper; a dangling one is ignored", () => {
    const heading = document.createElement("h2");
    heading.id = "real-heading";
    heading.textContent = "Order";
    document.body.appendChild(heading);
    const ul = makeList(); // aria-label="Test list"
    ul.setAttribute("aria-labelledby", "missing real-heading");
    inst = Sorta11y.create(ul, { labels: LABELS });
    const wrap = ul.parentElement;
    const first = ul.children[0];
    first.focus();
    press(first, SPACE);
    expect(wrap.getAttribute("aria-labelledby")).toBe("missing real-heading");
    expect(wrap.getAttribute("aria-label")).toBeNull();
    press(first, SPACE);
    ul.setAttribute("aria-labelledby", "missing"); // now dangling
    first.focus();
    press(first, SPACE);
    expect(wrap.getAttribute("aria-labelledby")).toBeNull();
    expect(wrap.getAttribute("aria-label")).toBe("Test list");
    press(first, SPACE);
    ul.removeAttribute("aria-label"); // dangling reference, nothing else
    first.focus();
    press(first, SPACE);
    expect(wrap.getAttribute("aria-labelledby")).toBeNull();
    expect(wrap.getAttribute("aria-label")).toBe("Sortable list");
  });

  it("falls back to the localisable default name when the list is unnamed", () => {
    const ul = makeList();
    ul.removeAttribute("aria-label");
    inst = Sorta11y.create(ul, { labels: LABELS }); // LABELS has no applicationLabel → default
    const wrap = ul.parentElement;
    const first = ul.children[0];
    first.focus();
    press(first, SPACE);
    expect(wrap.getAttribute("role")).toBe("application");
    expect(wrap.getAttribute("aria-label")).toBe("Sortable list");
    expect(wrap.getAttribute("aria-label")).not.toBe(""); // non-empty name
  });

  it("destroy() unwraps: the list returns to its original parent, wrapper removed", () => {
    const ul = makeList();
    const local = Sorta11y.create(ul, { labels: LABELS });
    const wrap = ul.parentElement;
    expect(wrap.classList.contains("s11y-app")).toBe(true);
    local.destroy();
    expect(ul.parentElement).toBe(document.body);
    expect(wrap.isConnected).toBe(false);
    expect(ul.getAttribute("role")).toBeNull();
  });

  it("option('applicationRole', false) removes the wrapper live; true re-adds it", () => {
    const ul = makeList();
    inst = Sorta11y.create(ul, { labels: LABELS });
    expect(ul.parentElement.classList.contains("s11y-app")).toBe(true);
    inst.option("applicationRole", false);
    expect(ul.parentElement).toBe(document.body);
    inst.option("applicationRole", true);
    expect(ul.parentElement.classList.contains("s11y-app")).toBe(true);
  });

  it("turning keyboard off removes the wrapper; back on restores it and grabbing", () => {
    const ul = makeList();
    inst = Sorta11y.create(ul, { labels: LABELS });
    expect(ul.parentElement.classList.contains("s11y-app")).toBe(true);
    inst.option("keyboard", false);
    expect(ul.parentElement).toBe(document.body);
    inst.option("keyboard", true);
    expect(ul.parentElement.classList.contains("s11y-app")).toBe(true);
    const first = ul.children[0];
    first.focus();
    press(first, SPACE); // keydown handler re-attached
    expect(first.classList.contains("s11y-item--grabbed")).toBe(true);
  });

  it("wraps a list created while detached once it is attached and refreshed", () => {
    const ul = document.createElement("ul");
    ["a", "b"].forEach((id) => {
      const li = document.createElement("li");
      li.setAttribute("data-id", id);
      li.textContent = id;
      ul.appendChild(li);
    });
    inst = Sorta11y.create(ul, { labels: LABELS }); // detached: no parent yet
    expect(inst._appWrap).toBeNull();
    document.body.appendChild(ul);
    inst.refresh();
    expect(ul.parentElement.classList.contains("s11y-app")).toBe(true);
  });

  it("toggling applicationRole off during an active grab cancels it cleanly", () => {
    const ul = makeList();
    inst = Sorta11y.create(ul, { labels: LABELS });
    const first = ul.children[0];
    first.focus();
    press(first, SPACE); // grab (no-handle)
    expect(first.classList.contains("s11y-item--grabbed")).toBe(true);
    inst.option("applicationRole", false);
    expect(first.classList.contains("s11y-item--grabbed")).toBe(false); // grab released
    expect(ul.parentElement).toBe(document.body); // wrapper gone, no orphaned role
  });

  it("autoInit honours data-application-role='false'", () => {
    const ul = makeList();
    ul.setAttribute("data-sorta11y", "");
    ul.setAttribute("data-application-role", "false");
    const [created] = Sorta11y.autoInit();
    inst = created;
    expect(ul.parentElement).toBe(document.body);
  });

  // Regression: the pointer-click guard (which swallows the click a touch tap
  // synthesises) is scoped to the tapped item. A completed pointer tap sequence
  // on item A must NOT swallow a genuine keyboard activation on a *different*
  // item B. (A tap now picks up/drops — WCAG 2.5.7 — so we tap A twice to return
  // it to idle before activating B, keeping the guard stamped on A.)
  it("a pointer tap on one item does not swallow a keyboard pickup on another", () => {
    const ul = makeList({ handle: true });
    inst = Sorta11y.create(ul, { handle: ".drag-handle", labels: LABELS });
    const hA = handleOf(ul.children[0]);
    const hB = handleOf(ul.children[1]);
    const ptr = (type, target) =>
      target.dispatchEvent(
        new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }),
      );
    ptr("pointerdown", hA);
    ptr("pointerup", hA); // tap A → pick up
    expect(ul.children[0].classList.contains("s11y-item--grabbed")).toBe(true);
    ptr("pointerdown", hA);
    ptr("pointerup", hA); // tap A again → drop (guard stays stamped on A)
    expect(ul.children[0].classList.contains("s11y-item--grabbed")).toBe(false);
    // Immediately keyboard-activate B — A's per-item guard must not block it.
    activate(hB);
    expect(ul.children[1].classList.contains("s11y-item--grabbed")).toBe(true);
    expect(hB.getAttribute("aria-pressed")).toBe("true");
  });
});

// NVDA/JAWS decide browse vs focus mode only when a FOCUS EVENT arrives — and
// engines coalesce accessibility updates into diffs, so only a REAL focus
// move survives (a blur+refocus of the same node nets out to nothing;
// measured via AT-SPI). During a grab, focus therefore moves onto the list
// itself, inside the fresh role="application" region → the reader flips to
// focus mode; on drop it returns to the grab target with the region gone.
describe("sorta11y — screen-reader mode switch (focus moves to the list)", () => {
  it("grab moves focus onto the list while role=application is set", async () => {
    const ul = makeList({ handle: true });
    inst = Sorta11y.create(ul, { handle: ".drag-handle", labels: LABELS });
    const wrap = ul.parentElement;
    const handle = handleOf(ul.children[0]);
    handle.focus();
    const rolesAtFocus = [];
    ul.addEventListener("focus", () => {
      rolesAtFocus.push(wrap.getAttribute("role"));
    });
    activate(handle, 1); // AT press → grab
    expect(ul.children[0].classList.contains("s11y-item--grabbed")).toBe(true);
    expect(document.activeElement).toBe(ul);
    expect(ul.getAttribute("tabindex")).toBe("-1");
    // The focus event fired while the region was application.
    expect(rolesAtFocus).toContain("application");
    // The handle→list move must not trip the leaves-the-widget cancel
    // (its guard re-checks on a microtask — flush a couple of them).
    await Promise.resolve();
    await Promise.resolve();
    expect(ul.children[0].classList.contains("s11y-item--grabbed")).toBe(true);
    expect(handle.getAttribute("aria-pressed")).toBe("true");
  });

  it("drop returns focus to the grab target and sheds the list tabindex", () => {
    const ul = makeList({ handle: true });
    inst = Sorta11y.create(ul, { handle: ".drag-handle", labels: LABELS });
    const wrap = ul.parentElement;
    const handle = handleOf(ul.children[0]);
    handle.focus();
    activate(handle, 1); // grab (focus now on the list)
    activate(handle, 1); // drop
    expect(ul.children[0].classList.contains("s11y-item--grabbed")).toBe(false);
    expect(wrap.getAttribute("role")).toBeNull();
    expect(document.activeElement).toBe(handle);
    expect(ul.hasAttribute("tabindex")).toBe(false);
    expect(handle.getAttribute("aria-pressed")).toBe("false");
  });

  it("a consumer-set tabindex on the list survives the grab/drop cycle", () => {
    const ul = makeList({ handle: true });
    ul.setAttribute("tabindex", "0");
    inst = Sorta11y.create(ul, { handle: ".drag-handle", labels: LABELS });
    const handle = handleOf(ul.children[0]);
    handle.focus();
    activate(handle, 1); // grab
    activate(handle, 1); // drop
    expect(ul.getAttribute("tabindex")).toBe("0");
  });

  it("keyboard grab in no-handle mode moves focus to the list without cancelling", async () => {
    const ul = makeList();
    inst = Sorta11y.create(ul, { labels: LABELS });
    const first = ul.children[0];
    first.focus();
    press(first, SPACE); // grab from the keydown
    expect(first.classList.contains("s11y-item--grabbed")).toBe(true);
    expect(document.activeElement).toBe(ul);
    await Promise.resolve();
    await Promise.resolve();
    expect(first.classList.contains("s11y-item--grabbed")).toBe(true); // guard untripped
    // Arrows keep driving the grabbed item while focus sits on the list.
    press(ul, "ArrowDown");
    expect(ul.children[1]).toBe(first);
  });
});
