---
title: Known limitations
description: What sorta11y does not do well yet, and the reasoning behind each trade-off.
---

Every one of these is a deliberate trade-off or an acknowledged gap, not an
oversight. They are listed here rather than buried, because a library that claims
accessibility should be specific about where it falls short.

## Browse-mode pickup needs a handle button

The click that survives a screen reader's browse mode comes from activating a
real `<button>`. A no-handle list is still fully keyboard-operable, but a
screen-reader user has to switch to focus mode manually before they can pick an
item up.

A non-`<button>` handle (promoted to `role="button"`) stays keyboard-operable
via <kbd>Space</kbd> and <kbd>Enter</kbd>. In principle, a screen reader's
browse-mode activation reaches it through the same click path as a button, but
that has not been verified with a real screen reader yet. **Prefer a real
`<button>`.**

## `clickToGrab: false` blocks browse-mode pickup in Chromium

A screen reader's activation of a handle button does not arrive as a keyboard
click. Chromium prefixes it with a synthetic pointer tap, which makes it
indistinguishable from a mouse tap — and `clickToGrab: false` switches taps off.
In Chromium, browse-mode users then have to switch to focus mode before they can
pick an item up. Firefox sends the activation without pointer events and is not
affected; Safari has not been measured yet. Keep `clickToGrab` on unless you
really need a drag-only pointer.

## App changes during a grab

If the app adds or removes items while one is held (and calls `refresh()`), a
cancel keeps those changes. If it only **reorders** existing items mid-grab, a
cancel restores the order from the moment of pickup, undoing the app's reorder.

## Tap holds and left-side scrollbars

A tap hold tells a scrollbar press apart from a tap outside the list, so that
scrolling doesn't release the hold. A scrollbar on the left — as in some
right-to-left layouts — is not recognised as one, so clicking it without
dragging may release the hold.

## Focus across framework re-renders

sorta11y keeps focus on the element that had it, which holds for its own
reorders and `sort()`. If a framework re-renders the list with **new** nodes,
`refresh()` picks them up, but focus is not moved to the replacement for the
previously focused item — the app has to restore it.

## The persistent `.s11y-app` wrapper

The `role="application"` focus mode wraps the list in a persistent
`<div class="s11y-app">` — the role cannot live on the `<ul>` itself without
destroying the list semantics.

If the list was a direct flex or grid child, or is targeted by `parent > ul` or
sibling selectors, that extra level shifts your layout. Style `.s11y-app` to
compensate (see [Styling](../guides/styling.md)), or opt out with
`applicationRole: false` and accept the browse-mode cost.

## Re-announcing identical text

Identical consecutive announcements use a synchronous clear-then-set. Some screen
readers coalesce that into a single utterance, so moving an item back and forth
between two positions can go quiet.

A more robust re-announce — an async gap, or dual-region ping-pong — is planned,
but it needs validating against real AT before it ships. Guessing at screen-reader
timing without measuring it is how these bugs get written in the first place.

## Scroll does not auto-cancel a keyboard grab

Deferred on purpose: programmatic focus can scroll the page, and a naive
scroll-cancel would abort grabs the user never abandoned. `wheel` still cancels,
which covers the intentional case. A grab picked up with a tap is not cancelled
by `wheel` or `resize` at all, so a pointer user can scroll to a distant drop
target.

## `touch-action` on no-handle lists

Grab targets use `touch-action: none`, so on a **no-handle** list the items
themselves will not scroll the page under a finger. For long, touch-scrollable
lists, configure a handle. See
[Pointer & touch](../guides/pointer-and-touch.md).

## Out of scope

These are not "not yet" — they are "not this library":

- **Nested / tree lists.** An accessible tree reorder needs a different
  interaction model, not a wider version of this one. A sortable list placed
  inside another list's item is kept independent — keys and presses inside the
  inner list never operate the outer one — but items cannot move between the
  levels.
- **Transfer between lists.** Same reason.
- **Grid or horizontal reordering.** The announcement model is built around a
  single linear position ("Position 3 of 8"), which does not survive two
  dimensions.

If you need one of those, sorta11y is the wrong tool — and it would rather say so
than ship an inaccessible version of it.
