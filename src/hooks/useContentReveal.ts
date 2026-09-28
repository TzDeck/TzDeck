"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

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

/**
 * The viewer's standing choice to see explicit art uncovered, like OBJKT's own
 * setting. Saved on this device, and synced across open tabs. It does not
 * lift flashing-image covers: that one is about photosensitivity, and someone
 * happy to see explicit art may still need it.
 */
const SHOW_EXPLICIT_KEY = "tzdeck_show_explicit";
const SHOW_EXPLICIT_EVENT = "tzdeck:show-explicit-change";

function readShowExplicit(): boolean {
  try {
    return window.localStorage.getItem(SHOW_EXPLICIT_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribeToShowExplicit(onChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === SHOW_EXPLICIT_KEY || event.key === null) onChange();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(SHOW_EXPLICIT_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(SHOW_EXPLICIT_EVENT, onChange);
  };
}

export function setShowExplicit(show: boolean): void {
  try {
    if (show) window.localStorage.setItem(SHOW_EXPLICIT_KEY, "1");
    else window.localStorage.removeItem(SHOW_EXPLICIT_KEY);
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the
    // setting then simply doesn't stick, and covers stay the default.
  }
  window.dispatchEvent(new Event(SHOW_EXPLICIT_EVENT));
}

export function useShowExplicit(): boolean {
  return useSyncExternalStore(subscribeToShowExplicit, readShowExplicit, () => false);
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
  const showExplicit = useShowExplicit();
  const cardKey = card ? getCardKey(card) : null;
  const reveal = useCallback(() => {
    if (cardKey) revealCard(cardKey);
  }, [cardKey]);

  const hiddenBy = useMemo(() => {
    const warnings = showExplicit
      ? card?.content_warnings?.filter((warning) => warning !== "explicit")
      : card?.content_warnings;
    return warnings?.length && cardKey && !current.has(cardKey) ? warnings : NONE;
  }, [card?.content_warnings, cardKey, current, showExplicit]);
  return { hiddenBy, reveal };
}
