"use client";

import { setShowExplicit } from "@/hooks/useContentReveal";
import type { ContentWarning } from "@/lib/card";
import { EyeOffIcon } from "./icons";

const WARNING_LABEL: Record<ContentWarning, string> = {
  explicit: "Explicit content",
  flashing: "Flashing images",
};

export function contentWarningLabel(warnings: readonly ContentWarning[]): string {
  return warnings.map((warning) => WARNING_LABEL[warning]).join(" · ");
}

/**
 * What stands in for artwork OBJKT labels explicit or flashing, until the
 * viewer asks to see it. The artwork itself is not rendered underneath, so
 * nothing loads and nothing shows through before they choose.
 *
 * `compact` is for thumbnails too small for a sentence: the whole tile becomes
 * the reveal button, and the warning moves to its accessible name.
 *
 * The container is transparent and ignores the pointer, so a surface can lay
 * it over its own placeholder and keep chips and click targets around it.
 */
export default function ContentWarningCover({
  warnings,
  cardName,
  onReveal,
  compact = false,
}: {
  warnings: readonly ContentWarning[];
  cardName: string;
  onReveal: () => void;
  compact?: boolean;
}) {
  const label = contentWarningLabel(warnings);

  if (compact) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onReveal();
        }}
        aria-label={`${label}: show ${cardName}`}
        title={`${label}. Tap to show.`}
        className="absolute inset-0 flex items-center justify-center bg-surface-2 text-text-tertiary transition-colors hover:text-text-primary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-hover"
      >
        <EyeOffIcon className="h-6 w-6" />
      </button>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
      <EyeOffIcon className="h-7 w-7 text-text-tertiary" />
      <p className="text-xs font-semibold text-text-secondary">{label}</p>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onReveal();
        }}
        aria-label={`Show ${cardName} (${label.toLowerCase()})`}
        className="button-quiet pointer-events-auto px-3 py-1.5 text-xs font-semibold"
      >
        Show
      </button>
      {warnings.includes("explicit") && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setShowExplicit(true);
          }}
          className="pointer-events-auto text-2xs text-text-tertiary underline underline-offset-2 hover:text-text-primary"
        >
          Always show explicit content
        </button>
      )}
    </div>
  );
}
