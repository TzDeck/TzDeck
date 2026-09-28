import { GraphQLClient } from "graphql-request";

import {
  ALLOW_ALL,
  partitionListings,
  type DenylistIndex,
  type ExclusionRecord,
} from "./pullFilter";
import type { NFTCard } from "./card";
import { getCardKey } from "./cardKey";
import {
  isTzktTokenBalance,
  normalizeObjktToken,
  tzktToRawToken,
  type ObjktListingRow,
  type ObjktRawToken,
  type PullListingRow,
} from "./objktToken";
import { cheapestPerToken, selectDiverseListings, shuffleArray } from "./pullDraw";

const OBJKT_API_URL = process.env.NEXT_PUBLIC_OBJKT_API_URL || "https://data.objkt.com/v3/graphql";
export const objktClient = new GraphQLClient(OBJKT_API_URL);

/** The token fields every OBJKT query selects: what a card needs to render. */
const TOKEN_FIELDS = `
  name
  token_id
  fa_contract
  display_uri
  artifact_uri
  thumbnail_uri
  supply
  mime
  description
  creators { holder { alias address } }
  fa { name }
  attributes { attribute { name type value } }
`;

/**
 * TOKEN_FIELDS plus what the pull filter judges. Only the pack draw selects
 * these: a wallet's own holdings and a known card are not discovery surfaces.
 * GraphQL merges the repeated creators and fa selections into one.
 */
const PULL_TOKEN_FIELDS = `
  ${TOKEN_FIELDS}
  pk
  flag
  creators { verified holder { flag } }
  fa { live }
`;

interface ObjktTokenHolderResponse {
  token_holder: Array<{
    quantity: number;
    token: ObjktRawToken;
  }>;
}

interface PullListingResponse {
  listing: PullListingRow[];
}

/** One recent window and three deep ones, aliased so one round trip covers them all. */
interface ObjktPackWindowsResponse {
  w1?: PullListingRow[];
  w2?: PullListingRow[];
  w3?: PullListingRow[];
  w4?: PullListingRow[];
}

/**
 * When the oldest active OBJKT listing was made, as of September 2026. A deep
 * window cuts off at a random moment between this and now. A cutoff older than
 * every surviving listing returns an empty window, which the other windows and
 * the fallback absorb.
 */
export const OLDEST_ACTIVE_LISTING_MS = Date.parse("2022-09-10T00:00:00Z");

/** The newest listings, about the last three weeks of the market, so new art keeps its place in packs. */
const RECENT_WINDOW_DEPTH = 20_000;

export async function fetchUserHoldings(address: string): Promise<NFTCard[]> {
  const query = `
    query UserHoldings($address: String!) {
      token_holder(
        where: {
          holder_address: { _eq: $address },
          quantity: { _gt: "0" }
        },
        limit: 250,
        order_by: { last_incremented_at: desc_nulls_last }
      ) {
        quantity
        token { ${TOKEN_FIELDS} }
      }
    }
  `;

  try {
    const data = await objktClient.request<ObjktTokenHolderResponse>(query, { address });
    
    if (data?.token_holder?.length > 0) {
      return data.token_holder
        .filter((h) => h.token && (h.token.display_uri || h.token.artifact_uri || h.token.name))
        .map((holding) => normalizeObjktToken(holding.token, {
          quantityOwned: holding.quantity,
        }));
    }
  } catch (err) {
    console.warn("OBJKT token_holder query failed, attempting TzKT fallback:", err);
  }

  // Fallback to TzKT API
  try {
    const url = `https://api.tzkt.io/v1/tokens/balances?account=${address}&token.metadata.artifactUri.ne=null&limit=200`;
    const response = await fetch(url);
    const tzktData: unknown = await response.json();

    if (Array.isArray(tzktData)) {
      return tzktData
        .filter(isTzktTokenBalance)
        .map((item) => normalizeObjktToken(tzktToRawToken(item), { quantityOwned: Number(item.balance || 1) }));
    }
  } catch (tzktErr) {
    console.error("TzKT fallback also failed:", tzktErr);
  }

  return [];
}

