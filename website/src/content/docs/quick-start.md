---
title: Quick start
description: The smallest useful sorta11y setup — server-rendered markup, one create() call, and a change handler.
---

The server renders the list; sorta11y enhances it. That order matters — if the
JavaScript never arrives, the page is still a readable list.

## 1. Render the list

Give every item a stable id and, ideally, a real `<button>` as the drag handle.
The handle being a button is what makes pickup work from a screen reader's
browse mode — see [Accessibility model](./guides/accessibility.md).

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

The `aria-label` on the list gives the widget a name. The `data-id` values are
what `toArray()`, `sort()` and the `order` in every event report.

## 2. Enhance it

```js
const list = Sorta11y.create(document.querySelector("#my-list"), {
  handle: ".drag-handle",
  onChange: (evt) => {
    // evt = { item, oldIndex, newIndex, order, source: 'keyboard' | 'pointer' }
    fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: evt.order }),
    });
  },
});
```

`onChange` fires **once per committed reorder** — not on every intermediate move
while an item is held, and not at all when the user cancels with <kbd>Esc</kbd>.

## 3. Or go declarative

Mark lists in the markup and let sorta11y find them. Only three options can be
set this way — `data-handle`, `data-application-role` and the reserved
`data-rtl`; everything else needs `Sorta11y.create()` with an options object
(see [Options](./reference/options.md#declarative-markup)):

```html
<ul data-sorta11y data-handle=".drag-handle" aria-label="Reorder tasks">
  …
</ul>
<script>
  Sorta11y.autoInit();
</script>
```

This is the path for server-rendered apps that would rather not ship a bespoke
init script per page.

## Working with a framework

sorta11y works inside anything that renders a real `<ul>`. The one rule: after
the framework re-renders the items, call `list.refresh()` so ARIA attributes and
the tab stops are re-applied to the new nodes.

```js
// after your framework has patched the DOM
list.refresh();
```

sorta11y keeps focus on the element that had it, so if a re-render **replaces**
the focused item with a new node, move focus to the new node yourself.

There are no wrapper packages yet. If you unmount the list, call
`list.destroy()` — it is idempotent and removes every listener, attribute and
wrapper the library added.

## What you just got

- Keyboard reordering with <kbd>Space</kbd> / arrows / <kbd>Esc</kbd> —
  [Keyboard](./guides/keyboard.md)
- Pointer drag **and** a tap-to-place alternative —
  [Pointer & touch](./guides/pointer-and-touch.md)
- Every committed move announced through a polite live region
- Focus kept on the moved item after every reorder

What you do **not** get automatically is a visible picked-up state. The library
ships state classes but no visual design — add that next in
[Styling](./guides/styling.md).
