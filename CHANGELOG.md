# Changelog

All notable changes to **sorta11y** are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project aims for
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed — Screen-reader browse-mode pickup

- **Space/Enter on the handle button work again in NVDA/JAWS browse mode.**
  Screen readers activate the handle through the engine's accessibility
  "press" action, and the resulting click arrives with `detail: 1` in **both**
  engines (measured via AT-SPI, which drives the same engine path as
  NVDA/JAWS on Windows): Blink prefixes a synthetic pointer tap, Gecko sends a
  bare `mousedown → mouseup → click` with no pointer events. The pickup path
  required `detail === 0` and silently dropped these — in Firefox the
  browse-mode pickup was completely dead, in Chromium it only worked by
  accident through the pointer-tap fallback. A click now counts as an
  activation unless recent pointer activity on the same item explains it (a
  real mouse/touch click always follows its own pointerdown/up), and the
  pointer guard is re-stamped on pointerup so a long-held press cannot leak
  its click through as a fake activation. Regression tests replay both
  measured sequences. Known limitation: with `clickToGrab: false`, Chromium's
  AT press is indistinguishable from a mouse tap and stays gated — browse-mode
  users switch to focus mode there. See docs/at-test-matrix.md for the
  measured sequences.
- **Arrow keys work right after a browse-mode pickup.** NVDA/JAWS re-evaluate
  browse vs focus mode only when a focus event arrives; the grab applied
  `role="application"` while focus already sat on the grab target, so no
  event fired, the reader stayed in browse mode, and the arrow keys navigated
  the virtual buffer instead of moving the item (found in manual NVDA testing
  of scenario S3). A blur+refocus of the grab target does NOT fix this:
  engines batch accessibility updates and ship diffs, so a same-node refocus
  nets out to nothing and never reaches the reader (measured via AT-SPI).
  Instead, the grab now moves focus onto the **list itself** (temporary
  `tabindex="-1"`, shed on release; a consumer-set tabindex is left alone) —
  a real, persistent focus move into the application region that survives
  the coalescing (verified on the accessibility bus: `focused` gain on the
  list). The arrow keys keep working because the list-level keydown handler
  drives the grabbed item regardless of the event target; drop/cancel return
  focus to the grab target. The leaves-the-widget cancel is unaffected
  (moving focus to the list stays inside the widget).

### Added — Touch scroll guard (`dragOnItemTouch`)

- **`dragOnItemTouch` option (default `false`).** Governs what `dragOnItem`
  means for direct-manipulation pointers (touch **and** pen). Off (the
  default), the item body keeps its native
  `touch-action`: a list that fills the screen still scrolls under a finger,
  touch **taps** on the body still pick up and place (WCAG 2.5.7, whole-item
  target), and a touch **drag** uses the handle. `touch-action: none` on every
  item would otherwise turn a long list into a scroll trap — nothing left to
  pan on. Pens count as direct-manipulation pointers governed by
  `touch-action` just like touch (Chromium and Safari pan with a stylus by
  default), so a pen is also tap-only on the body and drags via the handle;
  the mouse always drags the whole item. The distinction is made per press via
  `PointerEvent.pointerType`, so hybrid devices get both. The tap-vs-pan
  teardown uses a platform-sized ~10px slop, not the 4px drag threshold, so
  jittery taps (tremor input) still register. Set `dragOnItemTouch: true` to
  make the whole item a touch/pen drag surface for short, unscrollable lists.
  Toggles live via `list.option(…)`.
- **Fixed alongside: a cancelled placement tap no longer releases the
  single-grab lock.** When the browser claims a touch for scrolling
  (`pointercancel`) while an item is held, the hold now survives untouched.
  Previously the internal single-grab lock was cleared, so a grab in a second
  list would no longer abort the first — two items could end up "held" at once.

### Added — Whole-item pointer surface (`dragOnItem`)

- **`dragOnItem` option (default `false`).** With a `handle` configured, pointer
  drags, tap pickups and placement taps may also start anywhere on the item —
  a bigger pointer target (WCAG 2.5.8) with the handle kept as the visible
  affordance. The a11y contract does not move: the handle remains the only tab
  stop, carries `aria-pressed`, and stays the browse-mode pickup, so keyboard
  and screen-reader behavior are unchanged (WCAG 2.1.1 / 4.1.2). Presses on
  nested interactive controls keep their native behavior and never grab. Items
  get the same native-dragstart suppression as handles while the option is on
  (cleaned up on `refresh()`/`destroy()`); their `touch-action` is governed by
  `dragOnItemTouch` (see above) so long lists keep scrolling. Combines with
  `clickToGrab: false`; toggles live via `list.option("dragOnItem", …)`;
  no-op without a handle.

