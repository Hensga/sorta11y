# Accessibility model — design notes

The user-facing accessibility model lives on the documentation site, which is
the single source of truth for it:

- **[Accessibility model](https://hensga.github.io/sorta11y/docs/guides/accessibility/)**
  — grab targets and ARIA state, the temporary `role="application"` focus mode,
  the live region
- **[Pointer & touch](https://hensga.github.io/sorta11y/docs/guides/pointer-and-touch/)**
  — the single-pointer model, `clickToGrab`, `dragOnItem`, `dragOnItemTouch`
- **[Enhancing `<select multiple>`](https://hensga.github.io/sorta11y/docs/guides/select/)**
  — `fromSelect()` details
- **[Known limitations](https://hensga.github.io/sorta11y/docs/reference/limitations/)**
  — each trade-off, in depth

The sources live in [`website/src/content/docs/`](../website/src/content/docs/)
— edit them there, not here.

Measured screen-reader behaviour and the manual verification plan stay in the
[AT test matrix](./at-test-matrix.md).

## Design notes

The implementation decisions behind that model, for contributors. The comments
in `src/sorta11y.js` go into more detail.

### Pickup and activation

- A native `<button>` handle picks up from its **`click`**, because that is
  what a screen reader's browse-mode activation produces — a raw Space keydown
  never reaches the page there.
- `detail` cannot tell a keyboard activation from a mouse click: the
  screen-reader activation arrives with `detail: 1` in both Chromium and Gecko
  (measured, see the AT test matrix). A click therefore counts as an activation
  unless a recent `pointerdown` on the same item explains it. That guard is
  re-stamped on `pointerup`, so a long-held mouse press cannot leak its click
  through as a fake activation. The button's own keyboard activation — a
  `detail: 0` click right after a Space/Enter keydown on it — always passes, so
  Space right after tapping a handle works.
- No-handle items and non-`<button>` handles get no synthetic click from Space,
  so they pick up straight from the keydown.
- A held Space or Enter is one press: auto-repeats are ignored. After Space
  drops an item from a `<button>` handle, focus is back on that button before
  the key's `keyup` — and older Gecko activated a button on _any_ Space keyup,
  which would re-grab the item. So one keyboard click on that button is
  swallowed until the keyup has settled. A screen reader's press never takes
  this path (no keydown reaches the page).

### Focus-mode switching

- `role="application"` sits on a role-less wrapper `<div>` and is engaged only
  while an item is held. It never goes on the `<ul>`, where it is invalid and
  would strip the listitem semantics.
- Screen readers re-evaluate browse vs focus mode only on a real focus move,
  and a blur + refocus of the same node is coalesced away by the engines
  (measured). Pickup therefore moves focus onto the list itself, via a
  temporary `tabindex="-1"` that is shed again afterwards; a consumer's own
  `tabindex` is left alone.
- ARIA requires application regions to be named. The wrapper mirrors the list's
  name — `aria-labelledby` first, as in the accessible-name computation (a
  reference to no existing element is ignored), then `aria-label` — falling
  back to the localisable `applicationLabel`; the name
  is removed together with the role. `fromSelect()` names its list in the same
  order.

### Live region and instructions

- One polite, atomic live region (`role="status"`) per instance, inserted when
  the list is enhanced — never created on demand, since a region created and
  filled in the same tick is often missed.
- It and the hidden instructions sit **after** the wrapper, not inside it:
  live regions inside an active application region can be announced
  inconsistently by NVDA and JAWS.
- A list enhanced while detached from the document parks both on `<body>`,
  never inside the list, where they would corrupt the list's child semantics.
- Identical consecutive text is cleared before it is set again, so it is
  re-announced. This synchronous baseline is still coalesced by some screen
  readers — see Known limitations.
- `aria-describedby` points at the instructions only while the keyboard layer
  is on, so a `keyboard: false` list does not advertise keys it no longer
  handles. `aria-keyshortcuts` is deliberately not set: the keys it would list
  are only live during a grab.

### ARIA details

- No `aria-grabbed` / `aria-dropeffect` — both are deprecated.
- A native `<button>` handle gets only `aria-pressed`, no redundant
  `role="button"`; a non-`<button>` handle is promoted to `role="button"`.
- A non-`<li>` item gets `role="listitem"`, and a non-list container
  `role="list"`, so a list is never left without listitems.

### Pointer input

- Only the pointer that started a drag (matched by `pointerId`) can move or end
  it, so a second finger cannot corrupt a drag in progress.
- A 4 px threshold separates a tap from a drag. On a scrollable item body
  (`dragOnItem` without `dragOnItemTouch`), a touch or pen press may move up to
  ~10 px — the platform's tap slop — and still count as a tap; the 4 px
  threshold would swallow real taps from tremor input.
- Pens are treated like touch: `touch-action` governs stylus input in the major
  engines too. The mouse always drags the whole item. This is decided per press
  via `PointerEvent.pointerType`, so hybrid devices get both.
- Swap detection reads positions that ignore a running FLIP transform, so rows
  cannot oscillate mid-slide, and it loops, so a fast flick can cross several
  rows in one move.
- Only one item can be held or dragged at a time, page-wide: the keyboard and
  pointer layers of all instances share one lock, and a new grab cancels the
  previous one without stealing focus.

### Focus and scrolling

- Moving a node with `appendChild` detaches it for a moment, and the browser
  drops its focus to `<body>`. Pointer swaps, reverted drags and `sort()`
  therefore refocus the element that had focus — synchronously, in the same
  task, so assistive technology sees no focus change — and only when the move
  actually lost it.
- Keyboard moves, tap placements and keyboard cancels reveal the item at its
  final slot with `scrollIntoView({ block: "nearest" })`, then focus it with
  `preventScroll`. A focus-scroll would be computed against the item's old,
  FLIP-transformed position and does not reliably honour `scroll-padding`.
  Pickup, drop, auto-cancels and `sort()` never scroll.

### Robustness

- Cancel restores the original order by element reference, not by `data-id`,
  so lists with missing or duplicate ids still reorder and cancel correctly.
- Plain `scroll` does not cancel a grab, because programmatic focus can scroll
  the page; `wheel` does — but only for a grab started from the keyboard.
- A tap hold has to survive scrolling, or tap-to-place (WCAG 2.5.7) could not
  reach a distant target. It ignores `wheel` and `resize` (a mobile browser's
  collapsing address bar fires `resize`), and it judges a press outside the
  list by how it ends: released in place, it is a tap and cancels; taken over
  by the browser (`pointercancel`), moved ≥ 10 px, or started on a scrollbar,
  it is scrolling and keeps the hold. It listens to Pointer Events only — the
  `mousedown` / `touchstart` of the same press are echoes and must not cancel
  before the press is judged.
- When `refresh()` sees items come or go mid-grab or mid-drag, it reconciles
  the pickup-time order, so a cancel neither re-inserts removed rows nor
  displaces added ones.
- `sort()` and other reorders move only the items outside the longest run
  already in the wanted order: every move detaches a row, which restarts its
  CSS animations and hover state.
- Consumer callbacks run last in every step (pickup, drop, cancel), after the
  library's own state, focus and `tabindex` are settled, so a callback that
  throws cannot strand the list mid-grab.
- When focus leaves the widget mid-grab (a dialog, a validation message), the
  grab is cancelled without pulling focus back, so the element that took focus
  keeps it.
