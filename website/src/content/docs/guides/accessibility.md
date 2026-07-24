---
title: Accessibility model
description: The design rationale — grab targets, ARIA state, the temporary role="application" focus mode, and the live region.
---

This page records the _reasoning_ behind sorta11y's accessibility decisions, so
they can be reviewed, challenged and re-tested rather than taken on faith.
Measured screen-reader behaviour and the manual verification plan live in the
[AT test matrix](https://github.com/Hensga/sorta11y/blob/main/docs/at-test-matrix.md).

## Grab targets and ARIA state

Each grab target is a tab stop with an explicit **grab / move / drop**
interaction.

**With a drag handle (recommended)** the handle is a `<button>` exposing
`aria-pressed` — the richest state, and fully axe-clean.

**Without one**, the `<li>` stays a native listitem and the grab state is
announced via the live region instead. This is deliberate: `role="button"` is not
valid on an `<li>`, and `aria-pressed` requires `role="button"`. Rather than
break the list semantics to get a state attribute, sorta11y keeps the list a list
and moves the state into speech.

Intentionally **no** `aria-grabbed` / `aria-dropeffect` — both are deprecated and
unreliably supported.

## Screen-reader focus mode (`role="application"`)

NVDA and JAWS swallow <kbd>Space</kbd> and the arrow keys in their default
_browse mode_, so a custom widget's keys look dead to exactly the users who most
need them to work.

sorta11y follows the pattern GitHub uses for its own sortable lists, and MDN's
"scope it as small as possible, last resort" guidance for `role="application"`:

1. The list is wrapped in a **role-less** `<div class="s11y-app">`.
2. `role="application"` is toggled onto that wrapper **only for the duration of a
   grab**.
3. It is removed again on drop or cancel.

So the reader enters focus mode exactly when the arrow keys are needed, and the
idle list stays a fully readable list the rest of the time.

Pickup is initiated by the **handle button's activation** — a `click`, which
survives browse mode — rather than by a raw <kbd>Space</kbd> keydown. This is why
a real `<button>` handle is recommended for full screen-reader support.

Opt out with `applicationRole: false` (or `data-application-role="false"`). ARIA
requires application regions to be named; the wrapper mirrors the list's own
`aria-label` / `aria-labelledby`, falling back to the `applicationLabel` string
("Sortable list") when the list has neither.

:::note[The wrapper is persistent]
The `<div class="s11y-app">` stays in the DOM even when the role is not engaged —
only the `role` attribute is toggled. That extra DOM level can affect flex/grid
layouts; see [Known limitations](../reference/limitations.md).
:::

## The live region

Each instance owns **one** live region, `aria-live="polite"` by default and
configurable via the `liveness` option. It is inserted when the list is enhanced,
not when the first announcement happens — a region created and filled in the same
tick is frequently missed by screen readers.

Every committed change goes through it: keyboard pickups, moves, drops and
cancels, **and** their pointer equivalents. There is no path through the library
that changes the order silently.

## Pointer parity

The same grab / move / drop model is offered to a single pointer, including a
tap-to-pick-up alternative to dragging (WCAG 2.5.7). The full reasoning, and the
`clickToGrab` / `dragOnItem` / `dragOnItemTouch` trade-offs, are in
[Pointer & touch](./pointer-and-touch.md).

## What this model does not do

- It does not claim conformance that has not been measured. Three of the four
  planned AT combinations are still untested — see
  [Browser & AT support](../reference/support.md).
- It does not support nested lists, transfer between lists, or grid reordering.
  Those need a different interaction model to be accessible, not a wider version
  of this one.
