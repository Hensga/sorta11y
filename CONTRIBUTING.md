# Contributing to sorta11y

Thanks for helping make sortable lists usable for everyone. sorta11y has a
single maintainer, so replies can take a few days — small, well-described
contributions are the easiest to review and merge.

## Ways to help

1. **Test with a screen reader.** This is the most valuable contribution right
   now, and it needs no code. The [AT test matrix](./docs/at-test-matrix.md)
   defines three combinations — NVDA + Firefox, JAWS + Chrome and
   VoiceOver + Safari — and ten scenarios, S1–S10; none of the official runs
   has been done yet. Run the scenarios against the
   [playground](https://hensga.github.io/sorta11y/site/) or your own page and
   file an
   [AT test report](https://github.com/Hensga/sorta11y/issues/new?template=at_report.yml).
   Other combinations (NVDA + Chrome, Narrator, TalkBack, VoiceOver on iOS,
   Orca …) are welcome too, and a failure or a "this was confusing" is as
   useful as a pass.
2. **Report a bug** with the
   [bug report form](https://github.com/Hensga/sorta11y/issues/new?template=bug_report.yml).
   A minimal reproduction (CodePen, JSFiddle, StackBlitz …) helps most.
3. **Suggest a feature** with the
   [feature request form](https://github.com/Hensga/sorta11y/issues/new?template=feature_request.yml).
   sorta11y does one thing — a single vertical list anyone can reorder — so
   nested lists, transfer between lists and grid or horizontal reordering are
   [out of scope](https://hensga.github.io/sorta11y/docs/reference/limitations/#out-of-scope).
4. **Improve the docs.** The documentation site's sources live in
   [`website/src/content/docs/`](./website/src/content/docs/); every page links
   to its source with "Edit page".
5. **Send a fix or a feature.** For anything beyond a small fix, please open an
   issue first, so we can agree on the approach before you invest the time.

## Development setup

You need Node `^22.22.2 || ^24.15.0 || >=26` and Python 3 (the local server is
`python3 -m http.server`). Node is for the dev tooling only — Vitest, jsdom,
axe-core and Prettier; the library itself runs in the browser.

```bash
npm ci                 # install the dev tooling
npm test               # Vitest + jsdom; one file: npm test -- test/keyboard.test.js
npm run test:watch     # re-run on change
npm run coverage       # the suite plus the 80 % coverage thresholds
npm run format         # Prettier over the repo
npm run format:check   # the formatting check CI runs
npm run demo           # serve the repo root → http://localhost:8090/site/
```

`npm run demo` serves the landing page, whose playground loads the library
straight from `src/` — reload the page to see a change.

The documentation site is its own npm project in `website/` (Astro +
Starlight, Node ≥ 22.12), so the library's `package.json` stays free of a build
toolchain:

```bash
cd website && npm ci && npm run dev   # docs with hot reload → http://localhost:4321/sorta11y/docs/
```

Once `website/` is installed, `npm run preview` (from the repository root)
builds the docs and serves the full GitHub Pages layout at
<http://localhost:8090/sorta11y/site/>. It uses the same port as
`npm run demo`, so run one at a time.

## Project constraints

Every change has to fit these:

- **Zero runtime dependencies.** `package.json` has no `dependencies` and keeps
  it that way. Dev tooling goes in `devDependencies`, docs tooling in
  `website/`.
- **No build step.** `src/sorta11y.js` is the file that ships — to npm and the
  CDNs — exactly as written: a hand-written UMD module (browser global and
  CommonJS) with no transpiler, bundler or minifier in between. The same goes
  for `src/sorta11y.css` and `src/locales/*.js`.
- **ES2017 syntax at most**, for evergreen Chromium, Firefox and Safari. Follow
  the existing style (`var`, `function`); no optional chaining, `??`, class
  fields or anything newer. Pointer Events with `setPointerCapture` are
  assumed; Internet Explorer is not supported.
- **Accessibility first.** No regression in keyboard or screen-reader
  behaviour. The grab / move / drop model, the announcements, the focus
  handling and the temporary `role="application"` are deliberate, and partly
  measured against real screen readers — read the
  [design notes](./docs/accessibility.md) and the
  [AT test matrix](./docs/at-test-matrix.md) before changing them. The axe-core
  checks in `test/axe.test.js` must stay clean.
- **Docs follow behaviour.** A change in behaviour or API updates, in the same
  pull request, `README.md` and the matching pages in
  `website/src/content/docs/`; the design notes in `docs/accessibility.md` when
  an implementation decision changes; and the AT test matrix when a scenario's
  expected result changes (the AT report form,
  `.github/ISSUE_TEMPLATE/at_report.yml`, mirrors its scenarios).

## Tests

The suite runs on Vitest with jsdom: `test/*.test.js`, with shared helpers in
[`test/helpers/dom.js`](./test/helpers/dom.js).

- **Bug fixes start with a failing test.** Add a regression test that
  reproduces the bug and fails, then fix the code until it passes. Put it next
  to the related tests (`keyboard.test.js`, `pointer.test.js`, `focus.test.js`
  …, or `regression.test.js`).
- **Assert the mechanism, not the wording.** Create lists with the helpers'
  deterministic `LABELS` (`"MOVE 2/4"`) and read announcements through
  `liveRegionOf()`, so a test checks the 1-indexed position and total, not the
  built-in English text.
- **Keys go where focus is.** `press(target, key)` dispatches to
  `document.activeElement`, like a browser; `target` is only the fallback when
  focus is on `<body>`. Focus the grab target first, and remember that a grab
  moves focus onto the list itself. On a focused `<button>`, `press()` also
  fires the activation click (Enter on keydown, Space on keyup), as the
  engines do.
- **jsdom has no layout.** Sizes and positions are zero and nothing really
  scrolls or animates; `test/animation.test.js` shows how geometry is stubbed.
  Changes to layout, scrolling, the FLIP animation or pointer geometry (drag
  threshold, swap detection, touch and pen) also need a manual check in real
  browsers — Chromium, Firefox and Safari, plus a touch device for touch
  changes.
- **jsdom has no screen reader.** axe catches broken ARIA structure, not what
  is announced or when a screen reader switches modes. If a change depends on
  real assistive technology, describe in the pull request what you tested with
  which screen reader and browser — or that you could not, so it gets checked
  before a release.
- `npm run coverage` fails below 80 % lines, branches, functions or statements
  in `src/`.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):
`type(scope): summary`, with `feat`, `fix`, `docs`, `test`, `refactor`,
`build`, `ci` or `chore` and an optional scope — for example
`fix(i18n): …` or `docs(readme): …`.

User-facing changes — behaviour, API, announcements, supported environments —
also get an entry in [`CHANGELOG.md`](./CHANGELOG.md) under `## [Unreleased]`
at the top (add the heading if it is missing), in the
[Keep a Changelog](https://keepachangelog.com/) groups: Added, Changed,
Deprecated, Removed, Fixed, Security. Tests, CI and internal refactors need no
entry. Version numbers and release headings are set by the maintainer at
release time.

## Pull requests

- Keep them small and focused: one fix or one feature per pull request.
- CI must pass: `test (22)` and `test (24)` run `npm ci`, `npm run coverage`
  and `npm run format:check` on Node 22 and 24; `docs` builds the docs site.
  Run `npm run coverage && npm run format:check` before you push, and
  `cd website && npm run build` if you touched `website/`.
- Fill in the pull request template, including the accessibility impact: what
  changes for keyboard and screen-reader users, and how you checked it.

## Security issues

Never report a vulnerability in a public issue or pull request — see
[SECURITY.md](./SECURITY.md) for private reporting.

## Code of Conduct

Everyone taking part in this project is expected to follow the
[Code of Conduct](./CODE_OF_CONDUCT.md).

## License

sorta11y is [MIT-licensed](./LICENSE). By contributing, you agree that your
contributions are licensed under the same terms.
