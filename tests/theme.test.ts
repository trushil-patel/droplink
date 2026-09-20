import assert from "node:assert/strict";
import test from "node:test";
import { parseTheme, themeBootstrap } from "../lib/theme";

test("theme defaults to light, including old system preferences", () => {
  assert.equal(parseTheme(null), "light");
  assert.equal(parseTheme("invalid"), "light");
  assert.equal(parseTheme("system"), "light");
  assert.equal(parseTheme("light"), "light");
  assert.equal(parseTheme("dark"), "dark");
});
test("bootstrap respects saved choices and survives denied storage", () => {
  for (const saved of ["light", "dark", "system", "invalid", null]) {
    for (const dark of [true, false]) {
      const document = { documentElement: { dataset: {} as Record<string, string> } };
      new Function("localStorage", "window", "document", themeBootstrap)(
        { getItem: () => saved }, { matchMedia: () => ({ matches: dark }) }, document);
      assert.equal(document.documentElement.dataset.theme, parseTheme(saved));
    }
  }
  const document = { documentElement: { dataset: {} as Record<string, string> } };
  new Function("localStorage", "window", "document", themeBootstrap)(
    { getItem: () => { throw new Error("blocked"); } }, { matchMedia: () => ({ matches: false }) }, document);
  assert.equal(document.documentElement.dataset.theme, "light");
});
