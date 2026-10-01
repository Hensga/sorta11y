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

**[Documentation →](https://hensga.github.io/sorta11y/docs/)** — installation,
guides and the full API reference.

**[Live demo & playground →](https://hensga.github.io/sorta11y/)** — every
example on the page is wired to the real library, with the live-region output
shown next to each list.

> ⚠️ **Pre-release (alpha).** Keyboard and pointer/touch drag are implemented
> and unit/DOM-tested (Vitest + jsdom, axe-core in the suite). An informal
> NVDA + Chrome run passes the core scenarios (2026-07-09); the three official
> AT matrix runs are still pending — see
> [Browser & AT support](#browser--at-support).

**Contents:** [Install](#install) · [Quick start](#quick-start) ·
[Why](#why) · [Accessibility model](#accessibility-model) · [API](#api) ·
[Internationalisation](#internationalisation) ·
[`<select multiple>`](#enhancing-a-select-multiple) · [Styling](#styling) ·
[Browser & AT support](#browser--at-support) ·
[Known limitations](#known-limitations) ·
[Contributing & feedback](#contributing--feedback)

## Install

sorta11y is a pre-release — install via the `alpha` tag (or pin the exact
version):

```bash
npm install sorta11y@alpha
```

```js
import Sorta11y from "sorta11y";
import "sorta11y/style.css";
```

Or load the UMD file straight from a CDN — no build step required:

```html
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/sorta11y@alpha/src/sorta11y.css"
/>
<script src="https://cdn.jsdelivr.net/npm/sorta11y@alpha/src/sorta11y.js"></script>
```

The moving `@alpha` tag is for quick trials. In production, pin an exact
version and add Subresource Integrity — see
[Installation](https://hensga.github.io/sorta11y/docs/installation/).

Optional locale files live under `sorta11y/locales/*` — see
[Internationalisation](#internationalisation). TypeScript declarations are
included — no `@types` package needed; see
[Installation](https://hensga.github.io/sorta11y/docs/installation/#typescript).

## Quick start

The server renders the list; sorta11y enhances it. The handle should be a real
`<button>` — its activation click drives pickup even in a screen reader's
browse mode:

```html
<ul id="my-list" aria-label="Reorder tasks">
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

```js
const list = Sorta11y.create(document.querySelector("#my-list"), {
  handle: ".drag-handle",
  onChange: (evt) => {
    // evt = { item, oldIndex, newIndex, order, source: 'keyboard' | 'pointer' }
  },
});

// Or declaratively: mark lists with [data-sorta11y] (+ data-handle) and call
Sorta11y.autoInit();
```

sorta11y works inside any framework that renders a real `<ul>` — call
`list.refresh()` after the framework re-renders the items. If the re-render
replaced the focused item with a new node, restore focus yourself. There are no
wrapper packages yet.

## Why

Popular sort libraries are powerful but **not keyboard- or screen-reader-accessible**
out of the box — SortableJS's accessibility gap has been an open, frequently
requested issue since 2017. sorta11y deliberately trades "do everything" scope
for one thing done well: **a single vertical list anyone can reorder**,
including keyboard and screen-reader users.

## Accessibility model

Every grab target is a tab stop with an explicit **grab / move / drop**
interaction. With a **drag handle** (recommended) the handle is a real
`<button>` exposing `aria-pressed`; without one, the `<li>` stays a native
listitem and the grab state is announced via the live region. Intentionally
_no_ deprecated `aria-grabbed` / `aria-dropeffect`.

| Key                                              | Action                                           |
| ------------------------------------------------ | ------------------------------------------------ |
| <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> | Move focus between items                         |
| <kbd>Space</kbd>                                 | Pick up / drop the focused item                  |
| <kbd>Enter</kbd>                                 | Same as Space on a handle; plain items ignore it |
| <kbd>↑</kbd> / <kbd>↓</kbd>                      | Move the held item one position                  |
| <kbd>Home</kbd> / <kbd>End</kbd>                 | Move the held item to the start / end            |
| <kbd>Esc</kbd>                                   | Cancel and restore the original order            |

- One **ARIA live region** per instance (`polite`), pre-inserted so the first
  announcement is never swallowed.
- 1-indexed announcements ("Position 3 of 8") in **your own wording** via the
  `labels` option (full i18n).
- **Focus stays put** after a keyboard, pointer or `sort()` reorder: items are
  moved, not re-created, so the focused item keeps focus and it never falls
  back to `<body>`.
- Honours `prefers-reduced-motion` (instant reposition instead of slide).

The same grab / move / drop model works for a **single pointer** (mouse,
touch, pen): drag a grab target past a small threshold — or **tap** to pick
up and tap again to place, which is the **WCAG 2.5.7 (Dragging Movements)**
single-pointer alternative. Pointer drops and cancels announce through the
same live region as the keyboard path.

During a grab, screen readers are switched into focus mode via a temporary
`role="application"` wrapper, and pickup rides on the handle button's
activation click so it works from browse mode. The full design rationale —
focus-mode switching, `clickToGrab`, `dragOnItem`, `dragOnItemTouch`, touch
and pen behaviour — lives in the
[accessibility model](https://hensga.github.io/sorta11y/docs/guides/accessibility/)
and [pointer & touch](https://hensga.github.io/sorta11y/docs/guides/pointer-and-touch/)
guides.

## API

### Options

Three of these can also be set declaratively on the list when using `autoInit`:
`data-handle`, `data-application-role` and the reserved `data-rtl`. The rest
need an options object passed to `Sorta11y.create()`.

| Option            | Default                        | What it does                                                                                                                 |
| ----------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `itemSelector`    | `"> li"`                       | Which children count as items.                                                                                               |
| `handle`          | `null`                         | Selector for a drag handle inside each item (a real `<button>` recommended). Without one, the whole item is the grab target. |
| `keyboard`        | `true`                         | Keyboard grab / move / drop layer.                                                                                           |
| `pointer`         | `true`                         | Pointer/touch drag layer.                                                                                                    |
| `clickToGrab`     | `true`                         | A pointer tap (no drag) picks up / drops. `false` = the pointer can only drag.                                               |
| `dragOnItem`      | `false`                        | With a handle: pointer drags/taps may start anywhere on the item; keyboard/AT semantics stay on the handle.                  |
| `dragOnItemTouch` | `false`                        | Widen the touch/pen drag surface to the whole item — only for short, non-scrolling lists.                                    |
| `applicationRole` | `true`                         | Toggle `role="application"` on a wrapper only while an item is held.                                                         |
| `animation`       | `150`                          | FLIP slide duration in ms; `0` disables.                                                                                     |
| `easing`          | `"cubic-bezier(0.2, 0, 0, 1)"` | Easing for the slide animation.                                                                                              |
| `announceTotal`   | `true`                         | Include "of Y" in position announcements.                                                                                    |
| `liveness`        | `"polite"`                     | `aria-live` value for the announcement region.                                                                               |
| `rtl`             | `"auto"`                       | Reserved — currently has no effect.                                                                                          |
| `dataIdAttr`      | `"data-id"`                    | Attribute that identifies items for `toArray()` and `sort()`.                                                                |
| `grabbedClass`    | `null`                         | Extra class(es) on the item while it is held (keyboard or tap pickup).                                                       |
| `draggingClass`   | `null`                         | Extra class(es) on the item during a pointer drag.                                                                           |
| `labels`          | `null`                         | Your own announcement strings (full i18n) — always wins.                                                                     |
| `locale`          | `null`                         | Pick a registered locale for the announcements.                                                                              |
| `onStart`         | `null`                         | Fired when an item is picked up (same event object as `onChange`).                                                           |
| `onChange`        | `null`                         | `({ item, oldIndex, newIndex, order, source }) => {}` after a committed reorder; `source` is `"keyboard"` or `"pointer"`.    |
| `onEnd`           | `null`                         | Same event object, fired after every drop **and** every cancel.                                                              |

### Static methods

| Method                                      | What it does                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| `Sorta11y.create(el, options?)`             | Enhance a `<ul>`/`<ol>` (element or selector) and return the instance.          |
| `Sorta11y.get(el)`                          | Return the instance attached to an element, or `null`.                          |
| `Sorta11y.autoInit(root?)`                  | Enhance every `[data-sorta11y]` list (three options via `data-*` attributes).   |
| `Sorta11y.fromSelect(select, options?)`     | Build a sortable list from a `<select multiple>` and keep it mirrored.          |
| `Sorta11y.mirrorToSelect(evt, select)`      | Mirror an `onChange` order into a hidden `<select multiple>` for plain submits. |
| `Sorta11y.setDefaultLabels(labelsOrLocale)` | Set the default labels for lists created afterwards (object or locale name).    |

`fromSelect` accepts all regular options plus `label` (the list's accessible
name; defaults to the select's own `aria-labelledby`, `aria-label` or
`<label>`), `keepSelected`, `listClass`, `handle: false` (no generated
handle button), `handleClass`, `handleText`, `handlePosition: "left" | "right"`,
`handleLabel(text, option)` (the handle's accessible name) and
`renderItem(li, option)` (custom row content and styling). The returned
instance's `.sourceSelect` is the original select. Details:
[Enhancing `<select multiple>`](https://hensga.github.io/sorta11y/docs/guides/select/).

### Instance methods

| Method                  | What it does                                                              |
| ----------------------- | ------------------------------------------------------------------------- |
| `refresh()`             | Re-resolve items and re-apply ARIA + tabindex after external DOM changes. |
| `toArray()`             | Current order as an array of ids (the `dataIdAttr` values).               |
| `sort(order, animate?)` | Reorder to the given array of ids — animated unless `animate` is `false`. |
| `option(name, value?)`  | Read (1 arg) or live-update (2 args) an option.                           |
| `destroy()`             | Remove all enhancements, listeners and ARIA wiring (idempotent).          |

## Internationalisation

Announcements default to **English**. Other languages are opt-in files under
`src/locales/`; loading one registers it on `Sorta11y.locales` — via a
`<script>` tag or `import "sorta11y/locales/de"` alike:

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
    grabbed: (c) =>
      `Aufgenommen: ${c.itemLabel}. Position ${c.position} von ${c.total}.`,
    dropped: (c) => `Abgelegt an Position ${c.position} von ${c.total}.`,
    // …instructions, moved, cancelled
  },
});
```

Precedence (low → high): built-in English → `setDefaultLabels` → `{ locale }` → `{ labels }`.

## Enhancing a `<select multiple>`

If your form renders a `<select multiple>` rather than a server-side `<ul>`,
`Sorta11y.fromSelect()` builds the accessible list for you: one `<li data-id>`
per option (with a generated handle button), the select stays hidden in the
DOM, and every reorder is mirrored back into it — so a normal form submit
still carries the order:

```js
Sorta11y.fromSelect("#groups", {
  labels, // i18n, exactly as for create()
  handlePosition: "right",
  renderItem: (li, option) => {
    li.style.background = option.style.background;
  },
});
```

## Styling

sorta11y ships almost no visual CSS — it sets only structural/state hooks and
leaves the look to you:

| Class                  | When                                     |
| ---------------------- | ---------------------------------------- |
| `.s11y-item--grabbed`  | an item is held (keyboard or tap pickup) |
| `.s11y-item--dragging` | a pointer/touch drag is active           |

Style these to make the picked-up state visible. For utility-class frameworks,
`grabbedClass` / `draggingClass` add your own hooks **alongside** the built-in
classes (space-separated lists allowed):

```js
Sorta11y.create(el, {
  handle: ".drag-handle",
  grabbedClass: "ring ring-blue-500",
  draggingClass: "opacity-80",
});
```

## Browser & AT support

Evergreen Chromium (Chrome/Edge), Firefox and Safari. The drag layer is built
on [Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)
with `setPointerCapture` — no Internet Explorer. The library runs entirely in
the browser; Node is only needed for development.

Screen-reader behaviour is documented in the
[AT test matrix](./docs/at-test-matrix.md): an informal NVDA + Chrome run
passed the core scenarios (2026-07-09); the three official matrix runs
(NVDA + Firefox, JAWS + Chrome, VoiceOver + Safari) are still pending.

## Known limitations

- Identical consecutive announcements may be coalesced by some screen readers;
  a robust re-announce is planned.
- `scroll`-based auto-cancel of a keyboard grab is intentionally deferred;
  `wheel` still cancels.
- On touch, a **no-handle** list can't scroll the page via its items
  (`touch-action: none`) — use a handle for long lists.
- Screen-reader **browse-mode pickup** needs a real `<button>` handle; without
  a handle, AT users must switch to focus mode manually.
- The focus-mode wrapper `<div class="s11y-app">` adds one DOM level around
  the list, which can affect flex/grid layouts.
- With `clickToGrab: false`, browse-mode pickup does not work in Chromium (the
  screen reader's activation looks like a mouse tap there); users switch to
  focus mode instead.

The reasoning behind each of these lives in
[Known limitations](https://hensga.github.io/sorta11y/docs/reference/limitations/).

## Contributing & feedback

The most valuable contribution right now is **real screen-reader testing**: if
you can run one of the pending combinations in the
[AT test matrix](./docs/at-test-matrix.md) (NVDA + Firefox, JAWS + Chrome,
VoiceOver + Safari), please file an
[AT test report](https://github.com/Hensga/sorta11y/issues/new?template=at_report.yml)
— it asks for the scenario results and your AT and browser versions.

Questions, bug reports and feature ideas are welcome on the
[issue tracker](https://github.com/Hensga/sorta11y/issues/new/choose); for code
contributions, see [CONTRIBUTING.md](./CONTRIBUTING.md). Everyone taking part
follows the [Code of Conduct](./CODE_OF_CONDUCT.md).

Please report security vulnerabilities privately, not in public issues — see
[SECURITY.md](./SECURITY.md).

## Development

The library:

```bash
npm install        # dev tooling only — the shipped library has zero runtime deps
npm test           # Vitest + jsdom
npm run coverage   # enforce the >= 80% target
npm run format     # Prettier over the repo, docs site included
npm run demo       # quick serve → http://localhost:8090/site/
```

The documentation site lives in `website/` as its own npm project (Astro needs
Node ≥ 22.12), so the library's own `package.json` stays free of a build
toolchain:

```bash
npm --prefix website install    # Astro + Starlight
npm --prefix website run dev    # docs with hot reload → http://localhost:4321/sorta11y/docs/
npm run preview                 # full Pages layout  → http://localhost:8090/sorta11y/site/
```

`npm run demo` serves the repository root, where the `docs/` folder is a
directory of Markdown files — so the landing page's `docs` link only resolves
under `npm run preview`, which reproduces the deployed layout (landing page and
the built docs at the paths they actually get). Both use port 8090, so run one at
a time. `scripts/assemble-pages.sh` builds that layout and is shared with the
Pages workflow, so the preview stays a real test of the deploy rather than an
approximation of it.

## Origins

- [ConfTool](https://www.conftool.net) — supported sorta11y's early development
  with a real-world form integration and hands-on screen-reader testing.

## License

[MIT](./LICENSE) © 2026 Henning Huth. sorta11y ships with no runtime dependencies;
behavioural patterns were studied from MIT-licensed projects — see [NOTICE](./NOTICE).
