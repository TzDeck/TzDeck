"use client";

import { useCallback, useSyncExternalStore } from "react";

import type { ContentWarning, NFTCard } from "@/lib/card";
import { getCardKey } from "@/lib/cardKey";

/**
 * Cards the viewer has chosen to see despite a content warning, for this page
 * load only. Held in one place so revealing a card in the grid also reveals it
 * in its details view and on the battle screen, rather than asking again.
 */
let revealed: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getRevealed(): ReadonlySet<string> {
  return revealed;
}

export function revealCard(cardKey: string): void {
  if (revealed.has(cardKey)) return;
  revealed = new Set(revealed).add(cardKey);
  for (const listener of listeners) listener();
}

export function resetRevealedForTests(): void {
  revealed = new Set();
  for (const listener of listeners) listener();
}

export interface ContentReveal {
  /** The warnings still standing between the viewer and the artwork; empty once revealed. */
  hiddenBy: ContentWarning[];
  reveal: () => void;
}

const NONE: ContentWarning[] = [];

export function useContentReveal(
  card: Pick<NFTCard, "contract_address" | "token_id" | "content_warnings"> | null | undefined,
): ContentReveal {
  const current = useSyncExternalStore(subscribe, getRevealed, getRevealed);
  const cardKey = card ? getCardKey(card) : null;
  const reveal = useCallback(() => {
    if (cardKey) revealCard(cardKey);
  }, [cardKey]);

  const warnings = card?.content_warnings;
  const hiddenBy = warnings?.length && cardKey && !current.has(cardKey) ? warnings : NONE;
  return { hiddenBy, reveal };
}
