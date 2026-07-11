# sorta11y

> Accessible, zero-dependency vanilla-JS sortable list — keyboard reordering **and** pointer drag, with screen-reader announcements. No framework. No jQuery. No build step.

![status](https://img.shields.io/badge/status-pre--release%20alpha-orange)
[![CI](https://github.com/Hensga/sorta11y/actions/workflows/ci.yml/badge.svg)](https://github.com/Hensga/sorta11y/actions/workflows/ci.yml)
![license](https://img.shields.io/badge/license-MIT-blue)
![runtime dependencies](https://img.shields.io/badge/runtime%20dependencies-zero-brightgreen)

**sorta11y** is the accessible, dependency-free alternative to drag-and-drop sort
libraries. It lets users reorder a vertical list with the **keyboard** (a
screen-reader-safe grab / move / drop model) as well as the **mouse/touch**, and
announces every change through an ARIA live region. It progressively enhances a
server-rendered `<ul><li>` list, so it degrades gracefully and coexists with
existing pages.

> ⚠️ **Pre-release (alpha).** Keyboard **and** pointer/touch drag are implemented
> and unit/DOM-tested (Vitest + jsdom); axe-core runs in the test suite. Manual
> screen-reader verification is still pending — see
> [Known limitations](#known-limitations).

## Install

sorta11y is a pre-release — install via the `alpha` tag (or pin the exact
version):

```bash
npm install sorta11y@alpha
```

```js
import Sorta11y from "sorta11y";
import "sorta11y/style.css";

Sorta11y.create(document.querySelector("#my-list"), { handle: ".drag-handle" });
```

Or skip the build step entirely — the library is one hand-written UMD file
that works straight from a CDN:

```html
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/sorta11y@0.1.0-alpha.0/src/sorta11y.css"
/>
<script src="https://cdn.jsdelivr.net/npm/sorta11y@0.1.0-alpha.0/src/sorta11y.js"></script>
```

Optional locale files live under `sorta11y/locales/*` — see
[Internationalisation](#internationalisation).

## Why

Popular sort libraries are powerful but **not keyboard- or screen-reader-accessible**
out of the box — SortableJS's accessibility gap has been an open, frequently
requested issue since 2017. sorta11y deliberately trades "do everything" scope for
one thing done well: **a single vertical list anyone can reorder**, including
keyboard and screen-reader users — with **zero runtime dependencies** and **no
build step** (one hand-written UMD file you can drop in via `<script>` or a CDN).

## Accessibility model

The keyboard layer below is implemented. Each grab target is a tab stop, with an
explicit **grab / move / drop** interaction. With a **drag handle** (recommended),
the handle is a `button` exposing `aria-pressed` — the richest, fully axe-clean
state. Without one, the `<li>` stays a native listitem and the grab state is
announced via the live region (`role="button"` is not valid on an `<li>`).
Intentionally _no_ deprecated `aria-grabbed` / `aria-dropeffect`.

**Screen-reader focus mode.** NVDA/JAWS swallow <kbd>Space</kbd> and the arrow
keys in their default _browse mode_, so a custom widget's keys look dead. sorta11y
follows the pattern GitHub uses for its own sortable list (and MDN's "scope it as
small as possible, last resort" guidance for `role="application"`): the list is
wrapped in a **role-less** `<div>`, and `role="application"` is toggled on **only
for the duration of a grab** — then removed on drop/cancel — so the reader enters
focus mode exactly when the arrow keys are needed and the idle list stays fully
readable. Pickup is initiated by the **handle button's activation** (a `click`,
which survives browse mode) rather than a raw <kbd>Space</kbd> keydown; this is why
a handle button is recommended for full screen-reader support. Opt out with
`applicationRole: false` (or `data-application-role="false"`).

| Key                                              | Action                                |
| ------------------------------------------------ | ------------------------------------- |
| <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> | Move focus between items              |
| <kbd>Space</kbd>                                 | Pick up / drop the focused item       |
| <kbd>↑</kbd> / <kbd>↓</kbd>                      | Move the held item one position       |
| <kbd>Home</kbd> / <kbd>End</kbd>                 | Move the held item to the start / end |
| <kbd>Esc</kbd>                                   | Cancel and restore the original order |

- One **ARIA live region** per instance (`polite`), pre-inserted so the first
  announcement is never swallowed.
- 1-indexed announcements ("Position 3 of 8") in **your own wording** via the
  `labels` option (full i18n).
- **Focus restoration** by stable `data-id` after a reorder — focus never jumps
  to `<body>`.
- Honours `prefers-reduced-motion` (instant reposition instead of slide).

### Pointer & touch

The same **grab / move / drop** model is available to a **single pointer** (mouse,
touch, or pen), so nobody is forced onto a drag-only path:

- **Drag** a grab target (the drag handle, or the item itself when no handle is
  configured) past a small threshold and release to drop — the item follows the
  pointer while displaced neighbours slide.
- **Tap** — press and release _without_ dragging — to **pick the item up**; then
  **tap it again** to drop it in place, or **tap another item** to move the held
  item into that slot and drop. <kbd>Esc</kbd> or moving focus out of the list
  cancels and restores the original order.

The tap alternative is the **WCAG 2.5.7 (Dragging Movements)** single-pointer
path: every reorder a drag can perform is also reachable without a dragging
gesture. Pointer drops **and** cancels announce through the same live region as
the keyboard path, so the "every change is announced" promise holds for the
mouse/touch layer too.

Opt out with **`clickToGrab: false`** — a plain click no longer picks an item up,
so the pointer can **only drag**. This removes the WCAG 2.5.7 single-pointer path
(the keyboard still provides one), so leave it on unless a drag-only pointer is
genuinely required. It gates only the single-pointer **tap** — a `<button>`
handle's own keyboard activation (<kbd>Space</kbd> / <kbd>Enter</kbd>) still picks
up and drops, so the handle stays operable in a screen reader's browse mode. Read
live at tap time, so `list.option("clickToGrab", false)` applies immediately.

With a handle configured, the handle is normally the **only** pointer target.
Opt in to **`dragOnItem: true`** to widen the _pointer_ surface to the whole
item: drags, tap pickups and placement taps may then start anywhere on the item
(a bigger target — WCAG 2.5.8 — while the handle stays the visible affordance).
The accessibility contract does not move: the handle remains the only tab stop,
carries `aria-pressed`, and stays the browse-mode pickup for screen readers —
keyboard and AT behavior are byte-for-byte unchanged. Presses on nested
interactive controls (links, buttons, form fields) inside an item keep their
native behavior and never grab. Combines with `clickToGrab: false` (whole-item
drag without tap pickup) and toggles live via `list.option("dragOnItem", …)`.
No-op without a handle (the item is already the target). Note that whole-item
dragging makes text inside items harder to select with the mouse — the same
trade-off as no-handle mode.

On touch screens, `dragOnItem` deliberately stays **tap-only** on the item
body: the body keeps its native `touch-action`, so a long list still scrolls
under a finger — a whole-item touch drag surface would otherwise trap the page
(nothing left to pan on). Touch taps on the body still pick up and place (the
WCAG 2.5.7 single-pointer alternative, with the whole item as the target), and
a touch **drag** uses the handle. The same applies to pens: `touch-action`
governs stylus input in every major engine (a pen pans the page just like a
finger), so a pen is also tap-only on the body and drags via the handle. The
mouse always drags the whole item — decided per press via
`PointerEvent.pointerType`, so hybrid devices get both. Opt in to
**`dragOnItemTouch: true`** to widen the touch/pen drag surface to the whole
item anyway (`touch-action: none` on every item) — only advisable for short
lists that never need to scroll. Toggles live via
`list.option("dragOnItemTouch", …)`.

## Quick start

```js
const list = Sorta11y.create(document.querySelector("#my-list"), {
  handle: ".drag-handle",
  announceTotal: true,
  labels: {
    /* your screen-reader strings (i18n) */
  },
  onChange: (evt) => {
    // evt = { item, oldIndex, newIndex, order, source: 'keyboard' | 'pointer' }
  },
});

// Optional: auto-initialise every list marked with [data-sorta11y]
Sorta11y.autoInit();
```

Markup is progressive enhancement — the server renders the list; sorta11y
enhances it:

The handle should be a real `<button>` — its keyboard activation fires the click
that drives pickup even in a screen reader's browse mode:

```html
<ul data-sorta11y data-handle=".drag-handle" aria-label="Reorder tasks">
  <li data-id="a">
    <button type="button" class="drag-handle" aria-label="Move First">⠿</button>
    First
  </li>
  <li data-id="b">
    <button type="button" class="drag-handle" aria-label="Move Second">
      ⠿
    </button>
    Second
  </li>
</ul>
```

## API

### Options

All options can also be set declaratively as `data-*` attributes on the list
(e.g. `data-handle`, `data-application-role`) when using `autoInit`.

| Option            | Default                        | What it does                                                                                                                                         |
| ----------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `handle`          | `null`                         | Selector for a drag handle inside each item (a real `<button>` recommended). Without one, the whole item is the grab target.                         |
| `keyboard`        | `true`                         | Keyboard grab / move / drop layer.                                                                                                                   |
| `pointer`         | `true`                         | Pointer/touch drag layer.                                                                                                                            |
| `clickToGrab`     | `true`                         | A pointer **tap** (no drag) picks up / drops like <kbd>Space</kbd> — the WCAG 2.5.7 single-pointer path. `false` = the pointer can only drag.        |
| `dragOnItem`      | `false`                        | With a handle: pointer drags/taps may start anywhere on the item (bigger target, WCAG 2.5.8). Keyboard & screen-reader semantics stay on the handle. |
| `dragOnItemTouch` | `false`                        | Widen the **touch/pen** drag surface to the whole item (`touch-action: none` — only for short, non-scrolling lists).                                 |
| `applicationRole` | `true`                         | Toggle `role="application"` on a wrapper only while an item is held (screen-reader focus mode).                                                      |
| `animation`       | `150`                          | FLIP slide duration in ms; `0` disables. Honours `prefers-reduced-motion`.                                                                           |
| `easing`          | `"cubic-bezier(0.2, 0, 0, 1)"` | Easing for the slide animation.                                                                                                                      |
| `announceTotal`   | `true`                         | Include "of Y" in position announcements.                                                                                                            |
| `dataIdAttr`      | `"data-id"`                    | Attribute that identifies items (focus restore, `toArray`, `sort`).                                                                                  |
| `grabbedClass`    | `null`                         | Extra class(es) on the item during a keyboard grab (alongside `.s11y-item--grabbed`).                                                                |
| `draggingClass`   | `null`                         | Extra class(es) on the item during a pointer drag (alongside `.s11y-item--dragging`).                                                                |
| `labels`          | `null`                         | Your own announcement strings (full i18n) — always wins.                                                                                             |
| `locale`          | `null`                         | Pick a registered locale for the announcements.                                                                                                      |
| `onChange`        | `null`                         | `({ item, oldIndex, newIndex, order, source }) => {}` after a committed reorder (`source: "keyboard" \| "pointer"`).                                 |

### Static methods

| Method                                      | What it does                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| `Sorta11y.create(el, options?)`             | Enhance a `<ul>`/`<ol>` and return the instance.                                |
| `Sorta11y.get(el)`                          | Return the instance attached to an element, or `null`.                          |
| `Sorta11y.autoInit(root?)`                  | Enhance every `[data-sorta11y]` list (options via `data-*` attributes).         |
| `Sorta11y.fromSelect(select, options?)`     | Build a sortable list from a `<select multiple>` and keep it mirrored.          |
| `Sorta11y.mirrorToSelect(evt, select)`      | Mirror an `onChange` order into a hidden `<select multiple>` for plain submits. |
| `Sorta11y.setDefaultLabels(labelsOrLocale)` | Set the default announcement labels (object or registered locale name).         |

### Instance methods

| Method                  | What it does                                                                     |
| ----------------------- | -------------------------------------------------------------------------------- |
| `refresh()`             | Re-resolve items and re-apply ARIA + roving tabindex after external DOM changes. |
| `toArray()`             | Current order as an array of `data-id`s.                                         |
| `sort(order, animate?)` | Reorder to the given array of ids, optionally with the slide animation.          |
| `option(name, value?)`  | Read (1 arg) or live-update (2 args) an option.                                  |
| `destroy()`             | Remove all enhancements, listeners and ARIA wiring (idempotent).                 |

## Internationalisation

Announcements default to **English**. Other languages are opt-in files under
`src/locales/` that register on `Sorta11y.locales`:

```html
<script src="sorta11y.js"></script>
<script src="sorta11y/locales/de.js"></script>
<script>
  Sorta11y.setDefaultLabels("de"); // make German the default…
  const list = Sorta11y.create(el, { locale: "de" }); // …or pick per instance
</script>
```

Labels are **functions** (so they can interpolate the position and pluralise),
and a fully custom `labels` object always wins — the integration path for apps
that already ship their own translation files:

```js
Sorta11y.create(el, {
  labels: {
    instructions: "Leertaste zum Aufnehmen …",
    grabbed: (c) =>
      `Aufgenommen: ${c.itemLabel}. Position ${c.position} von ${c.total}.`,
    moved: (c) => `Position ${c.position} von ${c.total}.`,
    dropped: (c) => `Abgelegt an Position ${c.position} von ${c.total}.`,
    cancelled: (c) => `Abgebrochen.`,
  },
});
```

Precedence (low → high): built-in English → `setDefaultLabels` → `{ locale }` → `{ labels }`.

## Enhancing a `<select multiple>`

If your form renders a `<select multiple>` rather than a server-side `<ul>`,
`Sorta11y.fromSelect()` builds the accessible list for you — the mirror image of
`mirrorToSelect`. It creates one `<li data-id>` per option (with a handle button
by default), hides the select but keeps it in the DOM, and wires `onChange` to
mirror the new order back into it, so a normal form submit still carries the
order:

```js
Sorta11y.fromSelect("#groups", {
  labels, // i18n, exactly as for create()
  handlePosition: "right", // "left" (default) or "right" — the row end
  handleLabel: (text) => `${text} — move`, // accessible name for the handle
  renderItem: (li, option) => {
    // e.g. carry each option's colour onto its row
    li.style.background = option.style.background;
  },
});
```

By default every option is kept `selected` (so a plain submit sends them all in
order) and a handle `<button>` is generated for full screen-reader support — pass
`handle: false` for a handle-less list. The handle sits at the row start by
default; `handlePosition: "right"` moves it to the end (easier to reach by thumb
on touch, and the row reads content-first) — the button also gets a
`s11y-handle--left` / `s11y-handle--right` modifier class to style against.
Consumer-specific styling stays out of the library via the
`renderItem(li, option)` hook.

## Styling

sorta11y ships almost no visual CSS — it sets only structural/state hooks and
leaves the look to you. Two state classes are toggled on the active item:

| Class                  | When                           |
| ---------------------- | ------------------------------ |
| `.s11y-item--grabbed`  | a keyboard grab is active      |
| `.s11y-item--dragging` | a pointer/touch drag is active |

Style these to make the picked-up state visible (see the demo). If you prefer
your own hook name — e.g. a utility-class framework — add one via the
`grabbedClass` / `draggingClass` options. It is applied **alongside** the
built-in class (which the library's own `z-index` lift relies on), and may be a
space-separated list:

```js
Sorta11y.create(el, {
  handle: ".drag-handle",
  grabbedClass: "ring ring-blue-500", // added while held via keyboard
  draggingClass: "opacity-80", // added while dragging with pointer/touch
});
```

## Development

```bash
npm install        # dev tooling only — the shipped library has zero runtime deps
npm test           # Vitest + jsdom
npm run coverage   # enforce the >= 80% target
npm run demo       # serve the project, then open http://localhost:8090/demo/
```

The library source is a single hand-written UMD file (`src/sorta11y.js`) plus
`src/sorta11y.css` — there is **no build step**; what you read is what ships.

## Browser & AT support

Evergreen Chromium (Chrome/Edge), Firefox and Safari. The drag layer is built
on [Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)
with `setPointerCapture` — no Internet Explorer. The library runs entirely in
the browser; Node is only needed for development.

Screen-reader behaviour is documented in the
[AT test matrix](./docs/at-test-matrix.md): an NVDA + Chrome/Edge run passes
the core scenarios; the three official matrix runs (NVDA + Firefox,
JAWS + Chrome, VoiceOver + Safari) are still pending.

## Known limitations

- Identical consecutive announcements use a synchronous clear-then-set; some
  screen readers may coalesce it. A robust re-announce (async gap or dual-region
  ping-pong) is planned, to be validated against real AT.
- `scroll`-based auto-cancel of a keyboard grab is intentionally deferred
  (programmatic focus can scroll and would falsely cancel); `wheel` still cancels.
- On touch, grab targets use `touch-action: none`, so for a no-handle list the
  items themselves won't scroll the page on touch — use a handle for long,
  touch-scrollable lists. Manual screen-reader verification is still pending.
- Screen-reader **browse-mode pickup** needs a **handle button** (the click that
  survives browse mode comes from activating a `<button>`). A no-handle list is
  still fully keyboard-operable, but a screen-reader user must switch to focus
  mode manually to pick an item up — so a handle is recommended for AT support.
  A non-`<button>` handle stays keyboard-operable via <kbd>Space</kbd>, but does
  not get the browse-mode click pickup — prefer a real `<button>`.
- The `role="application"` focus mode wraps the list in a **persistent
  `<div class="s11y-app">`** (the role can't live on the `<ul>`). If the list was
  a direct flex/grid child or is targeted by `parent > ul` / sibling selectors,
  that extra level shifts layout — style `.s11y-app` (or the list) to compensate,
  or opt out with `applicationRole: false`.

## Early supporters

- [ConfTool](https://www.conftool.net) — supported sorta11y's early development
  with a real-world form integration and hands-on screen-reader testing.

## License

[MIT](./LICENSE) © 2026 Henning Huth. sorta11y ships with no runtime dependencies;
behavioural patterns were studied from MIT-licensed projects — see [NOTICE](./NOTICE).
