import { describe, it, expect, afterEach } from "vitest";
import Sorta11y from "../src/sorta11y.js";
import { makeList } from "./helpers/dom.js";

describe("sorta11y — library surface", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("exposes a semver version string", () => {
    expect(Sorta11y.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("is a constructor usable via create() and new", () => {
    const a = Sorta11y.create(makeList(), {});
    const b = new Sorta11y(makeList(), {});
    expect(typeof Sorta11y).toBe("function");
    expect(a).toBeInstanceOf(Sorta11y);
    expect(b).toBeInstanceOf(Sorta11y);
  });

  it("exposes the static API surface", () => {
    for (const name of ["create", "get", "autoInit", "mirrorToSelect"]) {
      expect(Sorta11y[name], `Sorta11y.${name}`).toBeTypeOf("function");
    }
  });
});
