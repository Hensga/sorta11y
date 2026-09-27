// Import this BEFORE any src/locales/*.js file. Under CommonJS a locale file
// registers itself via require("../sorta11y.js") — and in Vitest that is
// Node's native require, which would load a second, separate copy of the
// library: the locale would register on that copy instead of the one the
// tests use, and v8 coverage would merge the barely-run copy into the same
// file (collapsing the numbers). Seeding Node's module cache with the
// test's own instance makes the require return it — exactly what a real
// module cache does for an app that imported the library first.
import { createRequire } from "node:module";
import Sorta11y from "../../src/sorta11y.js";

const require = createRequire(import.meta.url);
const file = require.resolve("../../src/sorta11y.js");
if (!require.cache[file]) {
  require.cache[file] = {
    id: file,
    filename: file,
    loaded: true,
    exports: Sorta11y,
  };
}
