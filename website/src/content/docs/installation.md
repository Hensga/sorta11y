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

| Specifier            | What it is                                                        |
| -------------------- | ----------------------------------------------------------------- |
| `sorta11y`           | The library (`src/sorta11y.js`)                                   |
| `sorta11y/style.css` | Structural and state CSS hooks                                    |
| `sorta11y/locales/*` | Optional locale files (`de`, `en`) — see [i18n](./guides/i18n.md) |

### TypeScript

TypeScript declarations ship with the package — there is no `@types/sorta11y`
to install. They cover `require("sorta11y")`, `import Sorta11y from "sorta11y"`
and, on a page that loads the `<script>`, the global `Sorta11y`, as well as the
locale files and the stylesheet import. The option, event and label types live
on the `Sorta11y` namespace:

```ts
import Sorta11y from "sorta11y";

const options: Sorta11y.Options = {
  handle: ".drag-handle",
  onChange: (evt: Sorta11y.SortEvent) => save(evt.order),
};
const list: Sorta11y = Sorta11y.create("#tasks", options);
```

Named imports work as well — `import { create } from "sorta11y"` — in bundlers
and in Node's native ESM loader alike.

## CDN — no build step

The file is a UMD bundle, so a plain `<script>` tag works and puts `Sorta11y` on
`window`. For a quick trial, the moving `alpha` tag is fine:

```html
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/sorta11y@alpha/src/sorta11y.css"
/>
<script src="https://cdn.jsdelivr.net/npm/sorta11y@alpha/src/sorta11y.js"></script>
```

`unpkg.com` works the same way.

### In production: pin a version and add SRI

For production, pin the exact version so a new pre-release can't change
behaviour under you, and add
[Subresource Integrity](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity)
(`integrity` + `crossorigin="anonymous"`) so the browser refuses a file that
doesn't match the one you reviewed:

```html
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/sorta11y@0.1.0-alpha.0/src/sorta11y.css"
  integrity="sha384-HASH_FROM_JSDELIVR"
  crossorigin="anonymous"
/>
<script
  src="https://cdn.jsdelivr.net/npm/sorta11y@0.1.0-alpha.0/src/sorta11y.js"
  integrity="sha384-HASH_FROM_JSDELIVR"
  crossorigin="anonymous"
></script>
```

Replace each placeholder with that file's hash: the
[package page on jsDelivr](https://www.jsdelivr.com/package/npm/sorta11y) shows
the SRI hash for every file of every version. A hash matches exactly one file,
so:

- the moving `@alpha` tag can't carry one — SRI needs the pinned version;
- every file you load, locale files included, needs its own `integrity`;
- when you bump the pinned version, update the hashes with it.

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
- **Node:** only for development — Node 22.22+ or 24.15+ to run the test suite
  and to build this documentation site. The library itself runs entirely in the
  browser and has no runtime dependencies.

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
