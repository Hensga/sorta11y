---
title: Styling
description: What the shipped CSS actually does, the state hooks you style against, and how to plug in utility classes.
---

sorta11y ships almost no visual CSS. It sets structural and state hooks and
leaves the look entirely to you — a sortable list should look like the rest of
your product, not like a library.

## What `sorta11y.css` contains

That is the whole stylesheet, near enough:

| Rule                     | Why it exists                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `.s11y-visually-hidden`  | Hides the live region and the keyboard-instructions element while keeping them announced |
| `.s11y-item`             | `position: relative`, so a grabbed row can lift above its neighbours                     |
| `.s11y-item--grabbed`    | `z-index: 1` during a keyboard grab                                                      |
| `.s11y-item--dragging`   | `z-index: 1` during a pointer drag                                                       |
| `prefers-reduced-motion` | Kills the slide transition on items                                                      |

There is no padding, no border, no background, no colour. The class prefix
`.s11y-` was chosen to avoid colliding with legacy jQuery UI `.ui-*` classes when
both run on the same page.

:::caution
Load the stylesheet even if you style everything yourself. Without
`.s11y-visually-hidden`, the live region and the instructions text render as
visible content on the page.
:::

## The state hooks

These two classes are the ones you actually design against:

| Class                  | When it is on                  |
| ---------------------- | ------------------------------ |
| `.s11y-item--grabbed`  | a keyboard grab is active      |
| `.s11y-item--dragging` | a pointer/touch drag is active |

A picked-up item **must** be visually distinguishable — otherwise sighted
keyboard users have no idea what they are moving. A minimal, honest treatment:

```css
.s11y-item--grabbed,
.s11y-item--dragging {
  background: #1a1a1a;
  color: #fff;
  box-shadow: 0 8px 20px rgb(0 0 0 / 0.16);
}

/* Inverted rows need an inverted focus ring, or it disappears. */
.s11y-item--grabbed :focus-visible,
.s11y-item--dragging :focus-visible {
  outline-color: #fff;
}
```

Do not rely on colour alone (WCAG 1.4.1) — pair it with a shadow, a border, an
offset, or a scale change.

## Utility-class frameworks

For Tailwind and friends, `grabbedClass` and `draggingClass` add **your** classes
alongside the built-in ones. Both accept a space-separated list:

```js
Sorta11y.create(el, {
  handle: ".drag-handle",
  grabbedClass: "ring ring-blue-500",
  draggingClass: "opacity-80",
});
```

They are additive, never replacements — the library's own structural CSS on the
built-in class (the `z-index` lift, the reduced-motion rule) keeps applying.

## The `.s11y-app` wrapper

The `role="application"` focus mode needs an element that is not the `<ul>`, so
the list is wrapped in a persistent `<div class="s11y-app">`. It carries no
styling of its own, but it is a real DOM level: if your list was a direct flex or
grid child, or you target it with `parent > ul` or sibling selectors, that extra
level will shift things.

Fix it by styling `.s11y-app` to be transparent to layout:

```css
.s11y-app {
  display: contents; /* if your layout can take it */
}
```

…or by moving your layout rules onto `.s11y-app` instead of the `<ul>`. Opting
out entirely with `applicationRole: false` also removes the wrapper, at the cost
of browse-mode support — see [Accessibility model](./accessibility.md).

## Handles

The library never styles handles. When `fromSelect()` generates them, they get a
`s11y-handle--left` or `s11y-handle--right` modifier class depending on
`handlePosition`, which is what you hook into:

```css
.s11y-handle--left {
  margin-inline-end: 0.5rem;
}
.s11y-handle--right {
  margin-inline-start: auto;
}
```

Keep handles at least 24×24 CSS pixels (WCAG 2.5.8), and remember they are real
buttons — they need a visible `:focus-visible` state.

## Motion

The slide is driven by inline `transform` / `transition` at runtime, configured
through `animation` (duration in ms) and `easing`. Set `animation: 0` to remove
it. Users with `prefers-reduced-motion: reduce` get an instant reposition
regardless of what you configure.
