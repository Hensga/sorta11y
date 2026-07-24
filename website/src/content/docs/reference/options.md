---
title: Options
description: Every option accepted by Sorta11y.create(), with defaults and runtime behaviour.
---

All options are passed as the second argument to
[`Sorta11y.create()`](./methods.md), and every one of them can be read or changed
at runtime with `list.option(name, value)`.

## Structure

| Option         | Default     | What it does                                                                                                                    |
| -------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `itemSelector` | `"> li"`    | Which children count as items. Changing it re-resolves the list.                                                                |
| `handle`       | `null`      | Selector for a drag handle inside each item (a real `<button>` is recommended). Without one, the whole item is the grab target. |
| `dataIdAttr`   | `"data-id"` | Attribute that identifies items — used by focus restore, `toArray()` and `sort()`.                                              |

## Interaction layers

| Option            | Default | What it does                                                                                                      |
| ----------------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| `keyboard`        | `true`  | The keyboard grab / move / drop layer. See [Keyboard](../guides/keyboard.md).                                     |
| `pointer`         | `true`  | The pointer/touch drag layer. See [Pointer & touch](../guides/pointer-and-touch.md).                              |
| `clickToGrab`     | `true`  | A pointer tap (no drag) picks up / drops. `false` = the pointer can only drag, which removes the WCAG 2.5.7 path. |
| `dragOnItem`      | `false` | With a handle: pointer drags/taps may start anywhere on the item. Keyboard and AT semantics stay on the handle.   |
| `dragOnItemTouch` | `false` | Widen the touch/pen drag surface to the whole item — only for short, non-scrolling lists.                         |

## Accessibility

| Option            | Default    | What it does                                                                                                       |
| ----------------- | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| `applicationRole` | `true`     | Toggle `role="application"` on a wrapper **only** while an item is held, so NVDA/JAWS pass the arrow keys through. |
| `announceTotal`   | `true`     | Include "of Y" in position announcements.                                                                          |
| `liveness`        | `"polite"` | `aria-live` value for the announcement region. Applied immediately when changed.                                   |
| `labels`          | `null`     | Your own announcement strings — always wins over `locale`.                                                         |
| `locale`          | `null`     | Pick a registered locale for the announcements.                                                                    |
| `rtl`             | `"auto"`   | Right-to-left phrasing. `"auto"` follows the document/element direction.                                           |

## Presentation

| Option          | Default                        | What it does                                        |
| --------------- | ------------------------------ | --------------------------------------------------- |
| `animation`     | `150`                          | FLIP slide duration in ms; `0` disables it.         |
| `easing`        | `"cubic-bezier(0.2, 0, 0, 1)"` | Easing for the slide.                               |
| `grabbedClass`  | `null`                         | Extra class(es) on the item during a keyboard grab. |
| `draggingClass` | `null`                         | Extra class(es) on the item during a pointer drag.  |

Both class options accept a space-separated list and are **additive** — the
built-in `.s11y-item--grabbed` / `.s11y-item--dragging` hooks stay on. See
[Styling](../guides/styling.md).

## Callbacks

| Option     | Fires                                                                    |
| ---------- | ------------------------------------------------------------------------ |
| `onStart`  | When an item is picked up, by keyboard or pointer.                       |
| `onChange` | After a **committed reorder** — only when the position actually changed. |
| `onEnd`    | After every drop **and** every cancel, whether or not anything moved.    |

All three receive the same event object:

```js
const evt = {
  item, // HTMLElement — the item that moved
  oldIndex, // number — 0-indexed position before
  newIndex, // number — 0-indexed position after
  order, // string[] — the full order of data-ids afterwards
  source, // "keyboard" | "pointer"
};
```

Use `onChange` to persist. Use `onEnd` for teardown that has to run either way
(clearing a busy flag, say), and remember it fires on cancels too.

## Declarative markup

`Sorta11y.autoInit()` enhances every element carrying `[data-sorta11y]`. It reads
**three** attributes from the markup:

| Attribute               | Maps to                                          |
| ----------------------- | ------------------------------------------------ |
| `data-handle`           | `handle`                                         |
| `data-rtl`              | `rtl`                                            |
| `data-application-role` | `applicationRole` (only `"false"` has an effect) |

```html
<ul data-sorta11y data-handle=".drag-handle" aria-label="Reorder tasks">
  …
</ul>
```

:::note
Other options have no `data-*` equivalent — anything beyond those three needs
`Sorta11y.create()` with an options object.
:::

## Changing options at runtime

`option(name, value)` applies changes immediately and does whatever re-wiring is
needed:

- `liveness` updates the live region's `aria-live` in place.
- `labels` / `locale` re-resolve the label set and re-render the hidden
  instructions text.
- `keyboard` / `pointer` attach or detach their listeners, cancelling any grab in
  progress first, so the flag is never a lie.
- `applicationRole` cancels a live grab and re-syncs the container role.
- `handle`, `itemSelector`, `dataIdAttr`, `dragOnItem`, `dragOnItemTouch` trigger
  a `refresh()` to re-resolve items and grab targets.

```js
list.option("animation"); // read
list.option("animation", 0); // write
```
