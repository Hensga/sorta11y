---
title: sorta11y
description: An accessible, zero-dependency vanilla-JS sortable list — keyboard reordering and pointer drag, with screen-reader announcements for every move.
---

**sorta11y** is the accessible, dependency-free alternative to drag-and-drop sort
libraries. It lets people reorder a vertical list with the **keyboard** (a
screen-reader-safe grab / move / drop model) as well as with the **mouse, touch
or pen**, and announces every change through an ARIA live region.

It progressively enhances a server-rendered `<ul><li>` list, so it degrades
gracefully and coexists with whatever else is already on the page. No framework,
no jQuery, no build step.

:::caution[Pre-release]
sorta11y is at `0.1.0-alpha`. Keyboard and pointer/touch drag are implemented and
unit/DOM-tested (Vitest + jsdom, with axe-core in the suite). An informal
NVDA + Chrome run passed the core scenarios on 2026-07-09; the three official
matrix runs are still open — see [Browser & AT support](./reference/support.md).
Install via the `alpha` tag and expect the API to still move.
:::

## What you get

- **Grab · move · drop** on the keyboard: <kbd>Space</kbd> to pick up, arrows to
  move, <kbd>Space</kbd> to drop, <kbd>Esc</kbd> to cancel.
- **The same model for a single pointer** — drag it, or tap to pick up and tap
  again to place. That tap path is the WCAG 2.5.7 alternative to dragging.
- **One polite live region** per instance, pre-inserted so the first
  announcement is never swallowed.
- **Announcements in your own wording** — labels are functions, so they
  interpolate positions and pluralise properly.
- **Focus restoration** by stable `data-id`, so focus never falls back to
  `<body>` after a reorder.
- **`prefers-reduced-motion`** honoured: instant reposition instead of a slide.
- **Zero runtime dependencies** and no build step required to use it.

## Where to start

| If you want to…                         | Go to                                                      |
| --------------------------------------- | ---------------------------------------------------------- |
| Get it into your project                | [Installation](./installation.md)                          |
| See the smallest working example        | [Quick start](./quick-start.md)                            |
| Understand the interaction model        | [Keyboard](./guides/keyboard.md)                           |
| Know what happens under a screen reader | [Accessibility model](./guides/accessibility.md)           |
| Look up an option or method             | [Options](./reference/options.md)                          |
| Try it before reading anything          | [Live playground](https://hensga.github.io/sorta11y/site/) |

## Why it exists

Popular sort libraries are powerful but **not keyboard- or
screen-reader-accessible** out of the box — SortableJS's accessibility gap has
been an open, frequently requested issue since 2017. sorta11y deliberately trades
"do everything" scope for one thing done well: **a single vertical list anyone
can reorder**, including keyboard and screen-reader users.

That focus is the point. If you need nested trees, multi-list transfer or grid
reordering, sorta11y is the wrong tool — and says so rather than shipping an
inaccessible version of it.