interface ObjktTokenByKeyResponse {
  token: ObjktRawToken[];
}

/**
 * Resolves one token's display metadata (name/art/collection) by contract
 * and token id alone, independent of any wallet holding it -- for
 * rendering a card the current client doesn't already have data for (e.g.
 * a battle opponent's card, only known by key from a battle response).
 */
export async function fetchTokenByKey(contractAddress: string, tokenId: string): Promise<NFTCard | null> {
  const query = `
    query TokenByKey($contract: String!, $tokenId: String!) {
      token(
        where: { fa_contract: { _eq: $contract }, token_id: { _eq: $tokenId } },
        limit: 1
      ) { ${TOKEN_FIELDS} }
    }
  `;

  try {
    const data = await objktClient.request<ObjktTokenByKeyResponse>(query, {
      contract: contractAddress,
      tokenId,
    });
    const token = data?.token?.[0];
    if (!token) return null;
    return normalizeObjktToken(token);
  } catch (err) {
    console.warn("OBJKT token-by-key query failed:", err);
    return null;
  }
}

interface ObjktCardsByKeysResponse {
  listing: ObjktListingRow[];
  token: ObjktRawToken[];
}

/** Keys per request. Keeps a large wishlist off a single oversized query. */
const CARDS_BY_KEYS_CHUNK = 50;

/**
 * Re-resolves a set of tokens by key, pairing each with its cheapest active
 * listing so price and rarity reflect the market now rather than whenever the
 * caller last stored them. A token with no active listing still comes back,
 * priced as undefined and graded on supply alone.
 *
 * Returns only what OBJKT answered for: a failed request or a vanished token
 * yields a missing entry, leaving the caller free to keep its own copy.
 */
export async function fetchCardsByKeys(
  keys: Array<Pick<NFTCard, "contract_address" | "token_id">>,
  options: { throwOnError?: boolean } = {},
): Promise<Map<string, NFTCard>> {
  const resolved = new Map<string, NFTCard>();
  if (keys.length === 0) return resolved;

  // Filtering contract and token id with independent `_in` lists can match pairs
  // nobody asked for, so the requested keys are re-checked below. The
  // alternative -- an `_or` of exact pairs -- would have to be interpolated into
  // the query string, and these ids can come from a user-supplied file.
  const query = `
    query CardsByKeys($contracts: [String!], $tokenIds: [String!], $limit: Int!) {
      listing(
        where: {
          status: { _eq: "active" },
          price: { _gt: 0 },
          token: { fa_contract: { _in: $contracts }, token_id: { _in: $tokenIds } }
        },
        limit: $limit,
        order_by: { price: asc }
      ) {
        id
        price
        token { ${TOKEN_FIELDS} }
      }
      token(
        where: { fa_contract: { _in: $contracts }, token_id: { _in: $tokenIds } },
        limit: $limit
      ) { ${TOKEN_FIELDS} }
    }
  `;

  for (let start = 0; start < keys.length; start += CARDS_BY_KEYS_CHUNK) {
    const chunk = keys.slice(start, start + CARDS_BY_KEYS_CHUNK);
    const wanted = new Set(chunk.map(getCardKey));

    try {
      const data = await objktClient.request<ObjktCardsByKeysResponse>(query, {
        contracts: [...new Set(chunk.map((key) => key.contract_address))],
        tokenIds: [...new Set(chunk.map((key) => key.token_id))],
        limit: chunk.length * 20,
      });

      for (const token of data?.token || []) {
        const card = normalizeObjktToken(token);
        if (wanted.has(getCardKey(card))) resolved.set(getCardKey(card), card);
      }

      for (const item of cheapestPerToken(data?.listing || [])) {
        const card = normalizeObjktToken(item.token, {
          listingId: item.id,
          priceMutez: item.price,
        });
        if (wanted.has(getCardKey(card))) resolved.set(getCardKey(card), card);
      }
    } catch (err) {
      console.warn("OBJKT cards-by-keys query failed:", err);
      if (options.throwOnError) throw err;
    }
  }

  return resolved;
}

