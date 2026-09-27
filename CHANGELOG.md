# Changelog

All notable changes to **sorta11y** are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project aims for
[Semantic Versioning](https://semver.org/).

## [0.1.0-alpha.0] - Unreleased

First public alpha.

### Added

- **Keyboard reordering** with an explicit grab / move / drop model: `Space`
  picks up and drops, `↑` / `↓` move, `Home` / `End` jump to the edges, `Esc`
  cancels and restores the original order. Every item is a tab stop; the moved
  item keeps focus and is scrolled into view, honouring the page's
  `scroll-padding`.
- **Pointer, touch and pen drag** built on Pointer Events with pointer capture.
  Displaced neighbours slide into place (FLIP, `animation` / `easing`),
  `prefers-reduced-motion` gets an instant reposition, and focus stays where it
  was.
- **Single-pointer alternative to dragging** (WCAG 2.5.7): tap to pick up, tap
  again to place. `clickToGrab: false` makes the pointer drag-only.
- **Screen-reader announcements** through one pre-inserted, polite live region
  per instance — pickups, moves, drops and cancels, from keyboard and pointer
  alike — with 1-indexed "Position X of Y" wording and hidden instructions
  wired up via `aria-describedby`.
- **Screen-reader focus mode:** `role="application"` on a wrapper only while an
  item is held, so NVDA and JAWS pass the grab keys through, and browse-mode
  pickup via a `<button>` handle's activation. `applicationRole: false` opts
  out.
- **Drag handles** (`handle`) exposing `aria-pressed`. `dragOnItem` widens the
  pointer surface to the whole item while keyboard and screen-reader semantics
  stay on the handle; `dragOnItemTouch` extends whole-item dragging to touch
  and pen for short, non-scrolling lists.
- **Internationalisation:** labels are functions, so they can interpolate and
  pluralise. English is built in; `en` and `de` locale files register
  themselves when loaded (via `<script>` or `import`). Pick one with
  `setDefaultLabels()` or the `locale` option, or pass your own `labels`
  object — missing keys fall back.
- **`Sorta11y.fromSelect()`** builds a sortable list from a `<select multiple>`,
  named after the select, and keeps the select mirrored for plain form submits;
  **`Sorta11y.mirrorToSelect()`** mirrors an existing list's order into a
  select.
- **Custom state classes:** `grabbedClass` / `draggingClass`, added alongside
  the built-in `.s11y-item--grabbed` / `.s11y-item--dragging` hooks.
- **Automatic cancel.** A keyboard grab ends with the original order restored
  on a press outside the list, the mouse wheel, a resize, focus leaving the
  list, the page being hidden or a grab key pressed with a modifier. A grab
  started with a tap survives scrolling — touch, scrollbar, wheel, resize — so
  a far drop target stays reachable; a real tap or click outside the list
  still releases it. A pointer drag is reverted on `Esc`,
  `pointercancel`, a mouse or pen reporting no button held, the window losing
  focus or the page being hidden.
- **API:** `Sorta11y.create()` (element or selector), `get()`, `autoInit()` for
  `[data-sorta11y]` markup; instance `refresh()`, `toArray()`, `sort()`,
  `option()` with live updates, and an idempotent `destroy()`; `onStart` /
  `onChange` / `onEnd` callbacks with a `source` of `"keyboard"` or
  `"pointer"`, called after the library has settled its own state and focus.
- **Packaging:** one hand-written UMD file with zero runtime dependencies and
  no build step; `exports` for the library, `sorta11y/style.css` and
  `sorta11y/locales/*`.
- A Vitest + jsdom test suite, including axe-core checks of the idle and the
  mid-grab state.

### Known limitations

- The `rtl` option (and `data-rtl`) is reserved and currently has no effect.
- With `clickToGrab: false`, screen-reader browse-mode pickup does not work in
  Chromium, where the activation looks like a mouse tap; users switch to focus
  mode instead.
- The focus-mode wrapper `<div class="s11y-app">` adds one DOM level around the
  list, which can affect flex/grid layouts.
- If the app reorders existing items while one is held, a cancel restores the
  pickup-time order.
- A scrollbar on the left (some right-to-left layouts) is not recognised as a
  scrollbar during a tap hold, so clicking it may release the hold.
- Manual screen-reader testing is incomplete: an informal NVDA + Chrome run
  passed the core scenarios; the NVDA + Firefox, JAWS + Chrome and
  VoiceOver + Safari runs are pending (see
  [docs/at-test-matrix.md](./docs/at-test-matrix.md)).

More in
[Known limitations](https://hensga.github.io/sorta11y/docs/reference/limitations/).

[0.1.0-alpha.0]: https://github.com/Hensga/sorta11y/releases/tag/v0.1.0-alpha.0
