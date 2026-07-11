import { describe, it, expect, afterEach } from "vitest";
import Sorta11y from "../src/sorta11y.js";
import { makeList, LABELS, liveRegionOf } from "./helpers/dom.js";

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

describe("sorta11y — initialisation / enhancement", () => {
  it("registers the instance and is idempotent", () => {
    const ul = makeList();
    inst = Sorta11y.create(ul, { labels: LABELS });
    expect(Sorta11y.get(ul)).toBe(inst);
    expect(Sorta11y.create(ul, { labels: LABELS })).toBe(inst); // same instance, not re-init
  });

  it("marks the container as a list", () => {
    const ul = makeList();
    inst = Sorta11y.create(ul, { labels: LABELS });
    expect(ul.getAttribute("role")).toBeNull(); // native <ul> already implies list — no redundant role
    expect(ul.classList.contains("s11y-list")).toBe(true);
  });

  it("creates one empty, polite, atomic live region right after the list", () => {
    const ul = makeList();
    inst = Sorta11y.create(ul, { labels: LABELS });
    const live = liveRegionOf(ul);
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.getAttribute("aria-atomic")).toBe("true");
    expect(live.textContent).toBe(""); // pre-inserted empty so the first announce is not swallowed
    expect(live.classList.contains("s11y-visually-hidden")).toBe(true);
  });

  it("makes every item a tab stop (Tab/Shift+Tab navigates)", () => {
    const ul = makeList({ count: 4 });
    inst = Sorta11y.create(ul, { labels: LABELS });
    const tabindexes = Array.from(ul.children).map((li) =>
      li.getAttribute("tabindex"),
    );
    expect(tabindexes).toEqual(["0", "0", "0", "0"]);
  });

  it("enhances each grab target with focus + ARIA (no-handle stays a listitem)", () => {
    const ul = makeList();
    inst = Sorta11y.create(ul, { labels: LABELS });
    const first = ul.children[0];
    // A no-handle <li> keeps its native listitem role — role=button is not valid
    // on an <li> (and aria-pressed needs role=button), so neither is set.
    expect(first.getAttribute("role")).toBeNull();
    expect(first.getAttribute("aria-pressed")).toBeNull();
    expect(first.getAttribute("tabindex")).toBe("0");
    expect(first.getAttribute("draggable")).toBe("false");
    // aria-keyshortcuts is intentionally NOT set: those are operation keys
    // (mostly no-ops when idle), and the aria-describedby instructions element
    // already conveys them without the per-item attribute verbosity.
    expect(first.getAttribute("aria-keyshortcuts")).toBeNull();
    const describedby = first.getAttribute("aria-describedby");
    expect(document.getElementById(describedby).textContent).toBe("INSTR");
  });

  it("handle mode: a native button handle carries aria-pressed, item stays a listitem", () => {
    const ul = makeList({ handle: true });
    inst = Sorta11y.create(ul, { handle: ".drag-handle", labels: LABELS });
    const item = ul.children[0];
    const handle = item.querySelector(".drag-handle");
    expect(item.getAttribute("role")).toBeNull(); // native <li> stays an implicit listitem
    expect(handle.tagName).toBe("BUTTON"); // native button — no redundant role="button"
    expect(handle.getAttribute("role")).toBeNull();
    expect(handle.getAttribute("aria-pressed")).toBe("false");
    expect(handle.getAttribute("tabindex")).toBe("0");
  });

  it("no-handle non-<li> items get role=listitem so the list role is not empty", () => {
    // A div container with no handle: the container gets role="list", so each
    // row must carry role="listitem" — otherwise a list with zero listitems.
    const container = document.createElement("div");
    ["a", "b", "c"].forEach((id) => {
      const row = document.createElement("div");
      row.className = "row";
      row.setAttribute("data-id", id);
      row.textContent = id;
      container.appendChild(row);
    });
    document.body.appendChild(container);
    inst = Sorta11y.create(container, {
      itemSelector: "> .row",
      labels: LABELS,
    });
    expect(container.getAttribute("role")).toBe("list");
    const rows = Array.from(container.querySelectorAll(".row"));
    expect(rows.length).toBe(3);
    rows.forEach((row) => {
      expect(row.getAttribute("role")).toBe("listitem");
    });
  });

  it("destroy() removes all attributes, the live region, and the registration", () => {
    const ul = makeList();
    const local = Sorta11y.create(ul, { labels: LABELS });
    const live = liveRegionOf(ul);
    local.destroy();
    expect(Sorta11y.get(ul)).toBeNull();
    expect(ul.getAttribute("role")).toBeNull();
    expect(ul.children[0].getAttribute("role")).toBeNull();
    expect(ul.children[0].getAttribute("tabindex")).toBeNull();
    expect(ul.children[0].getAttribute("aria-pressed")).toBeNull();
    expect(live.isConnected).toBe(false);
  });

  it("destroy() keeps focus on a focused no-handle item (does not drop to <body>)", () => {
    // applicationRole:false so there is no wrapper to reparent the list on
    // teardown — isolating the tabindex handling: _cleanupItem must NOT strip
    // tabindex from the focused item (which would drop focus to <body>); it
    // anchors it at tabindex="-1" instead so the reading position survives.
    const ul = makeList();
    const local = Sorta11y.create(ul, {
      labels: LABELS,
      applicationRole: false,
    });
    const item = ul.children[0];
    item.focus();
    expect(document.activeElement).toBe(item);
    local.destroy();
    expect(document.activeElement).toBe(item); // focus retained, not <body>
    expect(item.getAttribute("tabindex")).toBe("-1"); // anchored, sheds on blur
  });

  it("destroy() with the default applicationRole restores focus after the unwrap reparent", () => {
    // With applicationRole:true (the default) the list is wrapped in the
    // s11y-app <div>; destroy() unwraps it, and reparenting the <ul> blurs a
    // focused descendant to <body>. destroy() must restore focus to the item
    // so a keyboard user's reading position survives teardown in the default
    // config too — not only when applicationRole is disabled.
    const ul = makeList();
    const local = Sorta11y.create(ul, { labels: LABELS }); // applicationRole defaults to true
    const item = ul.children[0];
    item.focus();
    expect(document.activeElement).toBe(item);
    local.destroy();
    expect(document.activeElement).toBe(item); // focus restored after the unwrap, not <body>
  });
});
