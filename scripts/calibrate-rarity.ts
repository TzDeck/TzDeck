import type { NFTCard } from "../src/lib/card";
import { PRICED_RARITY_LADDER, RARITY_TIERS, type CardRarity } from "../src/lib/rarity";
import { drawPacks } from "./drawPacks";

/**
 * Grades live packs, not a sample of the whole market: the priced ladder only
 * ever grades pack cards, and the pack draw is not a uniform sample of active
 * listings. Calibrating against anything else lets the two drift apart.
 */
const PACKS = Number(process.argv[2] ?? 100);

/**
 * The shape the priced ladder is held to. Each tier is at least as common as
 * the one above it, and the top two stay scarce. The ceilings leave room for
 * sampling noise: two 500-card samples of the same draw differ by several
 * points in a tier.
 */
const CEILINGS: Partial<Record<CardRarity, number>> = { legendary: 4, epic: 12 };

function percentile(values: number[], percentileRank: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil((percentileRank / 100) * sorted.length) - 1,
  );
  return Number(sorted[Math.max(0, index)].toFixed(3));
}

async function main() {
  const packs = await drawPacks(PACKS);
  const cards = packs.flat();
  const share = (rarity: CardRarity) => (100 * cards.filter((card) => card.rarity === rarity).length) / cards.length;

  console.log(`${PACKS} packs, ${cards.length} cards`);
  console.log("Priced ladder", PRICED_RARITY_LADDER);
  console.table([...RARITY_TIERS].reverse().map((rarity) => ({
    rarity,
    cards: `${share(rarity).toFixed(1)}%`,
    packsWithOne: `${((100 * packs.filter((pack) => pack.some((card) => card.rarity === rarity)).length) / PACKS).toFixed(0)}%`,
  })));

  const priced = cards.filter((card): card is NFTCard & { price_xtz: number } => card.price_xtz !== undefined);
  console.table([undefined, 1, 5, 10, 25, 100].map((maximumEditions) => {
    const segment = maximumEditions === undefined
      ? priced
      : priced.filter((card) => card.editions !== undefined && card.editions <= maximumEditions);
    const prices = segment.map((card) => card.price_xtz);
    return {
      segment: maximumEditions === undefined ? "all" : `≤${maximumEditions} editions`,
      count: segment.length,
      p50: percentile(prices, 50),
      p75: percentile(prices, 75),
      p90: percentile(prices, 90),
      p97: percentile(prices, 97),
    };
  }));

  const failures: string[] = [];
  for (let index = 1; index < RARITY_TIERS.length; index += 1) {
    const below = RARITY_TIERS[index - 1];
    const above = RARITY_TIERS[index];
    if (share(above) > share(below)) {
      failures.push(`${above} (${share(above).toFixed(1)}%) outnumbers ${below} (${share(below).toFixed(1)}%)`);
    }
  }
  for (const [rarity, ceiling] of Object.entries(CEILINGS) as Array<[CardRarity, number]>) {
    if (share(rarity) > ceiling) failures.push(`${rarity} is ${share(rarity).toFixed(1)}% (ceiling ${ceiling}%)`);
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(failure);
    process.exitCode = 1;
  } else {
    console.log("Calibration targets passed.");
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
