import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});

afterEach(async () => (await import("@testing-library/react")).cleanup());

test("every tez sign in the text is drawn as an icon, never printed as the character", async () => {
  const { render, screen } = await import("@testing-library/react");
  const { default: TezText } = await import("./TezText");

  const { container } = render(
    <p>
      <TezText text="≤5 editions and 100ꜩ+ · or 1,000ꜩ+" />
    </p>,
  );

  assert.equal(container.textContent, "≤5 editions and 100+ · or 1,000+");
  assert.equal(screen.getAllByRole("img", { name: "tez" }).length, 2);
});

test("text without a tez sign renders unchanged", async () => {
  const { render } = await import("@testing-library/react");
  const { default: TezText } = await import("./TezText");

  const { container } = render(
    <p>
      <TezText text="1 of 1" />
    </p>,
  );

  assert.equal(container.textContent, "1 of 1");
  assert.equal(container.querySelector("svg"), null);
});

test("a price keeps its sign and the text around it on one line", async () => {
  const { render, screen } = await import("@testing-library/react");
  const { default: TezText } = await import("./TezText");

  render(
    <p>
      <TezText text="≤5 editions and 100ꜩ+" />
    </p>,
  );

  const price = screen.getByRole("img", { name: "tez" }).parentElement;
  assert.equal(price?.textContent, "100+");
  assert.ok(price?.className.includes("whitespace-nowrap"));
});
