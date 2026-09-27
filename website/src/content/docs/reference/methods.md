---
title: Methods
description: The static API on Sorta11y and the instance methods returned by create().
---

## Static methods

| Method                                      | What it does                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| `Sorta11y.create(el, options?)`             | Enhance a `<ul>`/`<ol>` and return the instance.                                  |
| `Sorta11y.get(el)`                          | Return the instance attached to an element, or `null`.                            |
| `Sorta11y.autoInit(root?)`                  | Enhance every `[data-sorta11y]` list found under `root` (default: `document`).    |
| `Sorta11y.fromSelect(select, options?)`     | Build a sortable list from a `<select multiple>` and keep it mirrored.            |
| `Sorta11y.mirrorToSelect(evt, select)`      | Mirror an order into a hidden `<select multiple>` for plain form submits.         |
| `Sorta11y.setDefaultLabels(labelsOrLocale)` | Set the default labels for lists created afterwards (an object or a locale name). |

### `create(el, options?)`

`el` may be an element or a selector string. A selector that matches nothing —
or anything else that doesn't resolve to an element — throws a `TypeError`.
Calling it twice on the same element returns the existing instance rather than
stacking a second one — use `Sorta11y.get(el)` if you only want to look one up.

```js
const list = Sorta11y.create("#my-list", { handle: ".drag-handle" });
```

### `autoInit(root?)`

Returns an array with the instance of every matching list — a list that was
already enhanced contributes its existing instance. Pass a `root` to scope it to
a freshly rendered fragment:

```js
const created = Sorta11y.autoInit(container);
```

It reads only `data-handle`, `data-application-role` and the reserved `data-rtl`
from the markup — see [Options](./options.md#declarative-markup).

### `fromSelect(select, options?)`

Accepts every regular option plus its own: `label`, `keepSelected`, `listClass`,
`handle`, `handleClass`, `handleText`, `handlePosition`, `handleLabel` and
`renderItem`. Returns the instance — its `.el` is the generated `<ul>`,
`.sourceSelect` the original `<select>` — or `null` if the target is not a
`<select>`. Details and examples in
[Enhancing `<select multiple>`](../guides/select.md).

### `mirrorToSelect(evt, select)`

Accepts either an `onChange` event object or a bare array of ids, so it works
from a callback and after a programmatic `sort()`. `select` may be an element or
a selector; if either argument is missing, it does nothing.

## Static properties

- `Sorta11y.version` — the library version string, e.g. `"0.1.0-alpha.0"`.
- `Sorta11y.locales` — the locale registry, keyed by language code. `en` is
  always there; locale files add themselves when loaded — see
  [Internationalisation](../guides/i18n.md).

## Instance methods

| Method                  | What it does                                                               |
| ----------------------- | -------------------------------------------------------------------------- |
| `refresh()`             | Re-resolve items and re-apply ARIA + tabindex after external DOM changes.  |
| `toArray()`             | Current order as an array of ids (`dataIdAttr` values; `null` if missing). |
| `sort(order, animate?)` | Reorder to the given array of ids — animated unless `animate` is `false`.  |
| `option(name, value?)`  | Read (1 argument) or live-update (2 arguments) an option.                  |
| `destroy()`             | Remove all enhancements, listeners and ARIA wiring. Idempotent.            |

### `refresh()`

Call it whenever something other than sorta11y changed the list's children — a
framework re-render, an item added or removed, a filter applied. It re-resolves
items, re-applies ARIA attributes and re-establishes grab targets. Safe to call
repeatedly.

```js
renderItems(); // your framework patched the DOM
list.refresh();
```

`refresh()` works with the nodes it finds. If the re-render replaced the focused
item with a new node, focus is not carried over — move it to the new node
yourself. A list enhanced while detached from the document gets its focus-mode
wrapper on the first `refresh()` after it is attached.

If the item currently held or dragged is no longer in the list, `refresh()` ends
that interaction cleanly. After a keyboard or tap grab:

- focus moves to the item now in the removed one's slot (or the last item) —
  but only if it was on the list or had fallen to `<body>`; focus elsewhere is
  left alone,
- the list's temporary `tabindex` is removed and the live region is cleared,
  without an announcement,
- `onEnd` fires with `newIndex: -1`; `onChange` does not.

A pointer drag of a removed row ends the same way, without a revert: `onEnd`
fires with `newIndex: -1` and `source: "pointer"`, and focus moves on if the row
held it. A press that had not become a drag yet just ends, with no event.

If other items come or go while one is held, a later cancel respects that: rows
the app removed stay removed, and rows it added keep their position. (A
_reorder_ of existing items by the app is not tracked — see
[Known limitations](./limitations.md#app-changes-during-a-grab).)

### `sort(order, animate?)`

```js
list.sort(["c", "a", "b"]); // animated
list.sort(["c", "a", "b"], false); // instant
```

This is a programmatic reorder — it does **not** fire `onChange` and announces
nothing, because nothing the user did caused it. If screen-reader users need to
know, tell them yourself. Only items that are out of place are moved — a `sort()`
to the current order leaves the DOM untouched — and other children of the list
after the items keep their place. Items not named in `order` follow the named
ones in their current order, and unknown ids are ignored.

The items are moved, not re-created, so whatever element in the list had focus
keeps it, and the page does not scroll. That holds mid-grab too: a `sort()`
while an item is held does not cancel the grab. Mirror the result into a form
field yourself if you need to:

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
