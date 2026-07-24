// @ts-check
import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// The Pages artifact puts the landing page at /sorta11y/site/, the demo at
// /sorta11y/demo/ and this docs build at /sorta11y/docs/. `base` has to match
// that mount point or every generated link 404s on GitHub Pages.
const SITE = "https://hensga.github.io";
const BASE = "/sorta11y/docs";
const REPO = "https://github.com/Hensga/sorta11y";

const DOCS_DIR = toPosix(
  fileURLToPath(new URL("./src/content/docs", import.meta.url)),
);

function toPosix(p) {
  return p.split(path.sep).join("/");
}

/**
 * Rewrite relative Markdown links (`./guides/i18n.md`) to their built page URLs
 * (`/sorta11y/docs/guides/i18n/`).
 *
 * Astro does not resolve these for us, so without this they ship verbatim and
 * 404. Writing base-prefixed absolute links in the pages instead would work,
 * but hardcodes the mount point into 13 files and breaks the moment it moves —
 * and it stops the sources resolving when someone browses them on GitHub.
 */
function rehypeDocsLinks() {
  return (tree, file) => {
    const source = file && (file.history?.[0] || file.path);
    if (!source) return;
    const fromDir = path.posix.dirname(
      path.posix.relative(DOCS_DIR, toPosix(source)),
    );

    walk(tree, (node) => {
      if (node.tagName !== "a") return;
      const href = node.properties?.href;
      // Leave anchors, absolute paths and anything with a protocol alone.
      if (typeof href !== "string" || !/^\.{0,2}\//.test(href)) return;
      const [target, hash] = href.split("#");
      if (!/\.mdx?$/.test(target)) return;

      let slug = path.posix
        .normalize(path.posix.join(fromDir, target))
        .replace(/\.mdx?$/, "")
        .replace(/(^|\/)index$/, "");
      node.properties.href =
        `${BASE}/${slug}${slug ? "/" : ""}` + (hash ? `#${hash}` : "");
    });
  };
}

function walk(node, visit) {
  if (node.type === "element") visit(node);
  for (const child of node.children || []) walk(child, visit);
}

export default defineConfig({
  site: SITE,
  base: BASE,
  // GitHub Pages serves directory/index.html — the default, spelled out so the
  // URL shape (/docs/installation/) is a deliberate choice, not an accident.
  build: { format: "directory" },
  markdown: { rehypePlugins: [rehypeDocsLinks] },
  integrations: [
    starlight({
      title: "sorta11y",
      description:
        "Accessible, zero-dependency vanilla-JS sortable list — keyboard reordering and pointer drag with screen-reader announcements.",
      favicon: "/favicon.svg",
      social: [
        { icon: "github", label: "GitHub", href: REPO },
        {
          icon: "npm",
          label: "npm",
          href: "https://www.npmjs.com/package/sorta11y",
        },
      ],
      editLink: { baseUrl: `${REPO}/edit/main/website/` },
      customCss: ["./src/styles/theme.css"],
      // The landing page and the demo live outside this Astro build. Starlight
      // prefixes `base` onto every sidebar `link`, so a root-relative path here
      // would become /sorta11y/docs/sorta11y/site/ — full URLs it leaves alone.
      sidebar: [
        { label: "Introduction", slug: "index" },
        {
          label: "Getting started",
          items: [
            { label: "Installation", slug: "installation" },
            { label: "Quick start", slug: "quick-start" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Keyboard", slug: "guides/keyboard" },
            { label: "Pointer & touch", slug: "guides/pointer-and-touch" },
            { label: "Accessibility model", slug: "guides/accessibility" },
            { label: "Styling", slug: "guides/styling" },
            { label: "Internationalisation", slug: "guides/i18n" },
            { label: "Enhancing <select multiple>", slug: "guides/select" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Options", slug: "reference/options" },
            { label: "Methods", slug: "reference/methods" },
            { label: "Browser & AT support", slug: "reference/support" },
            { label: "Known limitations", slug: "reference/limitations" },
          ],
        },
        {
          label: "Elsewhere",
          items: [
            {
              label: "Live demo & playground",
              link: `${SITE}/sorta11y/site/`,
            },
            { label: "Changelog", link: `${REPO}/blob/main/CHANGELOG.md` },
            { label: "Issue tracker", link: `${REPO}/issues` },
          ],
        },
      ],
    }),
  ],
});
