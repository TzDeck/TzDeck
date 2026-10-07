import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

import type { NFTCard } from "@/lib/card";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
Object.assign(globalThis, { window: dom.window, Event: dom.window.Event });

test("saving the wishlist never stores a card's sales context", async () => {
  const { saveWishlist } = await import("./useWishlist");
  const card: NFTCard = {
    token_id: "1",
    contract_address: "KT1Pack",
    name: "Pulled",
    objkt_url: "https://objkt.com/asset/KT1Pack/1",
    rarity: "common",
    sales: { sales_30d: 4, sales_30d_capped: false, median_sale_xtz: 2 },
  };

  saveWishlist([card]);

  const stored = JSON.parse(dom.window.localStorage.getItem("tzdeck_wishlist") ?? "[]");
  assert.equal(stored.length, 1);
  assert.equal(stored[0].name, "Pulled");
  assert.equal("sales" in stored[0], false, "a saved copy would later read as current 30-day sales");
});
