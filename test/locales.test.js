import { describe, it, expect, afterEach } from "vitest";
import Sorta11y from "../src/sorta11y.js";
import deLabels from "../src/locales/de.js";
import enLabels from "../src/locales/en.js";
import { makeList, press, SPACE, liveRegionOf } from "./helpers/dom.js";

// In a browser the locale files self-register on window.Sorta11y.locales when
// loaded via <script>. Under CommonJS/Vitest the core is not on `window`, so we
// register manually here (importing the file gives its exported labels object).
afterEach(() => {
  Sorta11y.setDefaultLabels(enLabels); // reset the global default to English
  document.body.replaceChildren();
});

describe("sorta11y — i18n / locales", () => {
  it("ships English built-in and exposes it on Sorta11y.locales", () => {
    expect(Sorta11y.locales.en).toBeTypeOf("object");
    const ul = makeList();
    const inst = Sorta11y.create(ul);
    const item = ul.children[0];
    item.focus();
    press(item, SPACE);
    expect(liveRegionOf(ul).textContent).toMatch(/Picked up/);
    inst.destroy();
  });

  it("locale files export usable label objects (CommonJS)", () => {
    const ctx = { itemLabel: "X", position: 2, total: 4, announceTotal: true };
    expect(deLabels.moved(ctx)).toBe("Position 2 von 4.");
    expect(enLabels.moved(ctx)).toBe("Position 2 of 4.");
    expect(deLabels.dropped(ctx)).toMatch(/Abgelegt.*Position 2 von 4/);
    expect(deLabels.dropped(ctx)).toContain("X");
    expect(enLabels.cancelled(ctx)).toMatch(/Cancelled.*Position 2 of 4/);
    // announceTotal:false drops the total
    expect(deLabels.moved({ position: 2, announceTotal: false })).toBe(
      "Position 2.",
    );
    expect(enLabels.moved({ position: 2, announceTotal: false })).toBe(
      "Position 2.",
    );
  });

  it("labels read cleanly when an item has no label (de + en)", () => {
    const c = { position: 1, total: 3, announceTotal: true }; // no itemLabel
    expect(deLabels.grabbed(c)).toMatch(/^Aufgenommen\. Position 1 von 3/);
    expect(deLabels.dropped(c)).toMatch(/^Abgelegt\. Position 1 von 3/);
    expect(deLabels.cancelled(c)).toMatch(
      /^Abgebrochen\. Wieder an Position 1 von 3/,
    );
    expect(enLabels.grabbed(c)).toMatch(/^Picked up\. Position 1 of 3/);
    expect(enLabels.dropped(c)).toMatch(/^Dropped\. Position 1 of 3/);
    expect(enLabels.cancelled(c)).toMatch(
      /^Cancelled\. Back at Position 1 of 3/,
    );
  });

  it("the { locale } option selects a registered locale", () => {
    Sorta11y.locales.de = deLabels;
    const ul = makeList();
    const inst = Sorta11y.create(ul, { locale: "de" });
    const item = ul.children[0];
    item.focus();
    press(item, SPACE);
    expect(liveRegionOf(ul).textContent).toMatch(/Aufgenommen/);
    inst.destroy();
  });

  it("an explicit labels object always wins (the host-app injection path)", () => {
    Sorta11y.locales.de = deLabels;
    const ul = makeList();
    const inst = Sorta11y.create(ul, {
      locale: "de",
      labels: { grabbed: () => "CUSTOM" }, // e.g. strings injected from a host app's own translations
    });
    const item = ul.children[0];
    item.focus();
    press(item, SPACE);
    expect(liveRegionOf(ul).textContent).toBe("CUSTOM"); // beats locale + default
    inst.destroy();
  });

  it("setDefaultLabels changes the default; unset keys fall back to English", () => {
    Sorta11y.setDefaultLabels({ grabbed: () => "G-DEFAULT" }); // partial override
    const ul = makeList();
    const inst = Sorta11y.create(ul);
    const item = ul.children[0];
    item.focus();
    press(item, SPACE);
    expect(liveRegionOf(ul).textContent).toBe("G-DEFAULT");
    press(item, "ArrowDown"); // 'moved' was not overridden → falls back to English
    expect(liveRegionOf(ul).textContent).toMatch(/Position 2 of 4/);
    inst.destroy();
  });

  it("setDefaultLabels accepts a registered locale name", () => {
    Sorta11y.locales.de = deLabels;
    Sorta11y.setDefaultLabels("de");
    const ul = makeList();
    const inst = Sorta11y.create(ul);
    const item = ul.children[0];
    item.focus();
    press(item, SPACE);
    expect(liveRegionOf(ul).textContent).toMatch(/Aufgenommen/);
    inst.destroy();
  });

  it('option("locale", …) switches labels live', () => {
    Sorta11y.locales.de = deLabels;
    const ul = makeList();
    const inst = Sorta11y.create(ul);
    inst.option("locale", "de");
    const item = ul.children[0];
    item.focus();
    press(item, SPACE);
    expect(liveRegionOf(ul).textContent).toMatch(/Aufgenommen/);
    inst.destroy();
  });

  it('option("locale", …) re-renders the hidden instructions element', () => {
    Sorta11y.locales.de = deLabels;
    const ul = makeList();
    const inst = Sorta11y.create(ul); // English default
    const id = ul.children[0].getAttribute("aria-describedby");
    const instrEl = document.getElementById(id);
    expect(instrEl.textContent).toMatch(/Press Space to pick up/);
    inst.option("locale", "de");
    expect(instrEl.textContent).toBe(deLabels.instructions); // now German
    inst.destroy();
  });

  it('option("labels", …) re-renders the hidden instructions element', () => {
    const ul = makeList();
    const inst = Sorta11y.create(ul);
    const id = ul.children[0].getAttribute("aria-describedby");
    const instrEl = document.getElementById(id);
    inst.option("labels", { instructions: "CUSTOM INSTRUCTIONS" });
    expect(instrEl.textContent).toBe("CUSTOM INSTRUCTIONS");
    inst.destroy();
  });
});
