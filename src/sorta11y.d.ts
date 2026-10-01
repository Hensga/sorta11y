/*!
 * sorta11y — TypeScript declarations
 * @license MIT
 * (c) 2026 Henning Huth · https://github.com/Hensga/sorta11y
 *
 * Hand-written to match src/sorta11y.js (a UMD file): `export =` serves
 * CommonJS `require` and ESM default imports, `export as namespace` the
 * `<script>` global.
 */

export = Sorta11y;
export as namespace Sorta11y;

/**
 * An accessible sortable list: one instance per enhanced element. Create one
 * with `Sorta11y.create(el, options)`.
 */
interface Sorta11y {
  /** The enhanced list element. */
  readonly el: HTMLElement;
  /** The current items, in order. Re-resolved by `refresh()`. */
  readonly items: readonly HTMLElement[];
  /** The options in effect (defaults merged with yours). Change them with `option()`. */
  readonly options: Readonly<Sorta11y.ResolvedOptions>;
  /** The announcement labels in effect (built-in, default, `locale` and `labels` merged). */
  readonly labels: Readonly<Sorta11y.ResolvedLabels>;
  /** The visually hidden live region the announcements are written to. */
  readonly liveRegion: HTMLDivElement;
  /** The visually hidden keyboard instructions every grab target's `aria-describedby` points at. */
  readonly instructions: HTMLDivElement;
  /** The original `<select>` — set only on lists built by `Sorta11y.fromSelect()`. */
  readonly sourceSelect?: HTMLSelectElement;

  /**
   * Re-resolve items and re-apply ARIA + tabindex after external DOM changes.
   * Ends a grab or drag whose item is no longer in the list (`onEnd` with
   * `newIndex: -1`). Safe to call repeatedly.
   */
  refresh(): this;

  /** The current order as an array of ids (`dataIdAttr` values; `null` for an item without one). */
  toArray(): Sorta11y.Order;

  /**
   * Reorder to the given array of ids — animated unless `animate` is `false`.
   * Items not named follow in their current order; unknown ids are ignored.
   * A programmatic reorder: fires no callback and announces nothing.
   */
  sort(order: readonly (string | null)[], animate?: boolean): this;

  /** Read an option. */
  option<K extends keyof Sorta11y.Options>(
    name: K,
  ): Sorta11y.ResolvedOptions[K];
  /** Change an option at runtime; the list re-wires whatever the change needs. */
  option<K extends keyof Sorta11y.Options>(
    name: K,
    value: Sorta11y.ResolvedOptions[K],
  ): this;

  /** Remove all enhancements, listeners and ARIA wiring. Idempotent. */
  destroy(): void;
}

/** The static side of the library: the constructor and its helpers. */
interface Sorta11yStatic {
  /**
   * Enhance a list. `target` is an element or a selector; a selector that
   * matches nothing throws a `TypeError`. An already enhanced element returns
   * its existing instance. Prefer `Sorta11y.create()`.
   */
  new (target: Element | string, options?: Sorta11y.Options): Sorta11y;
  (target: Element | string, options?: Sorta11y.Options): Sorta11y;
  readonly prototype: Sorta11y;

  /** The library version, e.g. `"0.1.0-alpha.0"`. */
  readonly version: string;

  /**
   * The locale registry, keyed by language code. `en` is always there; a
   * locale file adds itself when loaded (e.g. `sorta11y/locales/de`).
   */
  readonly locales: Sorta11y.LocaleRegistry;

  /**
   * Enhance a `<ul>`/`<ol>` (element or selector) and return the instance.
   * A selector that matches nothing throws a `TypeError`; calling it again on
   * the same element returns the existing instance.
   */
  create(target: Element | string, options?: Sorta11y.Options): Sorta11y;

  /** Return the instance attached to an element, or `null`. */
  get(el: Element | null | undefined): Sorta11y | null;

  /**
   * Enhance every `[data-sorta11y]` list under `root` (default: `document`)
   * and return their instances. Reads only `data-handle`,
   * `data-application-role` and the reserved `data-rtl` from the markup.
   */
  autoInit(root?: ParentNode | null): Sorta11y[];

  /**
   * Build a sortable `<ul>` from a `<select multiple>`, insert it before the
   * (now hidden) select and keep the select's option order mirrored. Returns
   * the instance — `.el` is the new list, `.sourceSelect` the select — or
   * `null` if the target is not a `<select>`.
   */
  fromSelect(
    select: Element | string | null | undefined,
    options?: Sorta11y.FromSelectOptions,
  ): Sorta11y.SelectInstance | null;

