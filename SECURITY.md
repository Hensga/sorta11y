# Security policy

## Supported versions

sorta11y is in alpha. Security fixes are made on the latest release only.

| Version       | Supported |
| ------------- | --------- |
| 0.1.x (alpha) | Yes       |

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report them privately through GitHub instead: open the repository's
**Security** tab and choose **Report a vulnerability**
(<https://github.com/Hensga/sorta11y/security/advisories/new>).

A useful report includes:

- what is affected and how to trigger it — a minimal reproduction helps most,
- the version or commit you tested,
- the impact you expect.

Reports are acknowledged within a week where possible. Once a fix is released,
the advisory is published and credits you, unless you prefer not to be named.

## Scope

sorta11y is a client-side DOM library with no runtime dependencies. Relevant
reports include, for example, markup or script injection through item text,
labels or locale strings, and anything that lets one list instance affect the
page beyond its own element. The documentation site and the demo pages in this
repository are in scope as well.
