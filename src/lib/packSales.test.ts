import assert from "node:assert/strict";
import test from "node:test";

import type { NFTCard } from "./card";
import { objktClient } from "./objkt";
import { attachSalesContext, SALES_PER_TOKEN_LIMIT, summarizeSales } from "./packSales";

type Request = (document: string, variables?: Record<string, unknown>) => Promise<unknown>;
const client = objktClient as unknown as { request: Request };

function card(tokenId: string, listingId: number, contract = "KT1Pack"): NFTCard {
  return {
    token_id: tokenId,
    contract_address: contract,
    listing_id: listingId,
    name: `Card ${tokenId}`,
    objkt_url: `https://objkt.com/asset/${contract}/${tokenId}`,
    rarity: "common",
  };
}

function withRequest<T>(request: Request, run: () => Promise<T>): Promise<T> {
  const original = client.request;
  client.request = request;
  return run().finally(() => {
    client.request = original;
  });
}

test("summarizeSales: counts sales and takes the median of an odd number of prices, in tez", () => {
  const context = summarizeSales(
    [{ price: 3_000_000 }, { price: 1_000_000 }, { price: 12_000_000 }],
    [],
    undefined,
  );
  assert.equal(context.sales_30d, 3);
  assert.equal(context.sales_30d_capped, false);
  assert.equal(context.median_sale_xtz, 3);
});

test("summarizeSales: an even number of sales averages the middle two", () => {
  const context = summarizeSales([{ price: 1_000_000 }, { price: 2_000_000 }, { price: 4_000_000 }, { price: 9_000_000 }], [], undefined);
  assert.equal(context.median_sale_xtz, 3);
});

test("summarizeSales: no sales has no median rather than a zero one", () => {
  const context = summarizeSales([], [], undefined);
  assert.equal(context.sales_30d, 0);
  assert.equal(context.median_sale_xtz, undefined);
});

test("summarizeSales: the drawn listing never counts as the cheapest other edition", () => {
  const listings = [{ id: 7, price: 2_000_000 }, { id: 8, price: 5_500_000 }];
  assert.equal(summarizeSales([], listings, 7).cheapest_other_listing_xtz, 5.5);
  assert.equal(summarizeSales([], [{ id: 7, price: 2_000_000 }], 7).cheapest_other_listing_xtz, undefined, "the only listing is the drawn one");
  assert.equal(summarizeSales([], listings, 99).cheapest_other_listing_xtz, 2, "drawn listing not among the two cheapest");
});

test("summarizeSales: hitting the fetch limit marks the count as a lower bound", () => {
  const sales = Array.from({ length: SALES_PER_TOKEN_LIMIT }, () => ({ price: 1_000_000 }));
  assert.equal(summarizeSales(sales, [], undefined).sales_30d_capped, true);
});

test("summarizeSales: unusable prices are left out of the median but the sale still counts", () => {
  const context = summarizeSales([{ price: null }, { price: "0" }, { price: "4000000" }], [{ id: 1, price: null }], undefined);
  assert.equal(context.sales_30d, 3);
  assert.equal(context.median_sale_xtz, 4);
  assert.equal(context.cheapest_other_listing_xtz, undefined);
});

test("attachSalesContext: one request covers every card, 30 days back, matched by contract and token id", async () => {
  const documents: string[] = [];
  const variables: Array<Record<string, unknown> | undefined> = [];
  const now = Date.UTC(2026, 9, 7);

  const cards = await withRequest(async (document, vars) => {
    documents.push(document);
    variables.push(vars);
    return {
      s0: [{ price: 2_000_000 }, { price: 4_000_000 }],
      l0: [{ id: 10, price: 3_000_000 }, { id: 11, price: 6_000_000 }],
      s1: [],
      l1: [{ id: 20, price: 1_000_000 }],
    };
  }, () => attachSalesContext([card("1", 10), card("2", 20, "KT1Other")], now));

  assert.equal(documents.length, 1, "a pack costs one extra OBJKT request, not one per card");
  assert.equal(variables[0]?.since, new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString());
  assert.match(documents[0], /s0: listing_sale\(/);
  assert.match(documents[0], /l1: listing\(/);
  assert.match(documents[0], /fa_contract: { _eq: "KT1Other" }, token_id: { _eq: "2" }/);
  assert.match(documents[0], /status: { _eq: "active" }/);

  assert.deepEqual(cards[0].sales, {
    sales_30d: 2,
    sales_30d_capped: false,
    median_sale_xtz: 3,
    cheapest_other_listing_xtz: 6,
  });
  assert.equal(cards[1].sales?.sales_30d, 0);
  assert.equal(cards[1].sales?.cheapest_other_listing_xtz, undefined);
});

test("attachSalesContext: a value that could break out of a GraphQL string stays inside it", async () => {
  let document = "";
  await withRequest(async (doc) => {
    document = doc;
    return {};
  }, () => attachSalesContext([card('1" } } evil: token { pk', 1)]));
  assert.match(document, /token_id: { _eq: "1\\" } } evil: token { pk" }/);
});

test("attachSalesContext: a failed sales query serves the cards unchanged", async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const input = [card("1", 1), card("2", 2)];
    const cards = await withRequest(async () => {
      throw new Error("OBJKT unavailable");
    }, () => attachSalesContext(input));
    assert.deepEqual(cards, input);
    assert.equal(cards[0].sales, undefined);
  } finally {
    console.warn = originalWarn;
  }
});

test("attachSalesContext: a token missing from the response stays unknown, not 'no sales'", async () => {
  const cards = await withRequest(async () => ({ s0: [], l0: [] }), () => attachSalesContext([card("1", 1), card("2", 2)]));
  assert.equal(cards[0].sales?.sales_30d, 0);
  assert.equal(cards[1].sales, undefined);
});

test("attachSalesContext: an empty pack makes no request", async () => {
  let calls = 0;
  const cards = await withRequest(async () => {
    calls += 1;
    return {};
  }, () => attachSalesContext([]));
  assert.deepEqual(cards, []);
  assert.equal(calls, 0);
});
