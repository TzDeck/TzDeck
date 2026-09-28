"use client";

import { setShowExplicit, useShowExplicit } from "@/hooks/useContentReveal";
import { EyeIcon, EyeOffIcon } from "./icons";

/**
 * The standing counterpart to a card's Show button: OBJKT's "show explicit
 * content" setting, kept on this device. Sits beside the sound toggle, the
 * app's other device preference.
 */
export default function ExplicitContentToggle() {
  const showExplicit = useShowExplicit();
  const label = showExplicit ? "Hide explicit content" : "Always show explicit content";

  return (
    <button
      type="button"
      onClick={() => setShowExplicit(!showExplicit)}
      title={label}
      aria-label="Always show explicit content"
      aria-pressed={showExplicit}
      className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-default bg-surface-2 text-xs text-text-secondary hover:border-border-strong hover:text-text-primary transition-colors"
    >
      {showExplicit ? <EyeIcon /> : <EyeOffIcon />}
    </button>
  );
}
