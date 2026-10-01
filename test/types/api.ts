// Compile-only checks of the published declarations (src/*.d.ts), resolved
// through the package's own "exports" map — `npm run test:types`. Never run.
// Each `@ts-expect-error` line must fail to compile, or the check fails.
import Sorta11y from "sorta11y";
import de from "sorta11y/locales/de";
import "sorta11y/style.css";
import type {
  Callback,
  FromSelectOptions,
  LabelContext,
  Labels,
  Options,
  SortEvent,
} from "sorta11y";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
declare function check<T extends true>(): void;

declare const ul: HTMLUListElement;
declare const select: HTMLSelectElement;

// --- create(): element or selector, options, callbacks ----------------------

const onChange = (evt: SortEvent): void => {
  const item: HTMLElement = evt.item;
  const from: number = evt.oldIndex;
  const to: number = evt.newIndex; // -1: the app removed it mid-grab
  const order: (string | null)[] = evt.order;
  check<Equal<SortEvent["source"], "keyboard" | "pointer">>();
  if (evt.source === "pointer") item.classList.add("dragged");
  void [from, to, order];
};

const options: Options = {
  itemSelector: "> li",
  handle: ".drag-handle",
  keyboard: true,
  pointer: true,
  applicationRole: true,
  rtl: "auto",
  animation: 0,
  easing: "ease-out",
  announceTotal: false,
  liveness: "assertive",
  dataIdAttr: "data-key",
  grabbedClass: "is-held ring",
  draggingClass: null,
  clickToGrab: true,
  dragOnItem: true,
  dragOnItemTouch: false,
  labels: null,
  locale: "de",
  onStart: (evt) => evt.item.focus(),
  onChange,
  onEnd: null,
};

const list = Sorta11y.create("#tasks", options);
check<Equal<typeof list, Sorta11y>>();
Sorta11y.create(ul, {
  onEnd: (evt) => {
    if (evt.newIndex === -1) return;
  },
});
const viaNew: Sorta11y = new Sorta11y(ul, { handle: null });
const viaCall: Sorta11y = Sorta11y(ul);
void [viaNew, viaCall];

// --- instance ---------------------------------------------------------------

const el: HTMLElement = list.el;
const items: readonly HTMLElement[] = list.items;
const region: HTMLDivElement = list.liveRegion;
const maybeSource: HTMLSelectElement | undefined = list.sourceSelect;
void [el, items, region, maybeSource];

const ids: (string | null)[] = list.toArray();
list.sort(["c", "a", "b"]).sort(ids, false).refresh();

const animation: number = list.option("animation");
const handle: string | null = list.option("handle");
const callback: Callback | null = list.option("onChange");
check<Equal<ReturnType<typeof list.destroy>, void>>();
list
  .option("animation", 0)
  .option("liveness", "off")
  .option("labels", { moved: "Moved." })
  .option("locale", null)
  .destroy();
void [animation, handle, callback];

declare const unknownValue: unknown;
if (unknownValue instanceof Sorta11y) unknownValue.refresh();

// --- static API -------------------------------------------------------------

const found: Sorta11y | null = Sorta11y.get(document.querySelector("#tasks"));
const created: Sorta11y[] = Sorta11y.autoInit(document.body);
const version: string = Sorta11y.version;
Sorta11y.autoInit();
void [found, created, version];

const selectOptions: FromSelectOptions = {
  label: "Group order",
  keepSelected: true,
  listClass: "groups",
  handleClass: "grip",
  handleText: "≡",
  handlePosition: "right",
  handleLabel: (text, option) => `Move ${text} (${option.value})`,
  renderItem: (li, option) => {
    li.style.background = option.style.background;
  },
  labels: de,
  onChange: (evt) => Sorta11y.mirrorToSelect(evt, select),
};
const fromSelect = Sorta11y.fromSelect("#groups", selectOptions);
if (fromSelect) {
  const generated: HTMLUListElement = fromSelect.el;
  const source: HTMLSelectElement = fromSelect.sourceSelect;
  void [generated, source];
}
Sorta11y.fromSelect(select, { handle: false });

