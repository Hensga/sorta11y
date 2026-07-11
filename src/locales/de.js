/*!
 * sorta11y locale: de (Deutsch)
 * @license MIT · (c) 2026 Henning Huth
 *
 * German (Deutsch) screen-reader announcements. Registers on
 * `Sorta11y.locales.de` in the browser; exports the labels object under
 * CommonJS. Each function receives { itemLabel, position, total, announceTotal,
 * order }; `position` is 1-indexed.
 */
(function (root, factory) {
  var labels = factory();
  /* v8 ignore start -- environment registration (browser global / CommonJS) */
  if (typeof module === "object" && typeof module.exports === "object") {
    module.exports = labels;
  }
  if (root && root.Sorta11y) {
    (root.Sorta11y.locales = root.Sorta11y.locales || {}).de = labels;
  }
  /* v8 ignore stop */
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // "Position X von Y" — or just "Position X" when announceTotal is off.
  function pos(c) {
    return c.announceTotal
      ? "Position " + c.position + " von " + c.total
      : "Position " + c.position;
  }

  // The item's name followed by a separator, or nothing if it has no label.
  function name(c) {
    return c.itemLabel ? c.itemLabel + ", " : "";
  }

  return {
    // Barrierefreier Name der role="application"-Region während einer Aufnahme.
    applicationLabel: "Sortierbare Liste",
    instructions:
      "Sortierbar. Leertaste zum Aufnehmen, dann mit den Pfeiltasten " +
      "verschieben, Leertaste zum Ablegen, Escape zum Abbrechen.",
    grabbed: function (c) {
      return (
        "Aufgenommen. " +
        name(c) +
        pos(c) +
        ". Mit den Pfeiltasten verschieben, Leertaste zum Ablegen."
      );
    },
    moved: function (c) {
      return pos(c) + ".";
    },
    dropped: function (c) {
      return "Abgelegt. " + name(c) + pos(c) + ".";
    },
    cancelled: function (c) {
      return (
        "Abgebrochen. " +
        (c.itemLabel ? c.itemLabel + " wieder" : "Wieder") +
        " an " +
        pos(c) +
        "."
      );
    },
  };
});
