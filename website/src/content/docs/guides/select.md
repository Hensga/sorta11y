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
   the id and its text as the row content, and inserts the new `<ul>` right
   before the select.
2. Generates a handle `<button>` per row, for full screen-reader support.
3. Hides the original `<select>` (`hidden` and `aria-hidden="true"`) but keeps
   it in the DOM and in the form.
4. Mirrors every reorder back into the select's option order, then calls your
   own `onChange`, if you passed one.

Every option is kept `selected` by default, so a plain submit sends them all, in
the new order.

Like `create()`, it returns the instance: its `.el` is the generated `<ul>`, and
`.sourceSelect` is the original `<select>`. If the target is not a `<select>`
(or the selector matches nothing), it returns `null`.

## Naming the list

The generated list needs an accessible name, like any list you enhance. It takes
the first one it finds:

1. the `label` option,
2. the select's `aria-labelledby` — copied as-is, so the list points at the
   same labelling elements; ignored if none of the ids it references exists,
3. the select's own `aria-label`,
4. the text of the select's `<label>` — `for="…"` or wrapping; whitespace is
   collapsed, and the select's own option texts are left out.

This follows the order of the accessible-name computation, where
`aria-labelledby` beats `aria-label`. A select that is already properly labelled
therefore needs nothing extra:

```html
<label for="groups">Group order</label>
<select id="groups" multiple>
  …
</select>
```

## `fromSelect`-only options

On top of every regular [option](../reference/options.md), it accepts:

| Option                      | Default             | What it does                                                                       |
| --------------------------- | ------------------- | ---------------------------------------------------------------------------------- |
| `label`                     | _from the select_   | Accessible name for the generated list — see [above](#naming-the-list)             |
| `keepSelected`              | `true`              | Keep every option `selected`, so a plain submit carries the full order             |
| `listClass`                 | —                   | Class(es) for the generated `<ul>`                                                 |
| `handle`                    | `true`              | `false` skips the generated handle button; the whole row becomes the grab target   |
| `handleClass`               | `"s11y-handle"`     | Class of the generated handle — also the `handle` selector passed on to `create()` |
| `handleText`                | `"⠿"`               | The handle's visible glyph                                                         |
| `handlePosition`            | `"left"`            | `"right"` puts the handle at the row end                                           |
| `handleLabel(text, option)` | _the option's text_ | Returns the handle's accessible name for a row                                     |
| `renderItem(li, option)`    | —                   | Called after each row is built — for row styling and custom content                |

Here `handle` is a switch, not a selector: the handle is always the generated
button.

By default each handle is named after its option's text, so every handle in the
list is distinguishable. `handleLabel` lets you phrase the name as an action
instead — "Move Marketing" rather than just "Marketing":

```js
Sorta11y.fromSelect("#groups", {
  handleLabel: (text) => `Move ${text}`,
});
```

### Why `handlePosition: "right"` is often better

The handle at the row end is easier to reach with a thumb on touch, and the row
then reads content-first — the name before the control. The generated button also
gets a `--left` / `--right` modifier class to style against — by default
`s11y-handle--left` / `s11y-handle--right`.

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
