---
title: Enhancing <select multiple>
description: Turn a multi-select into an accessible sortable list that still submits with a plain form post.
---

If your form renders a `<select multiple>` rather than a server-side `<ul>`,
`Sorta11y.fromSelect()` builds the accessible list for you and keeps the select
mirrored underneath — so an ordinary, non-AJAX form submit still carries the
order.

## The basic case

```js
Sorta11y.fromSelect("#groups", {
  labels, // i18n, exactly as for create()
  handlePosition: "right",
  renderItem: (li, option) => {
    li.style.background = option.style.background;
  },
});
```

What it does:

1. Builds one `<li data-id="…">` per `<option>`, using the option's `value` as
   the id and its text as the row content.
2. Generates a handle `<button>` per row, for full screen-reader support.
3. Hides the original `<select>` in the DOM but keeps it in the form.
4. Mirrors every reorder back into the select's option order.

Every option is kept `selected` by default, so a plain submit sends them all, in
the new order.

## `fromSelect`-only options

On top of every regular [option](../reference/options.md), it accepts:

| Option                   | Default     | What it does                                         |
| ------------------------ | ----------- | ---------------------------------------------------- |
| `handle`                 | _generated_ | `false` skips the generated handle button entirely   |
| `handlePosition`         | `"left"`    | `"right"` puts the handle at the row end             |
| `handleLabel(text)`      | —           | Returns the handle's accessible name for a given row |
| `renderItem(li, option)` | —           | Hook for row styling and custom content              |

`handleLabel` is worth setting — the default name is generic, and a screen-reader
user hearing "Move, button" eight times in a row learns nothing:

```js
Sorta11y.fromSelect("#groups", {
  handleLabel: (text) => `Move ${text}`,
});
```

### Why `handlePosition: "right"` is often better

The handle at the row end is easier to reach with a thumb on touch, and the row
then reads content-first — the name before the control. The generated button also
gets a `s11y-handle--left` / `s11y-handle--right` modifier class to style
against.

## Mirroring an existing list into a select

If you already have a `<ul>` and just want a plain form submit to carry the
order, use `mirrorToSelect` from your `onChange` instead:

```js
const select = document.querySelector("#order-field");

Sorta11y.create(list, {
  handle: ".drag-handle",
  onChange: (evt) => Sorta11y.mirrorToSelect(evt, select),
});
```

It matches each item's `data-id` against the options' `value` and reorders the
option nodes. It accepts either an event object or a bare order array, so it also
works after a programmatic `sort()`:

```js
list.sort(["c", "a", "b"]);
Sorta11y.mirrorToSelect(list.toArray(), select);
```

## Accessibility notes

- The generated handle is a real `<button>`, which is what makes browse-mode
  pickup work — see [Accessibility model](./accessibility.md).
- Consumer-specific styling stays out of the library on purpose: `renderItem` is
  the only hook, so the library never guesses at your design system.
- The hidden `<select>` stays in the DOM and in the form. Do not remove it — it
  is what makes the progressive-enhancement story work.
