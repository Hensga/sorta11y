#!/bin/sh
# Assemble the GitHub Pages artifact layout into <output-dir>.
#
# Used by BOTH .github/workflows/pages.yml (the real deploy) and `npm run
# preview` (local). That is the point: if the two ever drift, the local preview
# stops being a valid test of the deploy — so change this file, not a caller.
#
#   <out>/index.html  redirect stub
#   <out>/site/       landing page   — loads the library via ../src/
#   <out>/demo/       redirect       — the old demo now lives in the site's playground
#   <out>/src/        library source — hence all three side by side
#   <out>/docs/       Astro build of website/
#
# The docs mount point must match `base` in website/astro.config.mjs, or every
# link the docs generate will 404.
#
# Usage: scripts/assemble-pages.sh <output-dir>
set -eu

out=${1:?usage: assemble-pages.sh <output-dir>}

if [ ! -d website/dist ]; then
  echo "assemble-pages: website/dist is missing — run 'npm --prefix website run build' first" >&2
  exit 1
fi

rm -rf "$out"
mkdir -p "$out"
cp -r src site demo "$out/"
cp -r website/dist "$out/docs"
printf '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=site/"><title>sorta11y</title><a href="site/">sorta11y</a>' > "$out/index.html"