  /**
   * Mirror an order into a `<select multiple>` (element or selector) so a
   * plain form submit carries it: reorders the options whose `value` matches
   * an id. Accepts an event object or a bare array of ids; does nothing if
   * either argument is missing. Returns the select, or `null`.
   */
  mirrorToSelect(
    evt:
      | { readonly order: readonly (string | null)[] }
      | readonly (string | null)[]
      | null
      | undefined,
    select: HTMLSelectElement | string | null | undefined,
  ): HTMLSelectElement | null;

  /**
   * Set the default labels for lists created afterwards: a labels object or
   * the name of a registered locale (e.g. `"de"`). Missing keys, and an
   * unknown locale name, fall back to the built-in English.
   */
  setDefaultLabels(labelsOrLocale: Sorta11y.Labels | string): Sorta11yStatic;
}

declare const Sorta11y: Sorta11yStatic;

declare namespace Sorta11y {
  /** The input that performed a step. */
  type Source = "keyboard" | "pointer";

  /** An order of item ids — the `dataIdAttr` values, `null` for an item without one. */
  type Order = (string | null)[];

  /** The object passed to `onStart`, `onChange` and `onEnd`. */
  interface SortEvent {
    /** The item that was picked up, moved or dropped. */
    item: HTMLElement;
    /** Its position before, 0-indexed. */
    oldIndex: number;
    /** Its position after, 0-indexed — `-1` if the app removed it mid-grab. */
    newIndex: number;
    /** The full order of ids afterwards. */
    order: Order;
    /**
     * The input that performed the step. A cancel reports how the item was
     * picked up. Describes the input path, not the person — don't use it to
     * detect assistive technology.
     */
    source: Source;
  }

  /** An `onStart` / `onChange` / `onEnd` callback. */
  type Callback = (event: SortEvent) => void;

  /** `aria-live` value for the announcement region. */
  type Liveness = "polite" | "assertive" | "off";

  /** Options for `Sorta11y.create()`, all optional. Each one can be changed at runtime with `option()`. */
  interface Options {
    /** Which children count as items. Default `"> li"`. */
    itemSelector?: string;
    /**
     * Selector for a drag handle inside each item (a real `<button>` is
     * recommended). Default `null`: the whole item is the grab target.
     */
    handle?: string | null;
    /** The keyboard grab / move / drop layer. Default `true`. */
    keyboard?: boolean;
    /** The pointer/touch drag layer. Default `true`. */
    pointer?: boolean;
    /**
     * Toggle `role="application"` on a wrapper only while an item is held, so
     * NVDA/JAWS pass the arrow keys through. Default `true`.
     */
    applicationRole?: boolean;
    /** Reserved — currently has no effect. Default `"auto"`. */
    rtl?: "auto" | boolean;
    /** FLIP slide duration in ms; `0` disables it. Default `150`. */
    animation?: number;
    /** Easing for the slide. Default `"cubic-bezier(0.2, 0, 0, 1)"`. */
    easing?: string;
    /** Include "of Y" in position announcements. Default `true`. */
    announceTotal?: boolean;
    /** `aria-live` value for the announcement region. Default `"polite"`. */
    liveness?: Liveness;
    /** Attribute that identifies items for `toArray()` and `sort()`. Default `"data-id"`. */
    dataIdAttr?: string;
    /** Extra class(es), space-separated, on the item while it is held. Additive. Default `null`. */
    grabbedClass?: string | null;
    /** Extra class(es), space-separated, on the item during a pointer drag. Additive. Default `null`. */
    draggingClass?: string | null;
    /**
     * A pointer tap (no drag) picks up / drops (WCAG 2.5.7). `false` = the
     * pointer can only drag. Default `true`.
     */
    clickToGrab?: boolean;
    /**
     * With a handle: pointer drags/taps may start anywhere on the item.
     * Keyboard and AT semantics stay on the handle. Default `false`.
     */
    dragOnItem?: boolean;
    /**
     * Widen the touch/pen drag surface to the whole item — only for short,
     * non-scrolling lists. Default `false`.
     */
    dragOnItemTouch?: boolean;
    /** Your own announcement labels — always wins over `locale`. Partial objects fall back. Default `null`. */
    labels?: Labels | null;
    /** A registered locale for the announcements, e.g. `"de"`. Default `null`. */
    locale?: string | null;
    /** After a committed reorder — only when the position actually changed. */
    onChange?: Callback | null;
    /** When an item is picked up, by keyboard or pointer. */
    onStart?: Callback | null;
    /** After every drop and every cancel, whether or not anything moved. */
    onEnd?: Callback | null;
  }