### Added — Opt out of click-to-grab

- **`clickToGrab` option (default `true`).** Gates the single-pointer
  tap-to-reorder: when `false`, a click/tap no longer picks an item up, so the
  pointer can **only drag**. Useful when a click on the row should stay free for
  other behaviour. This removes the WCAG 2.5.7 single-pointer alternative (the
  keyboard grab still provides one), so keep it on unless drag-only is required.
  Gates only the single-pointer tap — a `<button>` handle's own keyboard
  activation still toggles grab, so the handle stays keyboard-operable. Read live
  at tap time, so `list.option("clickToGrab", false)` applies immediately.

### Added — Handle position (`fromSelect`)

- **`handlePosition: "left" | "right"` for `fromSelect`.** Choose which end of the
  row the generated drag handle sits (default `"left"`). `"right"` places it at
  the row end — easier to reach by thumb on touch and keeps the hand off the
  content, and the row reads content-first. The button also gets a
  `s11y-handle--left` / `s11y-handle--right` modifier class for styling.

### Added — Build from a `<select multiple>`

- **`Sorta11y.fromSelect(select, options)`.** The mirror image of
  `mirrorToSelect`: builds an accessible sortable `<ul>` from a
  `<select multiple>` (one `<li data-id>` per option, a handle button by
  default), hides the select but keeps it submittable, and wires `onChange` to
  mirror the reordered values back into it. Per-item styling stays in the
  consumer via a `renderItem(li, option)` hook; `keepSelected` (default `true`)
  keeps a plain form submit carrying the full order. The drop-in path for apps
  that render a `<select>` instead of a server-side `<ul>`.

### Added — Custom state classes

