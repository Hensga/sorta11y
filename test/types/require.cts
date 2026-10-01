// A CommonJS consumer: `require()` of the library, a locale file and the
// package's package.json, all through the "exports" map.
import Sorta11y = require("sorta11y");
import de = require("sorta11y/locales/de");
import en = require("sorta11y/locales/en");
import pkg = require("sorta11y/package.json");

const options: Sorta11y.Options = { handle: ".drag-handle", locale: "de" };
const list: Sorta11y = Sorta11y.create("#tasks", options);
const event: Sorta11y.SortEvent | null = null;
Sorta11y.setDefaultLabels(de).setDefaultLabels(en);
const version: string = pkg.version;
void [list, event, version];

// @ts-expect-error there is no such locale file
import fr = require("sorta11y/locales/fr");
void fr;
