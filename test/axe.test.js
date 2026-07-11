import { describe, it, expect, afterEach } from "vitest";
import axe from "axe-core";
import Sorta11y from "../src/sorta11y.js";
import { makeList, press, SPACE } from "./helpers/dom.js";

// Automated accessibility checks with axe-core. Layout-dependent rules (colour
// contrast) need a real renderer and cannot run under jsdom, so they are
// disabled here — real-browser contrast and manual screen-reader passes are the
// AT matrix (docs/at-test-matrix.md). This test guards the ARIA structure
// (roles, names, states) against regressions.
const AXE_OPTIONS = {
  rules: {
    "color-contrast": { enabled: false },
  },
};

async function violations(el) {
  const { violations } = await axe.run(el, AXE_OPTIONS);
  // Surface a readable summary if anything fails.
  return violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.map((n) => n.html),
  }));
}

let inst;
afterEach(() => {
  if (inst) {
    try {
      inst.destroy();
    } catch {
      /* already destroyed */
    }
    inst = null;
  }
  document.body.replaceChildren();
});

describe("sorta11y — axe-core (automated a11y)", () => {
  it("an enhanced list (no handle) has no axe violations", async () => {
    const ul = makeList();
    inst = Sorta11y.create(ul);
    expect(await violations(ul)).toEqual([]);
  });

  it("has no violations while an item is grabbed", async () => {
    const ul = makeList();
    inst = Sorta11y.create(ul);
    const item = ul.children[0];
    item.focus();
    press(item, SPACE); // aria-pressed=true, instructions referenced
    expect(await violations(ul)).toEqual([]);
  });

  it("has no violations in handle mode", async () => {
    const ul = makeList({ handle: true });
    inst = Sorta11y.create(ul, { handle: ".drag-handle" });
    expect(await violations(ul)).toEqual([]);
  });
});