  /** The options in effect on an instance: every key present, defaults filled in. */
  type ResolvedOptions = Required<Options>;

  /** Options for `Sorta11y.fromSelect()`: every regular option, plus its own. */
  interface FromSelectOptions extends Omit<Options, "handle"> {
    /**
     * A switch here, not a selector: `false` skips the generated handle
     * button and makes the whole row the grab target. Default `true`.
     */
    handle?: boolean;
    /** Class of the generated handle — also the `handle` selector passed on. Default `"s11y-handle"`. */
    handleClass?: string;
    /** The handle's visible glyph. Default `"⠿"`. */
    handleText?: string;
    /** Which end of the row the generated handle sits at. Default `"left"`. */
    handlePosition?: "left" | "right";
    /** Returns the handle's accessible name for a row. Default: the option's text. */
    handleLabel?: (text: string, option: HTMLOptionElement) => string;
    /** Called after each row is built — for row styling and custom content. */
    renderItem?: (li: HTMLLIElement, option: HTMLOptionElement) => void;
    /** Keep every option `selected`, so a plain submit carries the full order. Default `true`. */
    keepSelected?: boolean;
    /** Class(es) for the generated `<ul>`. */
    listClass?: string;
    /** Accessible name for the generated list. Default: the select's own name. */
    label?: string;
  }

  /** An instance built by `Sorta11y.fromSelect()`. */
  interface SelectInstance extends Sorta11y {
    /** The generated list. */
    readonly el: HTMLUListElement;
    /** The original, now hidden `<select>`. */
    readonly sourceSelect: HTMLSelectElement;
  }

  /** What every announcement label function receives. */
  interface LabelContext {
    /** The item's `aria-label`, `data-label` or text content — `""` when it has none. */
    itemLabel: string;
    /** The item's position, 1-indexed. */
    position: number;
    /** The number of items. */
    total: number;
    /** The `announceTotal` option, for "of Y" phrasing. */
    announceTotal: boolean;
    /** The current order of ids. */
    order: Order;
  }

  /** The (empty) context an `instructions` or `applicationLabel` function receives. */
  type EmptyLabelContext = Record<string, never>;

  /** An announcement: a function of the context, or a string spoken verbatim. */
  type Label = string | ((context: LabelContext) => string);

  /** A label without a context: a string, or a function called with an empty context. */
  type StaticLabel = string | ((context: EmptyLabelContext) => string);

  /** Announcement labels. Every key is optional — missing ones fall back. */
  interface Labels {
    /**
     * Accessible name for the `role="application"` wrapper, when the list has
     * no `aria-label`/`aria-labelledby` to mirror.
     */
    applicationLabel?: StaticLabel;
    /** The hidden `aria-describedby` text on each item. */
    instructions?: StaticLabel;
    /** Announced on pickup. */
    grabbed?: Label;
    /** Announced after each move while held. */
    moved?: Label;
    /** Announced on drop. */
    dropped?: Label;
    /** Announced on Esc or an aborted grab or drag. */
    cancelled?: Label;
  }

  /** A complete label set: every key present. */
  type ResolvedLabels = Required<Labels>;

  /** The label set a bundled locale file exports (and registers). */
  interface LocaleLabels {
    /** Accessible name for the `role="application"` wrapper. */
    applicationLabel: string;
    /** The hidden `aria-describedby` text on each item. */
    instructions: string;
    /** Announced on pickup. */
    grabbed: (context: LabelContext) => string;
    /** Announced after each move while held. */
    moved: (context: LabelContext) => string;
    /** Announced on drop. */
    dropped: (context: LabelContext) => string;
    /** Announced on Esc or an aborted grab or drag. */
    cancelled: (context: LabelContext) => string;
  }

  /** `Sorta11y.locales`: label sets keyed by language code. */
  interface LocaleRegistry {
    /** The built-in English labels. */
    en: LocaleLabels;
    [code: string]: Labels;
  }
}
