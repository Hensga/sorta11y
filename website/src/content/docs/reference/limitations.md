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

A non-`<button>` handle stays keyboard-operable via <kbd>Space</kbd>, but does not
get the browse-mode click pickup. **Prefer a real `<button>`.**

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
which covers the intentional case.

## `touch-action` on no-handle lists

Grab targets use `touch-action: none`, so on a **no-handle** list the items
themselves will not scroll the page under a finger. For long, touch-scrollable
lists, configure a handle. See
[Pointer & touch](../guides/pointer-and-touch.md).

## Out of scope

These are not "not yet" — they are "not this library":

- **Nested / tree lists.** An accessible tree reorder needs a different
  interaction model, not a wider version of this one.
- **Transfer between lists.** Same reason.
- **Grid or horizontal reordering.** The announcement model is built around a
  single linear position ("Position 3 of 8"), which does not survive two
  dimensions.

If you need one of those, sorta11y is the wrong tool — and it would rather say so
than ship an inaccessible version of it.
