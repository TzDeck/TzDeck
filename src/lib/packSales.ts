import type { NFTCard, SalesContext } from "./card";
import { getCardKey } from "./cardKey";
import { objktClient } from "./objkt";

/** How far back "recent sales" reach. */
export const SALES_WINDOW_DAYS = 30;

/**
 * Sales fetched per token. A token past this many sales in the window is
 * shown as "this many or more" rather than paging for an exact count.
 */
export const SALES_PER_TOKEN_LIMIT = 200;

const MUTEZ_PER_XTZ = 1_000_000;

interface SaleRow {
  price: number | string | null;
}

interface ListingRow {
  id: number;
  price: number | string | null;
}

type PackSalesResponse = Record<string, Array<SaleRow | ListingRow> | undefined>;

function toXtz(mutez: number): number {
  return Number((mutez / MUTEZ_PER_XTZ).toFixed(3));
}

function readMutez(value: number | string | null | undefined): number | null {
  const mutez = Number(value);
  return Number.isFinite(mutez) && mutez > 0 ? mutez : null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Pure: turns one token's recent sales and active listings into the card's
 * sales context. `listingId` is the listing the pack drew, which is not
 * "another" edition, so it never counts as the cheapest alternative.
 */
export function summarizeSales(
  sales: SaleRow[],
  listings: ListingRow[],
  listingId: number | undefined,
): SalesContext {
  const salePrices = sales.map((sale) => readMutez(sale.price)).filter((mutez): mutez is number => mutez !== null);
  const otherListingPrices = listings
    .filter((listing) => listing.id !== listingId)
    .map((listing) => readMutez(listing.price))
    .filter((mutez): mutez is number => mutez !== null);

  return {
    sales_30d: sales.length,
    sales_30d_capped: sales.length >= SALES_PER_TOKEN_LIMIT,
    median_sale_xtz: salePrices.length > 0 ? toXtz(median(salePrices)) : undefined,
    cheapest_other_listing_xtz: otherListingPrices.length > 0 ? toXtz(Math.min(...otherListingPrices)) : undefined,
  };
}

/** A GraphQL string literal. JSON's string escaping is a subset GraphQL accepts. */
function literal(value: string): string {
  return JSON.stringify(value);
}

function tokenWhere(card: NFTCard): string {
  return `token: { fa_contract: { _eq: ${literal(card.contract_address)} }, token_id: { _eq: ${literal(card.token_id)} } }`;
}

/**
 * One OBJKT request for every card in a pack: per token, its sales in the
 * last SALES_WINDOW_DAYS and its active listings, aliased s0/l0, s1/l1, ...
 *
 * Never throws. Sales context is extra: if the query fails, the pack is
 * served exactly as before, just without it.
 */
export async function attachSalesContext(cards: NFTCard[], now: number = Date.now()): Promise<NFTCard[]> {
  if (cards.length === 0) return cards;

  const since = new Date(now - SALES_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const fields = cards.map((card, index) => `
    s${index}: listing_sale(
      where: { ${tokenWhere(card)}, timestamp: { _gte: $since } },
      order_by: { timestamp: desc },
      limit: ${SALES_PER_TOKEN_LIMIT}
    ) { price }
    l${index}: listing(
      where: { ${tokenWhere(card)}, status: { _eq: "active" }, price: { _gt: 0 } },
      order_by: { price: asc },
      limit: 2
    ) { id price }
  `).join("");

  try {
    const data = await objktClient.request<PackSalesResponse>(
      `query PackSalesContext($since: timestamptz!) { ${fields} }`,
      { since },
    );

    return cards.map((card, index) => {
      const sales = data?.[`s${index}`];
      const listings = data?.[`l${index}`];
      // A token missing from the response is unknown, not "no sales".
      if (!Array.isArray(sales) || !Array.isArray(listings)) return card;
      return { ...card, sales: summarizeSales(sales, listings as ListingRow[], card.listing_id) };
    });
  } catch (err) {
    console.warn(`OBJKT sales context unavailable for ${cards.map(getCardKey).join(", ")}:`, err);
    return cards;
  }
}
