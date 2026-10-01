// @vitest-environment node
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Locale files must register themselves on the library in every environment,
// not only on the browser global — otherwise `import "sorta11y/locales/de"` +
// `{ locale: "de" }` silently falls back to English under CommonJS, Node ESM
// and bundlers. Each case runs in a fresh Node process against the package's
// own `exports` map (self-reference by name), exactly as a consumer imports it.
const ROOT = fileURLToPath(new URL("..", import.meta.url));

function run(args, source) {
  return execFileSync(process.execPath, [...args, "-e", source], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
}

describe("sorta11y — locale self-registration outside the browser", () => {
  it("registers under CommonJS require()", () => {
    const out = run(
      [],
      `const S = require("sorta11y");
       const de = require("sorta11y/locales/de");
       console.log(S.locales.de === de);`,
    );
    expect(out).toBe("true");
  });

  it("registers under Node ESM import (side-effect import)", () => {
    const out = run(
      ["--input-type=module"],
      `import S from "sorta11y";
       import "sorta11y/locales/de";
       console.log(typeof S.locales.de === "object" &&
         S.locales.de.applicationLabel === "Sortierbare Liste");`,
    );
    expect(out).toBe("true");
  });

  // The UMD files assign `module.exports = factory()`, which Node's ESM loader
  // cannot see through — named imports (which the TypeScript declarations
  // allow) need the exports spelled out for its static analysis.
  it("supports named imports under Node ESM (library and locales)", () => {
    const out = run(
      ["--input-type=module"],
      `import { create, get, autoInit, fromSelect, mirrorToSelect,
         setDefaultLabels, locales, version } from "sorta11y";
       import { grabbed, applicationLabel } from "sorta11y/locales/de";
       import { dropped } from "sorta11y/locales/en";
       console.log([create, get, autoInit, fromSelect, mirrorToSelect,
         setDefaultLabels, grabbed, dropped].every((f) => typeof f === "function")
         && typeof locales === "object" && typeof version === "string"
         && applicationLabel === "Sortierbare Liste");`,
    );
    expect(out).toBe("true");
  });

  it("registers regardless of import order", () => {
    const out = run(
      ["--input-type=module"],
      `import "sorta11y/locales/de";
       import S from "sorta11y";
       console.log(typeof S.locales.de === "object");`,
    );
    expect(out).toBe("true");
  });
});
