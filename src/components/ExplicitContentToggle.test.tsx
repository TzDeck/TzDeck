import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
});

Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  Element: dom.window.Element,
  HTMLElement: dom.window.HTMLElement,
  SVGElement: dom.window.SVGElement,
  Event: dom.window.Event,
  StorageEvent: dom.window.StorageEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: dom.window.navigator,
});

async function loadTestHarness() {
  const testingLibrary = await import("@testing-library/react");
  const { default: ExplicitContentToggle } = await import("./ExplicitContentToggle");
  return { ...testingLibrary, ExplicitContentToggle };
}

afterEach(async () => {
  (await import("@testing-library/react")).cleanup();
  window.localStorage.clear();
});

test("the header toggle saves the explicit-content setting on this device", async () => {
  const { fireEvent, render, screen, ExplicitContentToggle } = await loadTestHarness();
  render(<ExplicitContentToggle />);

  const toggle = screen.getByRole("button", { name: "Always show explicit content" });
  assert.equal(toggle.getAttribute("aria-pressed"), "false");

  fireEvent.click(toggle);
  assert.equal(toggle.getAttribute("aria-pressed"), "true");
  assert.equal(window.localStorage.getItem("tzdeck_show_explicit"), "1");

  fireEvent.click(toggle);
  assert.equal(toggle.getAttribute("aria-pressed"), "false");
  assert.equal(window.localStorage.getItem("tzdeck_show_explicit"), null);
});

test("the header toggle starts from the saved setting", async () => {
  window.localStorage.setItem("tzdeck_show_explicit", "1");
  const { render, screen, ExplicitContentToggle } = await loadTestHarness();
  render(<ExplicitContentToggle />);

  assert.equal(
    screen.getByRole("button", { name: "Always show explicit content" }).getAttribute("aria-pressed"),
    "true",
  );
});
