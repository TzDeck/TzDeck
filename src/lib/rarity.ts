/**
 * Rarity: the display tier TzDeck assigns a card from its edition supply and,
 * when it has one, its current listing price. Not an on-chain trait, a pull
 * probability, or a valuation. See CONTEXT.md.
 */

export type CardRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

/** Every tier, commonest first. One trainer stands at each tier, in this order. */
export const RARITY_TIERS: readonly CardRarity[] = ["common", "uncommon", "rare", "epic", "legendary"];

export const RARITY_LABELS: Record<CardRarity, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

export function isCardRarity(value: unknown): value is CardRarity {
  return typeof value === "string" && (RARITY_TIERS as readonly string[]).includes(value);
}

/** The tiers a card can climb to, highest first. Common is where a card lands when it reaches none of them. */
type RankedRarity = Exclude<CardRarity, "common">;
const RANKED_TIERS: readonly RankedRarity[] = ["legendary", "epic", "rare", "uncommon"];

interface PricedRung {
  maxEditions: number;
  minPriceXtz: number;
  /** The price that reaches this tier at any supply, or Infinity when scarcity is always required. */
  anySupplyPriceXtz: number;
}

/**
 * The priced ladder, which grades every booster-pack card. A card reaches a
 * tier on scarcity and price together, or on price alone. Calibrated against
 * the pack draw itself; re-run `npm run calibrate:rarity` after changing it.
 */
export const PRICED_RARITY_LADDER: Record<RankedRarity, PricedRung> = {
  legendary: { maxEditions: 1, minPriceXtz: 1_000, anySupplyPriceXtz: Infinity },
  epic: { maxEditions: 5, minPriceXtz: 100, anySupplyPriceXtz: 1_000 },
  rare: { maxEditions: 10, minPriceXtz: 25, anySupplyPriceXtz: 250 },
  uncommon: { maxEditions: 10, minPriceXtz: 5, anySupplyPriceXtz: 50 },
};

/**
 * The supply-only ladder's edition ceilings, for a card with no listing price.
 * Battle stats grade on this ladder, so it does not move when the priced
 * ladder is recalibrated.
 */
export const SUPPLY_RARITY_MAX_EDITIONS: Record<Exclude<RankedRarity, "legendary">, number> = {
  epic: 5,
  rare: 10,
  uncommon: 25,
};

/** Renders an edition ceiling the way a collector reads it: a lone edition is "1 of 1". */
function formatEditionRule(maximumEditions: number): string {
  return maximumEditions === 1 ? "1 of 1" : `≤${maximumEditions} editions`;
}

function formatPrice(priceXtz: number): string {
  return `${priceXtz.toLocaleString("en-US")}ꜩ`;
}

function pricedRule({ maxEditions, minPriceXtz, anySupplyPriceXtz }: PricedRung): string {
  const scarce = `${formatEditionRule(maxEditions)} and ${formatPrice(minPriceXtz)}+`;
  return Number.isFinite(anySupplyPriceXtz) ? `${scarce} · or ${formatPrice(anySupplyPriceXtz)}+` : scarce;
}

const lowestRung = PRICED_RARITY_LADDER.uncommon;

/** The grading rule for each tier on the priced ladder, as the About page states it. */
export const RARITY_RULES: Record<CardRarity, string> = {
  legendary: pricedRule(PRICED_RARITY_LADDER.legendary),
  epic: pricedRule(PRICED_RARITY_LADDER.epic),
  rare: pricedRule(PRICED_RARITY_LADDER.rare),
  uncommon: pricedRule(lowestRung),
  common: `under ${formatPrice(lowestRung.minPriceXtz)} · or >${lowestRung.maxEditions} editions under ${formatPrice(lowestRung.anySupplyPriceXtz)}`,
};

function calculatePricedRarity(editions: number | undefined, priceXtz: number): CardRarity {
  for (const tier of RANKED_TIERS) {
    const { maxEditions, minPriceXtz, anySupplyPriceXtz } = PRICED_RARITY_LADDER[tier];
    const scarceEnough = editions !== undefined && editions <= maxEditions && priceXtz >= minPriceXtz;
    if (scarceEnough || priceXtz >= anySupplyPriceXtz) return tier;
  }
  return "common";
}

/** The supply-only ladder, for a card with no listing price. It is also the ladder battle stats use. */
export function calculateSupplyRarity(editions?: number): CardRarity {
  if (editions === 1) return "legendary";
  if (editions !== undefined
    && editions <= SUPPLY_RARITY_MAX_EDITIONS.epic) return "epic";
  if (editions !== undefined
    && editions <= SUPPLY_RARITY_MAX_EDITIONS.rare) return "rare";
  if (editions !== undefined
    && editions <= SUPPLY_RARITY_MAX_EDITIONS.uncommon) return "uncommon";
  return "common";
}

/** A card's rarity: graded on price and supply when it has a listing price, on supply alone when it does not. */
export function rarityFor(editions: number | undefined, priceXtz: number | undefined): CardRarity {
  return priceXtz === undefined ? calculateSupplyRarity(editions) : calculatePricedRarity(editions, priceXtz);
}
