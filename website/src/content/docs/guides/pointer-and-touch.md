---
title: Pointer & touch
description: Drag or tap — the single-pointer model, the WCAG 2.5.7 alternative, and the options that widen the drag surface.
---

The **grab / move / drop** model is available to a single pointer too — mouse,
touch or pen — so nobody is forced onto a drag-only path.

## Two ways to move an item

**Drag.** Press a grab target (the handle, or the item itself when no handle is
configured), move past a small threshold, release to drop. The item follows the
pointer while displaced neighbours slide out of the way. Whatever element in the
list had focus keeps it through the drag, and through a cancelled one.

**Tap.** Press and release _without_ dragging to **pick the item up**. Then tap
it again to drop it in place, or tap another item to move the held item into that
slot and drop. While it is held, the item behaves like a keyboard grab — the
arrow keys move it, <kbd>Esc</kbd> cancels — except that it lets you scroll (see
below).

That tap path is the **WCAG 2.5.7 (Dragging Movements)** single-pointer
alternative: every reorder a drag can perform is also reachable without a
dragging gesture. Pointer drops **and** cancels announce through the same live
region as the keyboard path, so "every change is announced" holds for the pointer
layer too. Drags and taps report `source: "pointer"` in the
[event object](../reference/options.md#source) — a tap pickup followed by a
keyboard drop reports `"pointer"` for the pickup and `"keyboard"` for the drop.

### Scrolling while an item is held

To reach a drop target that is off-screen, a tap hold survives scrolling, even
when the scroll starts outside the list: a touch scroll, dragging or clicking a
scrollbar, the mouse wheel, and window resizes (a mobile browser's collapsing
address bar fires one).

The hold is released — the original order restored — only by a real tap or
click **outside** the list, judged when that pointer is released: a press the
browser takes over for scrolling, or one that moves 10 px or more, counts as
scrolling and keeps the hold. Focus leaving the list and switching tabs still
cancel it. With a mouse, a click on page content outside the list often cancels
a little earlier, on the press, because it moves focus out of the list.

## Cancelling a drag

A drag in progress is cancelled — the item slides back, the original order is
restored, the cancel is announced and `onEnd` fires — when:

- <kbd>Esc</kbd> is pressed,
- the browser takes the pointer over (`pointercancel` — typically a touch that
  turns into a scroll),
- the release got lost: a mouse or pen reports no button held mid-drag (released
  outside the window),
- the window loses focus — switching apps, or an `alert()` opening mid-drag —
  or the page is hidden (switching tabs),
- the drag layer is torn down by `destroy()` or `option("pointer", false)`.

If the app removes the dragged row and calls `refresh()` mid-drag, the drag
ends without a revert: `onEnd` fires with `newIndex: -1` and
`source: "pointer"`, and if the row held focus, focus moves to the row now in
its slot. A press that had not become a drag yet just ends, with no event.

A press that never crossed the drag threshold moved nothing, so it simply ends
without an announcement.

## `clickToGrab`

`clickToGrab: true` (the default) is what enables the tap path. Setting it to
`false` means a plain click no longer picks anything up — the pointer can **only
drag**.

```js
Sorta11y.create(el, { handle: ".drag-handle", clickToGrab: false });
```

:::caution
Turning it off removes the WCAG 2.5.7 single-pointer path for pointer users. The
keyboard still provides one, so the page is not automatically non-conformant, but
leave it on unless a drag-only pointer is genuinely required.
:::

It gates **only** the single-pointer tap. A `<button>` handle's own keyboard
activation (<kbd>Space</kbd> / <kbd>Enter</kbd>) still picks up and drops, so the
handle stays operable from a screen reader's browse mode. The option is read live
at tap time, so `list.option("clickToGrab", false)` applies immediately.

## `dragOnItem` — a bigger pointer target

With a handle configured, the handle is normally the **only** pointer target.
`dragOnItem: true` widens the _pointer_ surface to the whole item: drags, tap
pickups and placement taps may then start anywhere on the item. The handle stays
the visible affordance, but the target grows — the WCAG 2.5.8 (Target Size)
argument.

The accessibility contract does not move:

- the handle remains the **only tab stop**,
- it carries `aria-pressed`,
- it stays the browse-mode pickup for screen readers.

Keyboard and AT behaviour are byte-for-byte unchanged. Presses on nested
interactive controls (links, buttons, form fields) inside an item keep their
native behaviour and never grab.

It combines with `clickToGrab: false` (whole-item drag without tap pickup) and
toggles live via `list.option("dragOnItem", …)`. It is a no-op without a
handle — there, the item is already the target.

:::note
Whole-item dragging makes text inside items harder to select with the mouse —
the same trade-off as running without a handle at all.
:::

## `dragOnItemTouch` — touch and pen

On touch screens, `dragOnItem` deliberately stays **tap-only** on the item body.
The body keeps its native `touch-action`, so a long list still scrolls under a
finger — a whole-item touch drag surface would otherwise trap the page with
nothing left to pan on.

So on touch, with `dragOnItem: true`:

- taps on the body still pick up and place (the WCAG 2.5.7 alternative, with the
  whole item as the target),
- a touch **drag** uses the handle.

The same applies to pens: `touch-action` governs stylus input in every major
engine, so a pen is also tap-only on the body and drags via the handle. The
**mouse always drags the whole item** — decided per press via
`PointerEvent.pointerType`, so hybrid devices get both behaviours.

`dragOnItemTouch: true` widens the touch/pen drag surface to the whole item
anyway, by setting `touch-action: none` on every item.

:::danger[Scroll trap]
`touch-action: none` on every item means the list cannot be panned by touching
its items. Only opt in for short lists that never need to scroll — otherwise a
touch user can get stuck on a list that fills the screen.
:::

## No-handle lists on touch

Grab targets use `touch-action: none`. On a list **without** a handle, the items
themselves are the grab targets, so touching an item won't scroll the page. For
long, touch-scrollable lists, configure a handle.

## Turning it off

`pointer: false` detaches the drag layer entirely; the keyboard layer keeps
working. Toggling it live re-applies the items' `touch-action`:

```js
list.option("pointer", false);
```

## Related

- [Keyboard](./keyboard.md) — the same model on the keyboard
- [Accessibility model](./accessibility.md) — the reasoning behind the pointer design
- [Options](../reference/options.md) — the full list
