// An ES module consumer: the default import is the CommonJS module.exports
// (Node's ESM interop, or a bundler's).
import Sorta11y from "sorta11y";
import de from "sorta11y/locales/de";
import "sorta11y/locales/en"; // registers Sorta11y.locales.en
import "sorta11y/style.css";
import type { Options, SortEvent } from "sorta11y";

const options: Options = {
  locale: "de",
  onChange: (evt: SortEvent) => console.info(evt.order),
};
const list: Sorta11y = Sorta11y.create("#tasks", options);
Sorta11y.setDefaultLabels(de);
void list;

// @ts-expect-error there is no such locale file
import "sorta11y/locales/fr";