export interface PackDraw {
  cards: NFTCard[];
  excluded: ExclusionRecord[];
}

export async function fetchRandomPack(
  count = 5,
  denylist: DenylistIndex = ALLOW_ALL,
): Promise<PackDraw> {
  // Four windows rather than one contiguous block. A single window returns
  // adjacent listings, so an artist who bulk-lists fills the whole window --
  // which is how a pack ends up being one collection. The deep windows cut off
  // by timestamp rather than offset because OBJKT fails an offset past a few
  // hundred thousand rows, and the market goes back to 2022.
  const windowSize = Math.max(count * 2, 10);
  const recentOffset = Math.floor(Math.random() * RECENT_WINDOW_DEPTH);
  const now = Date.now();
  const deepCutoffs = Array.from({ length: 3 }, () => new Date(
    OLDEST_ACTIVE_LISTING_MS + Math.random() * (now - OLDEST_ACTIVE_LISTING_MS),
  ).toISOString());

  const listingFields = `
    id
    price
    token { ${PULL_TOKEN_FIELDS} }
  `;
  const activeWhere = `
    status: { _eq: "active" },
    price: { _gt: 0 },
    token: { display_uri: { _is_null: false } }
  `;
  const deepWindow = (alias: string, cutoffVar: string) => `
    ${alias}: listing(
      where: { ${activeWhere}, timestamp: { _lte: ${cutoffVar} } },
      limit: $limit,
      order_by: { timestamp: desc }
    ) { ${listingFields} }
  `;

  const windowsQuery = `
    query RandomActiveListings(
      $limit: Int!, $recent: Int!, $t2: timestamptz!, $t3: timestamptz!, $t4: timestamptz!
    ) {
      w1: listing(
        where: { ${activeWhere} },
        limit: $limit,
        offset: $recent,
        order_by: { id: desc }
      ) { ${listingFields} }
      ${deepWindow("w2", "$t2")}
      ${deepWindow("w3", "$t3")}
      ${deepWindow("w4", "$t4")}
    }
  `;

  const fallbackQuery = `
    query NewestActiveListings($limit: Int!) {
      listing(
        where: { ${activeWhere} },
        limit: $limit,
        offset: 0,
        order_by: { id: desc }
      ) { ${listingFields} }
    }
  `;

  try {
    const windows = await objktClient.request<ObjktPackWindowsResponse>(windowsQuery, {
      limit: windowSize,
      recent: recentOffset,
      t2: deepCutoffs[0],
      t3: deepCutoffs[1],
      t4: deepCutoffs[2],
    });

    let listings = [
      ...(windows?.w1 || []),
      ...(windows?.w2 || []),
      ...(windows?.w3 || []),
      ...(windows?.w4 || []),
    ];

    // The windows come back short when cutoffs land before the oldest surviving
    // listing or the market is quiet; fall back to the newest listings rather
    // than serving a short pack.
    if (listings.length < count) {
      const fallback = await objktClient.request<PullListingResponse>(fallbackQuery, {
        limit: Math.max(count * 4, 24),
      });
      listings = [...listings, ...(fallback?.listing || [])];
    }

    if (listings.length === 0) {
      throw new Error("No active listings found");
    }

    // Before cheapestPerToken and selectDiverseListings: an excluded token must
    // not consume a pack slot, and must not win the cheapest-per-token tiebreak
    // and thereby suppress a legitimate listing of the same token.
    const { eligible, excluded } = partitionListings(listings, denylist);

    const unique = cheapestPerToken(shuffleArray(eligible));
    const selected = selectDiverseListings(unique, count);

    return {
      cards: selected.map((item) => normalizeObjktToken(item.token, {
        listingId: item.id,
        priceMutez: item.price,
      })),
      excluded,
    };
  } catch (err) {
    console.error("Failed to fetch random listings from OBJKT:", err);
    throw err;
  }
}
