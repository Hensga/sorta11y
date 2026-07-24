---
title: Keyboard
description: The grab / move / drop model — which keys do what, what gets announced, and where focus ends up.
---

sorta11y's keyboard layer is an explicit **grab / move / drop** interaction. An
item is picked up, moved while held, and then dropped or cancelled. There is no
"drag with the arrow keys" mode where a keypress silently commits a change.

## Keys

| Key                                              | Idle (nothing held)               | While an item is held                 |
| ------------------------------------------------ | --------------------------------- | ------------------------------------- |
| <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> | Move focus between items          | Blocked — focus can't leave mid-grab  |
| <kbd>Space</kbd>                                 | Pick the focused item up          | Drop it here                          |
| <kbd>Enter</kbd>                                 | Pick up (handle only, see below)  | Drop it here (handle only)            |
| <kbd>↑</kbd> / <kbd>↓</kbd>                      | Left to the browser (page scroll) | Move the held item one position       |
| <kbd>Home</kbd> / <kbd>End</kbd>                 | Left to the browser               | Move the held item to the start / end |
| <kbd>Esc</kbd>                                   | —                                 | Cancel and restore the original order |

Every grab target is a **tab stop**, so <kbd>Tab</kbd> walks the list the way it
walks any other set of controls. Idle arrow keys are deliberately _not_
intercepted — the page still scrolls normally until something is actually held.

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

### Modifier keys cancel

Any modified keystroke while an item is held (<kbd>Ctrl</kbd>, <kbd>Alt</kbd>,
<kbd>Meta</kbd>, <kbd>Shift</kbd> + key) **cancels the grab** and restores the
original order. The reasoning: a modified key is almost always a browser or
screen-reader shortcut, and the user should not end up with a half-finished
reorder because they triggered one.

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
text content — in that order.

## Instructions for screen readers

Each list gets a visually hidden instructions element wired up with
`aria-describedby`, so a screen-reader user hears how the widget works when they
first focus an item:

> Sortable. Press Space to pick up, then the arrow keys to move, Space to drop,
> Escape to cancel.

This text is part of the label set and can be replaced or translated like any
other announcement.

## Focus after a reorder

When items move, the DOM nodes move with them — which normally throws focus back
to `<body>`. sorta11y restores focus to the moved item by its stable `data-id`
(configurable via `dataIdAttr`) after the reorder, so keyboard users keep their
place.

If the item is a non-`<button>` grab target that would otherwise lose
focusability, it is temporarily anchored at `tabindex="-1"` and the attribute is
shed again afterwards — no permanent markup change.

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
