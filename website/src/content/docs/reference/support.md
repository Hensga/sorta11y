---
title: Browser & AT support
description: Which browsers are supported, what screen-reader testing has actually been done, and what is still open.
---

## Browsers

Evergreen **Chromium** (Chrome/Edge), **Firefox** and **Safari**.

The drag layer is built on
[Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)
with `setPointerCapture`, so there is no Internet Explorer support and no plan to
add it. The library runs entirely in the browser — Node is only needed for
development.

There is no build step and no transpilation: the source is written in
conservative syntax on purpose, so it can be dropped into a `<script>` tag or an
old bundler pipeline without a toolchain.

## Assistive technology

:::caution[Testing is incomplete]
This is the honest state of things, not a support claim. Three of the four
planned combinations have not been run yet.
:::

| Screen reader + browser | Status                                             |
| ----------------------- | -------------------------------------------------- |
| NVDA + Chrome           | Informal run passed the core scenarios, 2026-07-09 |
| NVDA + Firefox          | **Pending**                                        |
| JAWS + Chrome           | **Pending**                                        |
| VoiceOver + Safari      | **Pending**                                        |

The scenarios, and the protocol for running them, live in the
[AT test matrix](https://github.com/Hensga/sorta11y/blob/main/docs/at-test-matrix.md)
in the repository.

## Automated checks

The test suite runs on Vitest with jsdom and includes **axe-core** assertions, so
ARIA violations fail the build. That catches structural mistakes — it does not
tell you whether a real screen reader announces something sensibly. Automated
accessibility testing is a floor, not a ceiling.

Coverage is enforced at a 80% minimum via `npm run coverage`.

## Helping

The single most valuable contribution to sorta11y right now is **real
screen-reader testing**. If you can run one of the pending combinations, please
report what you find on the
[issue tracker](https://github.com/Hensga/sorta11y/issues) — with the scenario
numbers from the matrix and your AT/browser versions.

Negative results are just as useful as positive ones. A report saying "scenario 4
is confusing in JAWS because it announces X twice" is worth more than silence.
