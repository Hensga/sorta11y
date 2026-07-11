# Accessibility model — design rationale

The [README](../README.md) gives the short version; this document records the
full reasoning behind sorta11y's accessibility decisions so they can be
reviewed, challenged and re-tested. Measured screen-reader behaviour and the
manual verification plan live in the [AT test matrix](./at-test-matrix.md).

## Grab targets and ARIA state

Each grab target is a tab stop, with an explicit **grab / move / drop**
interaction. With a **drag handle** (recommended), the handle is a `button`
exposing `aria-pressed` — the richest, fully axe-clean state. Without one, the
`<li>` stays a native listitem and the grab state is announced via the live
region (`role="button"` is not valid on an `<li>`, and `aria-pressed` requires
`role="button"`). Intentionally _no_ deprecated `aria-grabbed` /
`aria-dropeffect`.

## Screen-reader focus mode (`role="application"`)

NVDA/JAWS swallow <kbd>Space</kbd> and the arrow keys in their default
_browse mode_, so a custom widget's keys look dead. sorta11y follows the
pattern GitHub uses for its own sortable list (and MDN's "scope it as small as
possible, last resort" guidance for `role="application"`): the list is wrapped
in a **role-less** `<div>`, and `role="application"` is toggled on **only for
the duration of a grab** — then removed on drop/cancel — so the reader enters
focus mode exactly when the arrow keys are needed and the idle list stays
fully readable. Pickup is initiated by the **handle button's activation** (a
`click`, which survives browse mode) rather than a raw <kbd>Space</kbd>
keydown; this is why a handle button is recommended for full screen-reader
support. Opt out with `applicationRole: false` (or
`data-application-role="false"`).

## Pointer & touch model

The same **grab / move / drop** model is available to a **single pointer**
(mouse, touch, or pen), so nobody is forced onto a drag-only path:

- **Drag** a grab target (the drag handle, or the item itself when no handle
  is configured) past a small threshold and release to drop — the item follows
  the pointer while displaced neighbours slide.
- **Tap** — press and release _without_ dragging — to **pick the item up**;
  then **tap it again** to drop it in place, or **tap another item** to move
  the held item into that slot and drop. <kbd>Esc</kbd> or moving focus out of
  the list cancels and restores the original order.

The tap alternative is the **WCAG 2.5.7 (Dragging Movements)** single-pointer
path: every reorder a drag can perform is also reachable without a dragging
gesture. Pointer drops **and** cancels announce through the same live region
as the keyboard path, so the "every change is announced" promise holds for the
mouse/touch layer too.

### `clickToGrab`

Opt out with **`clickToGrab: false`** — a plain click no longer picks an item
up, so the pointer can **only drag**. This removes the WCAG 2.5.7
single-pointer path (the keyboard still provides one), so leave it on unless a
drag-only pointer is genuinely required. It gates only the single-pointer
**tap** — a `<button>` handle's own keyboard activation (<kbd>Space</kbd> /
<kbd>Enter</kbd>) still picks up and drops, so the handle stays operable in a
screen reader's browse mode. The option is read live at tap time, so
`list.option("clickToGrab", false)` applies immediately.

### `dragOnItem`

With a handle configured, the handle is normally the **only** pointer target.
Opt in to **`dragOnItem: true`** to widen the _pointer_ surface to the whole
item: drags, tap pickups and placement taps may then start anywhere on the
item (a bigger target — WCAG 2.5.8 — while the handle stays the visible
affordance). The accessibility contract does not move: the handle remains the
only tab stop, carries `aria-pressed`, and stays the browse-mode pickup for
screen readers — keyboard and AT behavior are byte-for-byte unchanged. Presses
on nested interactive controls (links, buttons, form fields) inside an item
keep their native behavior and never grab. Combines with `clickToGrab: false`
(whole-item drag without tap pickup) and toggles live via
`list.option("dragOnItem", …)`. No-op without a handle (the item is already
the target). Note that whole-item dragging makes text inside items harder to
select with the mouse — the same trade-off as no-handle mode.

### `dragOnItemTouch` — touch and pen

On touch screens, `dragOnItem` deliberately stays **tap-only** on the item
body: the body keeps its native `touch-action`, so a long list still scrolls
under a finger — a whole-item touch drag surface would otherwise trap the page
(nothing left to pan on). Touch taps on the body still pick up and place (the
WCAG 2.5.7 single-pointer alternative, with the whole item as the target), and
a touch **drag** uses the handle. The same applies to pens: `touch-action`
governs stylus input in every major engine (a pen pans the page just like a
finger), so a pen is also tap-only on the body and drags via the handle. The
mouse always drags the whole item — decided per press via
`PointerEvent.pointerType`, so hybrid devices get both. Opt in to
**`dragOnItemTouch: true`** to widen the touch/pen drag surface to the whole
item anyway (`touch-action: none` on every item) — only advisable for short
lists that never need to scroll. Toggles live via
`list.option("dragOnItemTouch", …)`.

## `fromSelect()` details

By default every option is kept `selected` (so a plain submit sends them all
in order) and a handle `<button>` is generated for full screen-reader
support — pass `handle: false` for a handle-less list. The handle sits at the
row start by default; `handlePosition: "right"` moves it to the end (easier to
reach by thumb on touch, and the row reads content-first) — the button also
gets a `s11y-handle--left` / `s11y-handle--right` modifier class to style
against. Consumer-specific styling stays out of the library via the
`renderItem(li, option)` hook.

## Limitations, in depth

- **Browse-mode pickup needs a handle button.** The click that survives browse
  mode comes from activating a `<button>`. A no-handle list is still fully
  keyboard-operable, but a screen-reader user must switch to focus mode
  manually to pick an item up — so a handle is recommended for AT support. A
  non-`<button>` handle stays keyboard-operable via <kbd>Space</kbd>, but does
  not get the browse-mode click pickup — prefer a real `<button>`.
- **The persistent `.s11y-app` wrapper.** The `role="application"` focus mode
  wraps the list in a persistent `<div class="s11y-app">` (the role can't live
  on the `<ul>`). If the list was a direct flex/grid child or is targeted by
  `parent > ul` / sibling selectors, that extra level shifts layout — style
  `.s11y-app` (or the list) to compensate, or opt out with
  `applicationRole: false`.
- **Re-announcing identical text.** Identical consecutive announcements use a
  synchronous clear-then-set; some screen readers may coalesce it. A robust
  re-announce (async gap or dual-region ping-pong) is planned, to be validated
  against real AT.
- **Scroll-based auto-cancel** of a keyboard grab is intentionally deferred:
  programmatic focus can scroll and would falsely cancel. `wheel` still
  cancels.
- **`touch-action` on no-handle lists.** Grab targets use
  `touch-action: none`, so for a no-handle list the items themselves won't
  scroll the page on touch — use a handle for long, touch-scrollable lists.
