# AT test matrix

The assistive-technology combinations sorta11y is verified against by hand —
the three most widely used screen-reader stacks. The automated axe-core checks
complement this matrix but do **not** replace it: live-region timing varies per
screen reader and browser and cannot be fully automated.

## Combinations

| #   | Screen reader | Browser | OS      | Status    |
| --- | ------------- | ------- | ------- | --------- |
| 1   | NVDA          | Firefox | Windows | ☐ pending |
| 2   | JAWS          | Chrome  | Windows | ☐ pending |
| 3   | VoiceOver     | Safari  | macOS   | ☐ pending |

## Test scenarios (per combination)

Each combination runs every scenario on its own; results go into the
[results log](#results-log) below.

| #   | Scenario                              | Expected                                                                                                                                                                            |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Walk the list (Tab)                   | **Every** item is a tab stop (Tab/Shift+Tab); the focused grab target is announced with its name and the instructions (`aria-describedby`).                                         |
| S2  | Pick up (Space/Enter)                 | In **browse mode**, the handle button picks up without a manual mode switch; "picked up" is announced with the arrow-key hint; `aria-pressed=true`.                                 |
| S3  | Move (↑/↓)                            | The new position is announced after every move; focus stays on the moved item.                                                                                                      |
| S4  | To the edge (Home/End)                | Jumps to the start/end with the correct position announced.                                                                                                                         |
| S5  | Drop (Space/Enter)                    | "Dropped … Position X of Y" is announced; `aria-pressed=false`; the order is committed (`onChange`).                                                                                |
| S6  | Cancel (Esc)                          | The original order is restored; a matching announcement; focus back on the item.                                                                                                    |
| S7  | Auto-cancel                           | A mouse/touch press outside the list, the mouse wheel or a resize (keyboard grabs only), switching tabs or focus leaving the list during a grab → a clean cancel, no "stuck" state. |
| S8  | Focus kept                            | After a reorder, focus stays on the same element (the moved item) and does not fall back to `<body>`.                                                                               |
| S9  | No swallowed or doubled announcements | The first announcement after init is not swallowed; identical consecutive texts are re-announced reliably.                                                                          |
| S10 | Focus mode only while an item is held | Idle, the list reads normally (browse mode); `role="application"` is on the wrapper **only during** a grab and is removed again after drop/cancel.                                  |

## Automated checks (axe-core)

`test/axe.test.js` runs **axe-core** against the enhanced list (idle, during a
grab, and in handle mode) as part of the CI suite. Layout-dependent rules
(colour contrast) need a real renderer and are disabled under jsdom — contrast
and real screen-reader behaviour stay with this manual matrix.

**ARIA decision from the axe counter-test:** `role="button"` is not valid on an
`<li>` (inside a `<ul>`), and `aria-pressed` requires `role="button"`. Hence:

- **With a handle** (recommended): the `<ul>` is a list, each `<li>` a
  listitem, and the handle a button with `aria-pressed` — fully axe-clean and
  the richest screen-reader state.
- **Without a handle**: the `<li>` stays a native listitem (focusable, with the
  `aria-describedby` instructions); the grab state is carried by the live region
  and the `--grabbed` class (no `aria-pressed`). Also axe-clean.

**Focus mode / `role="application"`:** NVDA and JAWS swallow Space and the
arrow keys in browse mode. Following the pattern of GitHub's own sortable lists
and MDN's "as small as possible, last resort" guidance, sorta11y switches
`role="application"` on a wrapping `<div>` **only during an active grab** (not
on the `<ul>`, where it would be invalid and destroy the listitem semantics)
and off again after drop/cancel. Pickup runs through the **handle button's
activation** (a `click`, which also arrives in browse mode), not through a raw
Space `keydown`. Opt out with `applicationRole: false` or
`data-application-role="false"`. axe stays clean idle **and** mid-grab (test:
`test/application.test.js`).

> **Verify manually (S2/S3):** the live region sits **outside** the
> application wrapper (as its next sibling), because NVDA and JAWS can handle
> live regions inside an active application region inconsistently. Check
> explicitly that the "picked up" / "moved" announcements actually arrive in
> focus mode — not just the focus change.

**Measured (2026-07-08, AT-SPI "press" against both engines — the same engine
path NVDA/JAWS drive on Windows through IAccessible2/UIA):** a screen reader's
activation of a handle button does **not** arrive as a keyboard click
(`detail 0`), but as:

- **Chromium:** `pointerdown(0) → mousedown(0) → pointerup(0) → mouseup(0) →
click(detail 1)` — the synthetic pointer sequence makes the activation
  indistinguishable from a real mouse tap.
- **Gecko:** `mousedown(1) → mouseup(1) → click(detail 1)` — no pointer
  events.

Pickup therefore does not require `detail === 0`: a click counts as an
activation unless recent pointer activity on the same item explains it.
Regression tests replay both measured sequences (`test/pointer.test.js`,
"assistive-technology activation clicks"). The same click path should also give
a `<span role="button">` handle browse-mode pickup — verify manually.
Limitation: with `clickToGrab: false`, browse-mode pickup stays blocked in
Chromium (the AT activation looks like a mouse tap there); users switch to
focus mode instead.

**Mode switch via a focus move (2026-07-09, after manual NVDA verification of
S3):** NVDA re-evaluates browse vs focus mode only on **focus events**. At
pickup, though, focus already sits on the grab target — a plain `focus()` is a
no-op, and a `blur()` + `focus()` does not help either: the engines batch
accessibility updates into diffs, so refocusing the same node nets out to
nothing and is coalesced away (measured via AT-SPI: no `focused` gain ever
reaches the bus). So the grab moves focus **onto the list itself** (a temporary
`tabindex="-1"`, removed again on release) — a real, lasting focus change into
the application region that survives the coalescing (verified on the bus:
`focused d1=1` on the list). The arrow keys keep working because the list's
keydown handler moves the grabbed item regardless of the event target;
drop/Escape return focus to the grab target. Audible side effect: on pickup,
NVDA briefly announces the list's name before the "picked up" announcement.
Re-verify S2/S3/S9 manually after this change.

## Results log

Each run is recorded here (or in a linked file) as a combination × scenario
table with ✅ / ⚠️ / ❌ and a note, as a regression baseline.

| Date       | Screen reader + browser        | Scenarios      | Result | Note                                                                                                                                                                                                                        |
| ---------- | ------------------------------ | -------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-09 | NVDA + Chrome/Edge (Windows)\* | S2, S3, S5, S6 | ✅     | Browse-mode pickup with Space/Enter on the handle, arrow keys move after the automatic switch to focus mode, drop and Escape OK. Tested on a production form integration (handles via `fromSelect`, default `clickToGrab`). |

\* Not identical to matrix combination #1 or #2 — the official runs (NVDA +
Firefox, JAWS + Chrome, VoiceOver + Safari) are still pending.