const mirrored: HTMLSelectElement | null = Sorta11y.mirrorToSelect(
  list.toArray(),
  "#order-field",
);
Sorta11y.mirrorToSelect(["a", "b"], select);
void mirrored;

// --- labels and locales -----------------------------------------------------

Sorta11y.setDefaultLabels("de").setDefaultLabels(de);
Sorta11y.setDefaultLabels({ grabbed: (c) => `Picked up ${c.itemLabel}` });

const name = (c: LabelContext): string =>
  c.itemLabel ? `${c.itemLabel}, ` : "";
const custom: Labels = {
  applicationLabel: "Sortierbare Liste",
  instructions: () => "Sortierbar. Leertaste zum Aufnehmen.",
  grabbed: (c) =>
    `Aufgenommen: ${name(c)}Position ${c.position} von ${c.total}.`,
  moved: (c) =>
    c.announceTotal
      ? `Position ${c.position} von ${c.total}.`
      : `Position ${c.position}.`,
  dropped: "Abgelegt.", // a string is spoken verbatim
  cancelled: (c) => `Abgebrochen. ${c.order.join(", ")}`,
};
Sorta11y.create(ul, { labels: custom });

const spoken: string = de.grabbed({
  itemLabel: "Milk",
  position: 1,
  total: 2,
  announceTotal: true,
  order: ["milk", null],
});
const english: string = Sorta11y.locales.en.instructions;
const registered: Labels | undefined = Sorta11y.locales["de"];
Sorta11y.locales["fr"] = { moved: (c) => `Position ${c.position}.` };
void [spoken, english, registered];

// --- wrong usage must not compile -------------------------------------------

// @ts-expect-error unknown option
Sorta11y.create(ul, { handel: ".grip" });
// @ts-expect-error source is "keyboard" | "pointer"
const wrongSource: SortEvent["source"] = "mouse";
// @ts-expect-error liveness is an aria-live value
Sorta11y.create(ul, { liveness: "loud" });
// @ts-expect-error rtl (reserved) is "auto" or a boolean
Sorta11y.create(ul, { rtl: "rtl" });
// @ts-expect-error create()'s handle is a selector, not a switch
Sorta11y.create(ul, { handle: true });
// @ts-expect-error fromSelect()'s handle is a switch, not a selector
Sorta11y.fromSelect(select, { handle: ".grip" });
// @ts-expect-error handlePosition is "left" | "right"
Sorta11y.fromSelect(select, { handlePosition: "top" });
// @ts-expect-error fromSelect-only options are not create() options
Sorta11y.create(ul, { handlePosition: "right" });
// @ts-expect-error fromSelect() returns null for a non-<select>
Sorta11y.fromSelect(select).sourceSelect;
// @ts-expect-error create() needs an element or a selector
Sorta11y.create(null);
// @ts-expect-error get() takes an element, not a selector
Sorta11y.get("#tasks");
// @ts-expect-error undefined would override the default, so it is no "unset"
Sorta11y.create(ul, { animation: undefined });
// @ts-expect-error callbacks receive the event object
Sorta11y.create(ul, { onChange: (order: string[]) => order });
// @ts-expect-error unknown option name
list.option("speed");
// @ts-expect-error option values are typed per name
list.option("animation", "fast");
// @ts-expect-error sort() takes ids, not elements
list.sort([ul]);
// @ts-expect-error toArray() reports null for an item without an id
const strictIds: string[] = list.toArray();
// @ts-expect-error the instance's properties are read-only
list.el = ul;
// @ts-expect-error a label returns a string
const badLabel: Labels = { moved: (c) => c.position };
const badInstructions: Labels = {
  // @ts-expect-error instructions and applicationLabel get an empty context
  instructions: (c: LabelContext) => `${c.total}`,
};
// @ts-expect-error mirrorToSelect() needs an order
Sorta11y.mirrorToSelect({ items: [] }, select);
// @ts-expect-error the version is `version`
Sorta11y.VERSION;
// @ts-expect-error a locale export has only the label keys
de.locale;
void [wrongSource, strictIds, badLabel, badInstructions];
