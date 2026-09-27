---
title: Keyboard
description: The grab / move / drop model — which keys do what, what gets announced, and where focus ends up.
---

sorta11y's keyboard layer is an explicit **grab / move / drop** interaction. An
item is picked up, moved while held, and then dropped or cancelled. There is no
"drag with the arrow keys" mode where a keypress silently commits a change.

## Keys

| Key                                              | Idle (nothing held)               | While an item is held                                                          |
| ------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------ |
| <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> | Move focus between items          | <kbd>Tab</kbd> is blocked; <kbd>Shift</kbd>+<kbd>Tab</kbd> cancels (see below) |
| <kbd>Space</kbd>                                 | Pick the focused item up          | Drop it here                                                                   |
| <kbd>Enter</kbd>                                 | Pick up (handle only, see below)  | Drop it here (handle only)                                                     |
| <kbd>↑</kbd> / <kbd>↓</kbd>                      | Left to the browser (page scroll) | Move the held item one position                                                |
| <kbd>Home</kbd> / <kbd>End</kbd>                 | Left to the browser               | Move the held item to the start / end                                          |
| <kbd>Esc</kbd>                                   | —                                 | Cancel and restore the original order                                          |

Every grab target is a **tab stop**, so <kbd>Tab</kbd> walks the list the way it
walks any other set of controls. Idle arrow keys are deliberately _not_
intercepted — the page still scrolls normally until something is actually held.

While an item is held, <kbd>Space</kbd> (and <kbd>Enter</kbd> with a handle)
drops it wherever focus sits in the list — on its handle, on the list itself
right after pickup, or on another item's handle. Holding <kbd>Space</kbd> or
<kbd>Enter</kbd> down counts as one press, so the key's auto-repeat never picks
up and drops over and over; a held arrow key, on the other hand, keeps moving
the item.

### <kbd>Enter</kbd> in detail

<kbd>Enter</kbd> behaves like <kbd>Space</kbd> **when there is a handle**, because
a handle is announced as a button and users expect <kbd>Enter</kbd> to activate a
button:

- A real `<button>` handle activates natively, and sorta11y picks up from the
  resulting `click`.
- A non-`<button>` handle promoted to `role="button"` picks up and drops on
  <kbd>Enter</kbd> as well.
- A **no-handle** `<li>` stays deliberately <kbd>Enter</kbd>-inert: it never
  grabs, and — importantly — never submits a surrounding form by accident.

### Controls inside a no-handle item

In a list without a handle, keys pressed inside a nested control — a link, a
button, a form field — are left to that control while nothing is held:
<kbd>Space</kbd> types a space into an input instead of grabbing the item, and
<kbd>Enter</kbd> still follows the link.

### Modifier keys cancel

Pressing any of the keys in the table above together with <kbd>Ctrl</kbd>,
<kbd>Alt</kbd>, <kbd>Meta</kbd> or <kbd>Shift</kbd> while an item is held
**cancels the grab** and restores the original order — <kbd>Shift</kbd>+<kbd>Tab</kbd>
included. The reasoning: a modified key is almost always a browser or
screen-reader shortcut, and the user should not end up with a half-finished
reorder because they triggered one.

### Automatic cancel

A grab is also cancelled — original order restored, the cancel announced,
`onEnd` fired — when something else takes over:

- a mouse, touch or pen press **outside** the list (a press inside it is a
  placement tap, see [Pointer & touch](./pointer-and-touch.md)),
- the mouse wheel or a window resize,
- the page being hidden (switching tabs),
- focus leaving the list — a dialog or a validation message taking it, say; the
  focus is left where it went,
- a grab or drag starting in another sorta11y list — only one item can be held
  at a time, page-wide.

Plain `scroll` events deliberately do not cancel a grab — see
[Known limitations](../reference/limitations.md). A grab picked up with a
**tap** is more forgiving about outside presses, the wheel and resizes, so a
pointer user can scroll to a distant drop target — see
[Pointer & touch](./pointer-and-touch.md#scrolling-while-an-item-is-held).

## What gets announced

Each step writes to the instance's polite live region:

| Moment    | Default English announcement                                                          |
| --------- | ------------------------------------------------------------------------------------- |
| Pick up   | "Picked up. _Item name_, Position 2 of 8. Use the arrow keys to move, Space to drop." |
| Each move | "Position 3 of 8."                                                                    |
| Drop      | "Dropped. _Item name_, Position 3 of 8."                                              |
| Cancel    | "Cancelled. _Item name_ back at Position 2 of 8."                                     |

Positions are **1-indexed** — "Position 3 of 8", not "index 2". The "of 8" part
can be dropped with `announceTotal: false`, and every string is replaceable, see
[Internationalisation](./i18n.md).

The item's name comes from its `aria-label`, its `data-label`, or its trimmed
text content (without the handle's own text) — in that order.

## Scrolling

Each keyboard move (arrows, <kbd>Home</kbd> / <kbd>End</kbd>), a tap placement
and a keyboard cancel that restores the order scroll the moved item into view —
minimally (`block: "nearest"`), and honouring the page's `scroll-padding` so a
sticky header doesn't cover it (see [Styling](./styling.md#sticky-headers)).
Pickup, drop and `sort()` never scroll the page.

## Instructions for screen readers

Each list gets a visually hidden instructions element wired up with
`aria-describedby`, so a screen-reader user hears how the widget works when they
first focus an item:

> Sortable. Press Space to pick up, then the arrow keys to move, Space to drop,
> Escape to cancel.

This text is part of the label set and can be replaced or translated like any
other announcement.

## Focus after a reorder

sorta11y reorders by moving the existing DOM nodes; it never re-creates items.
Focus stays on the element that had it — after a keyboard move, a pointer drag
or a programmatic `sort()` — so keyboard users keep their place and focus never
falls back to `<body>`.

Focus is tracked by element, not by `data-id`. If a framework re-renders the
list with **new** nodes, call `refresh()` and move focus to the new node
yourself — the library cannot know which fresh element stands in for the old
one.

At pickup, focus briefly moves onto the list itself so screen readers switch
into focus mode; it returns to the grab target on every move, on drop and on
cancel. See [Accessibility model](./accessibility.md).

When `refresh()` or `destroy()` strips a focused non-`<button>` grab target of
its `tabindex`, the target is anchored at `tabindex="-1"` until its next blur,
so focus stays put — no permanent markup change.

## Motion

Moves animate with a FLIP slide (`animation: 150`, `easing`). Under
`prefers-reduced-motion: reduce` the item is repositioned instantly instead —
handled both in the library's CSS and in its animation path, so it holds even if
you override the stylesheet. Set `animation: 0` to disable the slide for
everyone.

## Turning it off

`keyboard: false` detaches the whole layer — the keydown and click handlers come
off, the application wrapper is not engaged, and `aria-describedby` is removed so
nothing claims a keyboard interaction that no longer exists. It can be toggled at
runtime:

```js
list.option("keyboard", false);
```

:::caution
Disabling the keyboard layer leaves the list operable by pointer only, which
fails WCAG 2.1.1 (Keyboard) unless you provide another equivalent path. There is
almost never a good reason to switch it off.
:::

## Related

- [Pointer & touch](./pointer-and-touch.md) — the same model for mouse, touch and pen
- [Accessibility model](./accessibility.md) — why pickup rides a button's click
