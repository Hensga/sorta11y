---
title: Methods
description: The static API on Sorta11y and the instance methods returned by create().
---

## Static methods

| Method                                      | What it does                                                                        |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| `Sorta11y.create(el, options?)`             | Enhance a `<ul>`/`<ol>` and return the instance.                                    |
| `Sorta11y.get(el)`                          | Return the instance attached to an element, or `null`.                              |
| `Sorta11y.autoInit(root?)`                  | Enhance every `[data-sorta11y]` list found under `root` (default: `document`).      |
| `Sorta11y.fromSelect(select, options?)`     | Build a sortable list from a `<select multiple>` and keep it mirrored.              |
| `Sorta11y.mirrorToSelect(evt, select)`      | Mirror an order into a hidden `<select multiple>` for plain form submits.           |
| `Sorta11y.setDefaultLabels(labelsOrLocale)` | Set the global default announcement labels (an object or a registered locale name). |

### `create(el, options?)`

`el` may be an element or a selector string. Calling it twice on the same element
returns the existing instance rather than stacking a second one — use
`Sorta11y.get(el)` if you only want to look one up.

```js
const list = Sorta11y.create("#my-list", { handle: ".drag-handle" });
```

### `autoInit(root?)`

Returns an array of the instances it created. Pass a `root` to scope it to a
freshly rendered fragment:

```js
const created = Sorta11y.autoInit(container);
```

It reads only `data-handle`, `data-rtl` and `data-application-role` from the
markup — see [Options](./options.md).

### `fromSelect(select, options?)`

Accepts every regular option plus `handlePosition`, `handleLabel` and
`renderItem`. Details and examples in
[Enhancing `<select multiple>`](../guides/select.md).

### `mirrorToSelect(evt, select)`

Accepts either an `onChange` event object or a bare array of ids, so it works
from a callback and after a programmatic `sort()`.

## Instance methods

| Method                  | What it does                                                              |
| ----------------------- | ------------------------------------------------------------------------- |
| `refresh()`             | Re-resolve items and re-apply ARIA + tabindex after external DOM changes. |
| `toArray()`             | Current order as an array of `data-id`s.                                  |
| `sort(order, animate?)` | Reorder to the given array of ids, optionally with the slide animation.   |
| `option(name, value?)`  | Read (1 argument) or live-update (2 arguments) an option.                 |
| `destroy()`             | Remove all enhancements, listeners and ARIA wiring. Idempotent.           |

### `refresh()`

Call it whenever something other than sorta11y changed the list's children — a
framework re-render, an item added or removed, a filter applied. It re-resolves
items, re-applies ARIA attributes and re-establishes grab targets. Safe to call
repeatedly.

```js
renderItems(); // your framework patched the DOM
list.refresh();
```

### `sort(order, animate?)`

```js
list.sort(["c", "a", "b"]); // animated
list.sort(["c", "a", "b"], false); // instant
```

This is a programmatic reorder — it does **not** fire `onChange`, because nothing
the user did caused it. Mirror it into a form field yourself if you need to:

```js
list.sort(newOrder);
Sorta11y.mirrorToSelect(list.toArray(), select);
```

### `destroy()`

Removes every listener, every attribute the library added, the live region, the
instructions element and the `.s11y-app` wrapper. Idempotent, so calling it twice
is harmless. Call it before you unmount the list.

```js
list.destroy();
Sorta11y.get(el); // null
```
