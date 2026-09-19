import assert from "node:assert/strict";
import test from "node:test";
import { parseTheme, resolveTheme, themeBootstrap } from "../lib/theme";

test("theme follows system unless explicitly selected", () => {
  assert.equal(parseTheme(null), "system");
  assert.equal(parseTheme("invalid"), "system");
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
});
test("bootstrap respects saved choices and survives denied storage", () => {
  for (const saved of ["light", "dark", "system", "invalid", null]) {
    for (const dark of [true, false]) {
      const document = { documentElement: { dataset: {} as Record<string, string> } };
      new Function("localStorage", "window", "document", themeBootstrap)(
        { getItem: () => saved }, { matchMedia: () => ({ matches: dark }) }, document);
      assert.equal(document.documentElement.dataset.theme, resolveTheme(parseTheme(saved), dark));
    }
  }
  const document = { documentElement: { dataset: {} as Record<string, string> } };
  new Function("localStorage", "window", "document", themeBootstrap)(
    { getItem: () => { throw new Error("blocked"); } }, { matchMedia: () => ({ matches: false }) }, document);
  assert.equal(document.documentElement.dataset.theme, "light");
});
