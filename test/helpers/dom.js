// Shared test helpers: build a server-rendered list, dispatch keys, and provide
// DETERMINISTIC label functions so assertions test the announce *mechanism*
// (1-indexed position + total), independent of the built-in label wording.

/**
 * Build a `<ul>` of `count` items (data-id a,b,c… / text A,B,C…) in the body.
 * `handleTag` defaults to the recommended native `<button>`; pass `"span"` to
 * exercise a non-button handle (still promoted to role="button" by the library).
 */
export function makeList({
  count = 4,
  handle = false,
  handleTag = "button",
} = {}) {
  const ul = document.createElement("ul");
  ul.setAttribute("aria-label", "Test list");
  ["a", "b", "c", "d", "e", "f"].slice(0, count).forEach((id, i) => {
    const li = document.createElement("li");
    li.setAttribute("data-id", id);
    if (handle) {
      // A native <button> is the recommended handle: its activation fires a click
      // that survives a screen reader's browse mode (the pickup path). A non-
      // button handle (handleTag: "span") stays keyboard-operable via Space.
      const h = document.createElement(handleTag);
      if (handleTag === "button") h.type = "button";
      h.className = "drag-handle";
      h.textContent = "::";
      li.appendChild(h);
      li.appendChild(document.createTextNode(String.fromCharCode(65 + i)));
    } else {
      li.textContent = String.fromCharCode(65 + i);
    }
    ul.appendChild(li);
  });
  document.body.appendChild(ul);
  return ul;
}

// A real key goes to whatever holds focus, not to the element a test names —
// and a grab moves focus onto the list, so the difference matters. Fall back
// to the given target only when nothing in particular is focused.
function keyTarget(fallback) {
  const active = document.activeElement;
  return active && active !== document.body ? active : fallback;
}

/**
 * Press a key the way a browser delivers it and return the keydown (for
 * defaultPrevented). The keydown goes to the focused element (`target` is the
 * fallback when focus is on <body>). A focused native <button> whose keydown
 * was not prevented activates like the engines do: Enter clicks on the
 * keydown; Space clicks on the keyup, and only when the keyup lands on the
 * same button (Chromium/WebKit/current Gecko track that via :active). A
 * `repeat: true` press models a held key's auto-repeat: a keydown with no keyup.
 */
export function press(target, key, opts = {}) {
  const init = { key, bubbles: true, cancelable: true, ...opts };
  const el = keyTarget(target);
  const down = new KeyboardEvent("keydown", init);
  el.dispatchEvent(down);
  const activates =
    !down.defaultPrevented && el.tagName === "BUTTON" && !el.disabled;
  if (activates && key === "Enter") activate(el);
  if (opts.repeat) return down; // the key is still held: no keyup yet
  const upEl = keyTarget(el);
  upEl.dispatchEvent(new KeyboardEvent("keyup", init));
  if (activates && key === SPACE && upEl === el) activate(el);
  return down;
}

export const SPACE = " ";

/**
 * Dispatch a keyboard-style activation click (`detail: 0`). This is how a
 * <button> reports Enter/Space activation to JS — crucially, it still fires when
 * a screen reader is in browse mode, unlike a raw Space keydown. A real mouse
 * click reports `detail >= 1`, which the library ignores for keyboard pickup.
 */
export function activate(target, detail = 0) {
  const ev = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0,
    detail,
  });
  target.dispatchEvent(ev);
  return ev;
}

/** Deterministic labels — assert these, never the built-in defaults. */
export const LABELS = {
  instructions: "INSTR",
  grabbed: (c) => `GRAB ${c.itemLabel} ${c.position}/${c.total}`,
  moved: (c) => `MOVE ${c.position}/${c.total}`,
  dropped: (c) => `DROP ${c.position}/${c.total}`,
  cancelled: (c) => `CANCEL ${c.position}/${c.total}`,
};

/**
 * The live region for a list, whether or not it is wrapped in the application
 * region. The regions live OUTSIDE the s11y-app wrapper (a live region nested in
 * a role="application" region announces inconsistently across AT), so resolve
 * from the wrapper's next sibling when wrapped, else from the list's.
 */
export function liveRegionOf(ul) {
  const parent = ul.parentElement;
  const anchor = parent && parent.classList.contains("s11y-app") ? parent : ul;
  return anchor.nextElementSibling;
}

/** The data-id order currently in the DOM under `ul`. */
export function domOrder(ul) {
  return Array.from(ul.children)
    .filter((c) => c.hasAttribute("data-id"))
    .map((c) => c.getAttribute("data-id"));
}

/** The grab target for an item (handle if present, else the item itself). */
export function grabOf(item, handleSelector) {
  return handleSelector ? item.querySelector(handleSelector) : item;
}
