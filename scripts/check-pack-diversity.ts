import type { NFTCard } from "../src/lib/card";
import { objktClient } from "../src/lib/objkt";
import { PACK_MAX_PER_ARTIST } from "../src/lib/pullDraw";
import { RARITY_TIERS } from "../src/lib/rarity";
import { drawPacks, PACK_SIZE } from "./drawPacks";

const PACKS = Number(process.argv[2] ?? 60);
const DAY_MS = 86_400_000;

const AGE_BANDS = [
  { label: "last day", maxDays: 1 },
  { label: "last week", maxDays: 7 },
  { label: "last month", maxDays: 30 },
  { label: "last year", maxDays: 365 },
  { label: "older", maxDays: Infinity },
] as const;

function percent(part: number, whole: number): string {
  return `${((100 * part) / whole).toFixed(1)}%`;
}

function artistOf(card: NFTCard): string {
  return card.artist_address || card.artist_alias || "unattributed";
}

async function listingAgesInDays(cards: NFTCard[], now: number): Promise<number[]> {
  const ids = cards.flatMap((card) => (card.listing_id === undefined ? [] : [card.listing_id]));
  const data = await objktClient.request<{ listing: Array<{ timestamp: string }> }>(`
    query ListingTimes($ids: [bigint!]) {
      listing(where: { id: { _in: $ids } }) { timestamp }
    }
  `, { ids });
  return data.listing.map((row) => (now - Date.parse(row.timestamp)) / DAY_MS);
}

async function main() {
  const packs = await drawPacks(PACKS);

  const cards = packs.flat();
  const perPackArtists = packs.map((pack) => {
    const counts = new Map<string, number>();
    for (const card of pack) counts.set(artistOf(card), (counts.get(artistOf(card)) ?? 0) + 1);
    return counts;
  });
  const worstRepeat = Math.max(0, ...perPackArtists.flatMap((counts) => [...counts.values()]));
  const averageDistinct = perPackArtists.reduce((sum, counts) => sum + counts.size, 0) / PACKS;
  const tokens = new Set(cards.map((card) => `${card.contract_address}:${card.token_id}`));
  const artists = new Set(cards.map(artistOf));

  console.log(`${PACKS} packs, ${cards.length} cards`);

  console.log(`\nWithin a pack (cap: ${PACK_MAX_PER_ARTIST} per artist)`);
  console.log(`  average distinct artists: ${averageDistinct.toFixed(2)}`);
  console.log(`  worst single-artist count: ${worstRepeat}`);
  console.log(`  short packs: ${packs.filter((pack) => pack.length < PACK_SIZE).length}`);

  console.log("\nAcross the session");
  console.log(`  distinct tokens: ${tokens.size} (${percent(tokens.size, cards.length)})`);
  console.log(`  distinct artists: ${artists.size} (${percent(artists.size, cards.length)})`);

  const ages = await listingAgesInDays(cards, Date.now());
  console.log("\nWhen each card was listed");
  let floorDays = 0;
  for (const band of AGE_BANDS) {
    const n = ages.filter((days) => days >= floorDays && days < band.maxDays).length;
    console.log(`  ${band.label.padEnd(11)} ${String(n).padStart(4)}  ${percent(n, ages.length)}`);
    floorDays = band.maxDays;
  }

  console.log("\nRarity: share of cards, then share of packs holding at least one");
  for (const rarity of [...RARITY_TIERS].reverse()) {
    const n = cards.filter((card) => card.rarity === rarity).length;
    const packsWith = packs.filter((pack) => pack.some((card) => card.rarity === rarity)).length;
    console.log(`  ${rarity.padEnd(10)} ${String(n).padStart(4)}  ${percent(n, cards.length).padStart(6)}  ${percent(packsWith, PACKS).padStart(6)}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