- **`grabbedClass` / `draggingClass` options.** Attach your own class to an item
  while it is held (keyboard grab) or dragged (pointer/touch) — e.g. a
  utility-class hook — applied _alongside_ the built-in `s11y-item--grabbed` /
  `s11y-item--dragging` (which the library's `z-index` lift relies on). Accepts a
  space-separated list. Both default to `null`.

### Added — Single-pointer & pointer a11y (adversarial review batch)

- **Single-pointer tap-to-reorder (WCAG 2.5.7).** A press-and-release with no drag
  now toggles the grab model instead of being a no-op: tap a grab target to pick
  it up, tap it again to drop in place, tap a different item to move-then-drop;
  `Escape` or focus-loss cancels. Every reorder a drag can do is now reachable
  without a dragging gesture. Drags that cross the 4 px threshold are unchanged.
- The pointer **commit and cancel paths now announce** (`dropped` / `cancelled`)
  through the live region, matching the keyboard path — the README's "every change
  is announced" claim now holds for mouse/touch too.
- During a grab the `role="application"` wrapper carries an **accessible name**
  (mirrors the list's `aria-label`/`aria-labelledby`, else a localisable default).
  New label key `applicationLabel` (English "Sortable list", German "Sortierbare
  Liste"); the name is removed on drop/cancel.
- A non-`<button>` handle promoted to `role="button"` now responds to **`Enter`**
  (grab when idle, drop when grabbed), mirroring `Space`. Native `<button>` handles
  and plain no-handle `<li>` items are unchanged.
- Pointer drags now use `setPointerCapture` and **self-heal a lost release** — a
  move reporting no buttons held, or a `lostpointercapture` event, reverts a stuck
  drag.

### Changed — ARIA / DOM conformance (adversarial review batch)

- The live region **and** instructions now live **outside** the `s11y-app`
  application wrapper (as its next siblings). Anything that located the live region
  via `list.nextElementSibling` must, when the wrapper is present, read the
  wrapper's next sibling instead (test helper `liveRegionOf` added).
- `aria-describedby` (the pickup instructions) is only set while `keyboard` is on;
  toggling `option('keyboard', …)` re-syncs it (and refreshes). `option('locale',
…)` and `option('labels', …)` now re-render the hidden instructions text so it
  follows the language/label swap.
- Non-`<li>` items in a non-native container now **always** get `role="listitem"`
  (even with no handle), so a `role="list"` container is never left with zero
  listitems.
- `destroy()`/`refresh()` on a currently-focused no-handle item (or non-button
  handle) now anchors it at `tabindex="-1"` (shed on the next blur) instead of
  removing `tabindex`, preserving focus/reading position.
- While an item is held, a `pointerdown`/`mousedown`/`touchstart` **inside** the
  same widget is treated as a placement gesture and no longer auto-cancels the
  grab; presses outside the widget and wheel/resize/focus-loss still cancel.

### Removed — ARIA (adversarial review batch)

- `aria-keyshortcuts` is no longer set on grab targets (it advertised keys that are
  only live during a grab). Consumers reading it will now find it absent.

### Fixed — Keyboard a11y (adversarial review batch)

- In no-handle mode, keydowns originating from a nested interactive control
  (`input`, `a[href]`, `button`, `select`, `textarea`, `summary`,
  `contenteditable`, `role=button/textbox`) are left to that control: `Space` no
  longer grabs the item and `Enter` is no longer `preventDefault`ed, so nested
  controls stay keyboard-operable (WCAG 2.1.1).
- A keyboard grab is now auto-cancelled (silently, order restored, role/
  `aria-pressed` cleared) when focus programmatically leaves the widget entirely
  (dialog/toast/validation). Moving focus between items of the same list does not
  cancel.
- New regression tests across the keyboard, pointer, and application-role suites;
  axe stays clean idle and mid-grab.

### Changed — Demo reference implementation

- A grabbed/dragging item now shows a **2 px dashed blue outline** (in addition to
  the background tint and shadow) as the visible "picked up" cue; the keyboard
  focus ring switches from solid (focused) to dashed (grabbed) on `Space`. The
  outline survives Windows High-Contrast / forced-colors mode, where the old
  background+shadow cue disappeared. Library CSS (`src/sorta11y.css`) is unchanged.

### Added — Screen-reader focus mode (dynamic `role="application"`)

- NVDA/JAWS swallow `Space` and the arrow keys in browse mode, so the grab keys
  looked dead. Following GitHub's sortable-list pattern and MDN's "smallest scope,
  last resort" guidance, the list is now wrapped in a **role-less** `<div>` and
  `role="application"` is engaged **only for the duration of a grab** (removed on
  drop/cancel) — the reader enters focus mode exactly when the arrow keys are
  needed and the idle list stays fully readable. The role sits on the wrapper, not
  the `<ul>` (invalid there; it would strip the listitem semantics).
- **Native-`<button>` handle pickup is now the button's activation** (a `click`,
  which survives browse mode), not a raw `Space` keydown — the interaction a
  screen reader can actually reach. Mouse clicks (`detail >= 1`) and the click a
  touch tap synthesises (scoped to the tapped item) are ignored by the keyboard
  path. No-handle lists **and non-`<button>` handles** keep `Space`-keydown pickup
  (a `role="button"` `<span>` gets no synthetic click, so it stays key-operable).
- The handle should be a **native `<button>`** (its activation is what fires the
  click); a native button no longer gets a redundant explicit `role="button"`,
  only the `aria-pressed` grab state. Demo, README markup, and helpers updated.
- New `applicationRole` option (default `true`; `data-application-role="false"` to
  opt out). Toggling `keyboard`/`applicationRole` cancels any live grab; a list
  created detached is wrapped on the first `refresh()` after attachment.
- The wrapper is a **persistent `<div class="s11y-app">`** — if the list was a
  direct flex/grid child or is hit by `parent > ul`/sibling selectors, that extra
  level shifts layout; style `.s11y-app` to compensate or opt out.
- axe stays clean idle **and** mid-grab; new `test/application.test.js` plus
  keyboard/pointer regression tests, 116 total.

### Added — Phase 5 (axe-core automated a11y)

- `test/axe.test.js`: axe-core runs against the enhanced list (idle, during a
  grab, and in handle mode) as part of the suite. Layout-only rules (colour
  contrast) are jsdom-disabled; they plus manual NVDA / JAWS / VoiceOver remain
  the AT matrix.

### Changed — ARIA conformance (from the axe counter-test)

- `role="button"` is not valid on an `<li>` and `aria-pressed` requires it, so:
  with a **handle** the handle is the button (with `aria-pressed`) — fully
  axe-clean and the richest screen-reader state; **without a handle** the `<li>`
  stays a native listitem and the grab state is carried by the live region + the
  `--grabbed` class. No redundant explicit `role="list"` on a native `<ul>`/`<ol>`.
- Demo now uses real `<button>` drag handles (the recommended, axe-clean pattern).
- 97 tests; coverage 95 % stmts / 84 % branches.

### Added — Phase 3 (Packaging & i18n)

- Internationalisation: announcements default to **English**; opt-in locale files
  under `src/locales/` (`en.js`, `de.js`) register on `Sorta11y.locales`.
- `Sorta11y.setDefaultLabels(labelsOrLocaleName)`, a `locale` option, and live
  `option('locale', …)`. Label precedence (low → high): built-in English →
  `setDefaultLabels` → `{ locale }` → `{ labels }`, so a custom `labels` object
  (the host-app injection path) always wins, with per-key fallback.
- `package.json` `exports` map (`.`, `./locales/*`, `./style.css`).
- `Sorta11y.mirrorToSelect(evt, select)` implemented (was a stub): mirror an
  order into a hidden `<select multiple>` so a non-AJAX form submit carries it.
  The public API no longer has any throwing placeholder.

### Added — Phase 2 (Pointer/touch drag)

- Pointer Events drag layer (mouse, touch, pen): press a grab target and drag —
  the item follows the pointer while displaced neighbours FLIP-slide, and release
  commits through the **same `onChange`/`onEnd` path as the keyboard**
  (`source: 'pointer'`).
- A small movement threshold distinguishes a tap/click from a drag; `Escape` or
  `pointercancel` aborts and restores the original order.
- Single-drag-lock spans keyboard **and** pointer (one interaction at a time
  across all instances); `touch-action: none` on grab targets so touch drags are
  not stolen by scrolling; honours `prefers-reduced-motion`.
- `pointer` option (default on) toggles the layer.

### Hardened — Phase 2 adversarial review

- Pointer events are filtered by `pointerId`, so a second finger cannot corrupt
  or commit an in-progress drag (multi-touch safe).
- Swap detection reads transform-immune positions (no oscillation while a FLIP
  slide is mid-flight) and loops, so a fast flick can cross several rows at once.
- FLIP RAF callbacks bail if the instance was destroyed; `option('pointer', …)`
  attaches/detaches the listener and re-applies `touch-action`; cancel re-anchors
  the lifted item so it settles from where it was released.
- 75 unit/DOM tests (Vitest + jsdom); coverage 95 % stmts / 82 % branches.

### Added — Phase 1 (Accessibility core, keyboard)

- Keyboard grab / move / drop / cancel state machine (`Space` grab/drop, `↑`/`↓`
  move, `Home`/`End` to edges, `Esc` cancel-and-restore).
- Each item is a tab stop — `Tab`/`Shift+Tab` move between items (as in
  hello-pangea/dnd & dragon-drop); grabbed arrows move the item; focus is
  retained on the moved item after every reorder.
- One pre-inserted, atomic, polite ARIA live region per instance with 1-indexed
  "Position X of Y" announcements and identical-text de-duplication.
- `role=button` + `aria-pressed` grab targets (handle or item), hidden
  `aria-describedby` instructions, `aria-keyshortcuts` — no deprecated
  `aria-grabbed`/`aria-dropeffect`.
- Robustness: single-drag-lock, auto-cancel on competing pointer/wheel/resize/
  visibilitychange, modifier-key abort, `Enter`/`Tab` blocked during grab.
- Public API: `create`/`new`, `get`, `autoInit` (`[data-sorta11y]`, reads
  `data-handle`; `data-rtl` is parsed into a reserved `rtl` option that is **not
  yet implemented** — a vertical up/down list has no axis to mirror), `toArray`,
  `sort`, `refresh`, `option`, `destroy`.
- Externalised, injectable `labels` with German defaults; `onStart`/`onChange`/`onEnd`.
- FLIP reorder animation: every displaced item (the grabbed one and the
  neighbour it passes) slides from its old box to its new one via `transform`
  (compositor-friendly), with `animation` (ms; `0` disables) and `easing`
  options; honours `prefers-reduced-motion` and is a no-op without layout.

### Hardened — Phase 1 adversarial review

- Cancel restores order by element reference (no longer corrupts lists that omit
  `data-id`).
- `refresh()` preserves the grabbed item's `aria-pressed` and cleans up items
  that leave the set.
- `destroy()` is now idempotent; `option('keyboard', false)` truly detaches the
  handler; structural `option()` changes re-`refresh()`.
- Keydown resolves the owning item by ancestor walk (a stray nested
  `role="button"` no longer swallows keys); detached init parks the live region
  on `<body>` instead of inside `role="list"`.
- 58 unit/DOM tests (Vitest + jsdom); coverage 96 % stmts / 82 % branches.

### Added — Phase 0 (Setup)

- Project scaffold: `package.json`, MIT `LICENSE`, `NOTICE`, `.gitignore`, `.editorconfig`.
- Hand-written UMD source skeleton (`src/sorta11y.js`) exposing the planned public
  API surface (`create`, `get`, `autoInit`, `mirrorToSelect`, `version`) — no behaviour yet.
- Stylesheet skeleton (`src/sorta11y.css`) with the screen-reader `visually-hidden`
  helper, state hooks, and a reduced-motion guard.
- Test harness: Vitest + jsdom with a smoke test; coverage thresholds set to the
  80 % project target.
- Progressive-enhancement demo scaffold (`demo/index.html`).
- Accessibility testing matrix (`docs/at-test-matrix.md`):
  NVDA + Firefox · JAWS + Chrome · VoiceOver + Safari.

[Unreleased]: https://github.com/Hensga/sorta11y/commits/main
