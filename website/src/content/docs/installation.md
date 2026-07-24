---
title: Installation
description: Install sorta11y from npm or load it straight from a CDN — no build step required.
---

sorta11y is a pre-release. Install it via the `alpha` tag, or pin the exact
version if you want to be sure nothing moves under you.

## npm

```bash
npm install sorta11y@alpha
```

```js
import Sorta11y from "sorta11y";
import "sorta11y/style.css";
```

The package exposes three entry points:

| Specifier             | What it is                                             |
| --------------------- | ------------------------------------------------------ |
| `sorta11y`            | The library (`src/sorta11y.js`)                        |
| `sorta11y/style.css`  | Structural and state CSS hooks                         |
| `sorta11y/locales/de` | An optional locale file — see [i18n](./guides/i18n.md) |

## CDN — no build step

The file is a UMD bundle, so a plain `<script>` tag works and puts `Sorta11y` on
`window`:

```html
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/sorta11y@alpha/src/sorta11y.css"
/>
<script src="https://cdn.jsdelivr.net/npm/sorta11y@alpha/src/sorta11y.js"></script>
```

`unpkg.com` works the same way. For production, pin the exact version rather
than the `alpha` tag so a new pre-release can't change behaviour under you:

```html
<script src="https://cdn.jsdelivr.net/npm/sorta11y@0.1.0-alpha.0/src/sorta11y.js"></script>
```

## Straight from the repository

There is no build step between the source and what you ship — `src/sorta11y.js`
is the file. If you would rather vendor it, copy `src/sorta11y.js` and
`src/sorta11y.css` out of
[the repository](https://github.com/Hensga/sorta11y) and serve them yourself.

## The stylesheet

`sorta11y.css` is tiny and deliberately unopinionated: a screen-reader-only
helper class for the live region, `position: relative` on items so a grabbed row
can lift above its neighbours, two state hooks, and a `prefers-reduced-motion`
rule. It contains **no visual styling** — that part is yours, see
[Styling](./guides/styling.md).

You do need to load it. Without the `.s11y-visually-hidden` rule the live region
and the keyboard instructions become visible on the page.

## Requirements

- **Browsers:** evergreen Chromium (Chrome/Edge), Firefox and Safari. The drag
  layer builds on Pointer Events with `setPointerCapture`, so there is no
  Internet Explorer support. Details in
  [Browser & AT support](./reference/support.md).
- **Node:** only for development (Node ≥ 20 to run the test suite). The library
  itself runs entirely in the browser and has no runtime dependencies.

## Verify it works

```html
<ul id="check">
  <li data-id="a">First</li>
  <li data-id="b">Second</li>
</ul>
<script>
  const list = Sorta11y.create(document.querySelector("#check"));
  console.log(list.toArray()); // ["a", "b"]
</script>
```

Tab to the first item, press <kbd>Space</kbd>, then <kbd>↓</kbd>, then
<kbd>Space</kbd> again. The order should change and, with a screen reader
running, each step should be spoken. Next: [Quick start](./quick-start.md).
