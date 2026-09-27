/*!
 * sorta11y locale: en (English)
 * @license MIT · (c) 2026 Henning Huth
 *
 * Loading this file registers it on `Sorta11y.locales.en` — via the browser
 * global, or via the library module under CommonJS, Node ESM and bundlers —
 * and exports the labels object. This mirrors the library's built-in default —
 * load it only if you changed the default away from English and want to switch
 * back, or to be explicit with `{ locale: 'en' }`.
 *
 * Each function receives { itemLabel, position, total, announceTotal, order };
 * `position` is 1-indexed.
 */
(function (root, factory) {
  var labels = factory();
  /* v8 ignore start -- environment registration (browser global / CommonJS) */
  if (typeof module === "object" && typeof module.exports === "object") {
    module.exports = labels;
    // There is no window.Sorta11y here, so register on the library module
    // itself; module caches make it the same instance the app imported. No
    // try/catch on purpose: bundlers leave a require() inside one unconverted,
    // which would turn the registration back into a silent no-op.
    var lib = require("../sorta11y.js");
    (lib.locales = lib.locales || {}).en = labels;
  }
  if (root && root.Sorta11y) {
    (root.Sorta11y.locales = root.Sorta11y.locales || {}).en = labels;
  }
  /* v8 ignore stop */
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // "Position X of Y" — or just "Position X" when announceTotal is off.
  function pos(c) {
    return c.announceTotal
      ? "Position " + c.position + " of " + c.total
      : "Position " + c.position;
  }

  // The item's name followed by a separator, or nothing if it has no label.
  function name(c) {
    return c.itemLabel ? c.itemLabel + ", " : "";
  }

  return {
    // Accessible name for the role="application" region during a grab.
    applicationLabel: "Sortable list",
    instructions:
      "Sortable. Press Space to pick up, then the arrow keys to move, " +
      "Space to drop, Escape to cancel.",
    grabbed: function (c) {
      return (
        "Picked up. " +
        name(c) +
        pos(c) +
        ". Use the arrow keys to move, Space to drop."
      );
    },
    moved: function (c) {
      return pos(c) + ".";
    },
    dropped: function (c) {
      return "Dropped. " + name(c) + pos(c) + ".";
    },
    cancelled: function (c) {
      return (
        "Cancelled. " +
        (c.itemLabel ? c.itemLabel + " back at" : "Back at") +
        " " +
        pos(c) +
        "."
      );
    },
  };
});
