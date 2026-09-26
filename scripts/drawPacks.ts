import type { NFTCard } from "../src/lib/card";
import { fetchRandomPack } from "../src/lib/objkt";

export const PACK_SIZE = 5;

/**
 * Draws `count` live packs one after another, the way a player opening packs
 * would. OBJKT rate-limits a burst this size, so a 429 is waited out rather
 * than aborting the run. No denylist: the draw is measured against the OBJKT
 * rules alone, so no database is needed.
 */
export async function drawPacks(count: number): Promise<NFTCard[][]> {
  const packs: NFTCard[][] = [];
  for (let index = 0; index < count; index += 1) {
    for (let attempt = 1; ; attempt += 1) {
      try {
        packs.push((await fetchRandomPack(PACK_SIZE)).cards);
        break;
      } catch (error) {
        const status = (error as { response?: { status?: number } }).response?.status;
        if (status !== 429 || attempt === 5) throw error;
        await new Promise((resolve) => setTimeout(resolve, 5_000 * attempt));
      }
    }
  }
  return packs;
}
