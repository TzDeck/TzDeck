import assert from "node:assert/strict";
import test from "node:test";

import { calculateSupplyRarity, RARITY_RULES, rarityFor } from "./rarity";

test("the About page states the priced ladder's rules", () => {
  assert.deepEqual(RARITY_RULES, {
    legendary: "1 of 1 and 1,000ꜩ+",
    epic: "≤5 editions and 100ꜩ+ · or 1,000ꜩ+",
    rare: "≤10 editions and 25ꜩ+ · or 250ꜩ+",
    uncommon: "≤10 editions and 5ꜩ+ · or 50ꜩ+",
    common: "under 5ꜩ · or >10 editions under 50ꜩ",
  });
});

test("the priced ladder grades each boundary", () => {
  assert.equal(rarityFor(1, 1_000), "legendary");
  assert.equal(rarityFor(1, 999.99), "epic", "a 1 of 1 just under the Legendary price");
  assert.equal(rarityFor(2, 1_000), "epic", "any supply at 1,000ꜩ is Epic, never Legendary");
  assert.equal(rarityFor(5, 100), "epic");
  assert.equal(rarityFor(6, 100), "rare", "one edition past the Epic ceiling");
  assert.equal(rarityFor(500, 250), "rare", "any supply at 250ꜩ");
  assert.equal(rarityFor(10, 25), "rare");
  assert.equal(rarityFor(1, 24.99), "uncommon", "a 1 of 1 under 25ꜩ is not Rare");
  assert.equal(rarityFor(11, 25), "common", "past the ten-edition ceiling and under 50ꜩ");
  assert.equal(rarityFor(500, 50), "uncommon", "any supply at 50ꜩ");
  assert.equal(rarityFor(10, 5), "uncommon");
  assert.equal(rarityFor(1, 4.99), "common", "a 1 of 1 under 5ꜩ is Common");
  assert.equal(rarityFor(undefined, 49.99), "common", "an unknown supply grades on price alone");
  assert.equal(rarityFor(undefined, 250), "rare");
});

test("calculateSupplyRarity grades wallet holdings without listing prices", () => {
  assert.equal(calculateSupplyRarity(1), "legendary");
  assert.equal(calculateSupplyRarity(5), "epic");
  assert.equal(calculateSupplyRarity(6), "rare");
  assert.equal(calculateSupplyRarity(10), "rare");
  assert.equal(calculateSupplyRarity(11), "uncommon");
  assert.equal(calculateSupplyRarity(25), "uncommon");
  assert.equal(calculateSupplyRarity(26), "common");
  assert.equal(calculateSupplyRarity(undefined), "common");
});

test("rarityFor grades an unpriced card on supply alone, and a priced one on price too", () => {
  assert.equal(rarityFor(1, undefined), "legendary", "a 1 of 1 with no price is Legendary on the supply ladder");
  assert.equal(rarityFor(1, 0), "common", "the same 1 of 1 listed at nothing is Common on the priced ladder");
});
