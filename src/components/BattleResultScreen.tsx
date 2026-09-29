"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion, useAnimationControls, type TargetAndTransition } from "framer-motion";
import { fetchTokenByKey } from "@/lib/objkt";
import { formatShortAddress, isImageArtifact, type NFTCard as NFTCardType } from "@/lib/card";
import { parseCardKey } from "@/lib/cardKey";
import { getCardImageSources } from "@/lib/ipfs";
import type { CardRarity } from "@/lib/rarity";
import { useFailoverImage } from "@/hooks/useFailoverImage";
import { useContentReveal } from "@/hooks/useContentReveal";
import { RARITY_CONFIG } from "./rarityStyles";
import { OFFENSIVE_RECOVERY_HOURS, type RoundOutcome, type RoundRecord } from "@/lib/battle/rules";
import { trainerAvatarSvg } from "@/lib/battle/trainerAvatar";
import type { BattleResult } from "./BattlePanel";
import PageBackdrop from "./PageBackdrop";
import ContentWarningCover from "./ContentWarningCover";

export const DEFAULT_BEAT_DELAY_MS = 650;

/** A bar's fill hue carries meaning: identity (yours vs theirs) normally, danger once either side is running out. */
const LOW_HP_THRESHOLD_PCT = 25;

function trainerDisplayName(tier: CardRarity): string {
  return `${RARITY_CONFIG[tier].label} Trainer`;
}

interface BattleResultScreenProps {
  attackerCard: NFTCardType;
  result: BattleResult;
  wasOverkillTiebreak: boolean;
  onClose: () => void;
  beatDelayMs?: number;
  /**
   * Set for a browser-only demo fight (lib/battle/demo.ts). Nothing was
   * committed, so the screen says so, reframes XP and recovery as what a real
   * battle would do, and offers a replay alongside Close.
   */
  demo?: {
    onReplay: () => void;
    /** The next step toward a real battle, e.g. a connect button; shown once the fight ends. */
    callToAction?: React.ReactNode;
  };
}

interface CombatBeat {
  round: number;
  side: "attacker" | "defender";
  damage: number;
  hpA: number;
  hpB: number;
  result: RoundOutcome;
}

function combatBeats(history: RoundRecord[] | undefined, attackerMaxHp: number, defenderMaxHp: number): CombatBeat[] {
  const beats: CombatBeat[] = [];
  let hpA = attackerMaxHp;
  let hpB = defenderMaxHp;
  for (const round of history ?? []) {
    beats.push({
      round: round.round,
      side: "attacker",
      damage: round.damageA,
      hpA,
      hpB: round.hpB,
      result: round.resultA ?? "hit",
    });
    hpB = round.hpB;
    beats.push({
      round: round.round,
      side: "defender",
      damage: round.damageB,
      hpA: round.hpA,
      hpB,
      result: round.resultB ?? "hit",
    });
    hpA = round.hpA;
  }
  return beats;
}

/**
 * What an avatar does on the beat just revealed: the side swinging leans in
 * toward the other, and the side on the receiving end shakes (harder on a
 * critical) or, on a miss, hops back out of the way. `beat` changes every
 * reveal, so the same motion twice in a row still replays. On the final beat
 * each side also carries its finale, played once that beat's motion ends.
 */
type AvatarMotion = "lunge" | "hit" | "critical" | "dodge";
type AvatarFinale = "victory" | "defeat";

interface AvatarCue {
  beat: number;
  motion: AvatarMotion;
  /** Damage taken this beat, for the number that floats up off a hit avatar. */
  damage?: number;
  finale?: AvatarFinale;
}

/** Seconds into the beat when the lunge reaches the defender; the reaction starts there. */
const IMPACT_DELAY_S = 0.12;

/** +x for the attacker on the left, -x for the defender on the right. */
function towardOpponent(side: "attacker" | "defender"): number {
  return side === "attacker" ? 1 : -1;
}

function avatarKeyframes(motionKind: AvatarMotion, side: "attacker" | "defender"): TargetAndTransition {
  const toward = towardOpponent(side);
  if (motionKind === "lunge") {
    return {
      x: [0, 18 * toward, 0],
      rotate: [0, 4 * toward, 0],
      transition: { duration: 0.35, times: [0, 0.35, 1], ease: "easeOut" },
    };
  }
  if (motionKind === "dodge") {
    return {
      x: [0, -14 * toward, 0],
      y: [0, -6, 0],
      transition: { duration: 0.35, delay: IMPACT_DELAY_S, times: [0, 0.4, 1], ease: "easeOut" },
    };
  }
  const amplitude = motionKind === "critical" ? 10 : 5;
  return {
    x: [0, -amplitude, amplitude, -amplitude * 0.7, amplitude * 0.7, -amplitude * 0.3, 0],
    rotate: motionKind === "critical" ? [0, -3, 3, -2, 2, 0, 0] : 0,
    transition: { duration: motionKind === "critical" ? 0.45 : 0.35, delay: IMPACT_DELAY_S, ease: "easeInOut" },
  };
}

function finaleKeyframes(finale: AvatarFinale, side: "attacker" | "defender"): TargetAndTransition {
  if (finale === "victory") {
    return { y: [0, -14, 0, -6, 0], transition: { duration: 0.6, ease: "easeOut" } };
  }
  // The loser tips over away from the winner and stays down, drained of color.
  const away = -towardOpponent(side);
  return {
    // Shrunk a touch so the tilted corner stays clear of the name below it.
    x: 8 * away,
    rotate: 10 * away,
    scale: 0.92,
    opacity: 0.55,
    filter: "grayscale(1)",
    transition: { duration: 0.6, ease: "easeIn" },
  };
}

function avatarCue(
  beat: CombatBeat | undefined,
  beatNumber: number,
  side: "attacker" | "defender",
  finale: AvatarFinale | undefined,
): AvatarCue | null {
  if (!beat) return null;
  if (beat.side === side) return { beat: beatNumber, motion: "lunge", finale };
  if (beat.result === "miss") return { beat: beatNumber, motion: "dodge", finale };
  return { beat: beatNumber, motion: beat.result === "critical" ? "critical" : "hit", damage: beat.damage, finale };
}

function CardFace({
  card,
  side,
  trainerTier,
  cue,
}: {
  card: NFTCardType | null;
  side: "attacker" | "defender";
  trainerTier?: CardRarity;
  cue?: AvatarCue | null;
}) {
  const sources = useMemo(
    () => (card
      ? getCardImageSources(
        card.thumbnail_uri,
        card.display_uri,
        isImageArtifact(card) ? card.artifact_uri : undefined,
      )
      : []),
    [card],
  );
  const { imageUrl, loaded, failed, handleLoad, handleError } = useFailoverImage(sources);
  const { hiddenBy, reveal } = useContentReveal(card);
  const rarityConfig = RARITY_CONFIG[trainerTier ?? card?.rarity ?? "common"];
  const trainerName = trainerTier ? trainerDisplayName(trainerTier) : null;
  const avatarSvg = useMemo(() => (trainerTier ? trainerAvatarSvg(trainerTier) : null), [trainerTier]);
  const controls = useAnimationControls();
  const defeated = cue?.finale === "defeat";
  const tookHit = cue?.motion === "hit" || cue?.motion === "critical";

  useEffect(() => {
    if (!cue) return;
    let cancelled = false;
    // MotionPreferences' reducedMotion="user" turns these transforms into an
    // instant jump to the end state: the resting position, or the finale's pose.
    controls.start(avatarKeyframes(cue.motion, side)).then(() => {
      if (!cancelled && cue.finale) controls.start(finaleKeyframes(cue.finale, side));
    });
    return () => {
      cancelled = true;
    };
  }, [cue, controls, side]);

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      {/* Idle breathing, on its own layer so it never fights the beat motions below. Offset per side so they don't bob in unison. */}
      <motion.div
        className="relative"
        animate={defeated ? { y: 0 } : { y: [0, -3, 0] }}
        transition={
          defeated
            ? { duration: 0.3 }
            : { duration: 3.2, repeat: Infinity, ease: "easeInOut", delay: side === "attacker" ? 0 : 1.6 }
        }
      >
        {/* A wrapper, not the box itself: the box's CSS transition-all would chase every transform frame. */}
        <motion.div
          animate={controls}
          data-avatar-motion={cue?.motion ?? "idle"}
          data-avatar-finale={cue?.finale ?? "none"}
          data-testid={`${side}-avatar`}
        >
          <div
            className={`relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-xl border border-border-subtle bg-surface-2 transition-all sm:h-36 sm:w-36 ${trainerTier || card ? rarityConfig.ring : ""} ${trainerTier || card ? rarityConfig.glow : ""}`}
          >
            {avatarSvg ? (
              <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: avatarSvg }} />
            ) : card && hiddenBy.length > 0 ? (
              <ContentWarningCover warnings={hiddenBy} cardName={card.name} onReveal={reveal} compact />
            ) : card && imageUrl && !failed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt={card.name}
                className={`h-full w-full object-cover transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`}
                onLoad={handleLoad}
                onError={handleError}
              />
            ) : (
              <span className="text-xs text-text-tertiary">{card ? card.name : side === "defender" ? "Loading…" : ""}</span>
            )}
            {cue && tookHit ? (
              <motion.div
                key={cue.beat}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-danger"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, cue.motion === "critical" ? 0.55 : 0.3, 0] }}
                transition={{ duration: 0.3, delay: IMPACT_DELAY_S }}
              />
            ) : null}
          </div>
        </motion.div>
        {cue && tookHit && cue.damage !== undefined ? (
          // The log already says it in words, so the floating number is decoration.
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
            <motion.span
              key={cue.beat}
              data-testid={`${side}-damage`}
              className={`font-display font-bold tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] ${
                cue.motion === "critical" ? "text-lg text-rarity-legendary" : "text-sm text-text-primary"
              }`}
              // Hidden until impact, then it rises and fades on the same curve, so it's gone as it reaches the top.
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: [1, 0], y: [0, -32] }}
              transition={{ duration: 0.5, delay: IMPACT_DELAY_S, ease: "easeOut" }}
            >
              -{Math.round(cue.damage)}
            </motion.span>
          </div>
        ) : null}
      </motion.div>
      <p className="max-w-[9rem] truncate text-xs font-semibold text-text-primary">
        {trainerName ?? (card ? card.name : side === "defender" ? "Loading…" : "")}
      </p>
    </div>
  );
}

function HealthBar({ label, current, max, side }: { label: string; current: number; max: number; side: "attacker" | "defender" }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  // Identity carries the bar's normal color -- you read as the accent
  // (the app's one "this is you, this is action" hue), the opponent reads
  // neutral. Either one crossing into danger territory overrides that with
  // the same signal a critical hit against you already carries, so a bar
  // about to hit zero reads as urgent regardless of whose it is.
  const isLow = pct <= LOW_HP_THRESHOLD_PCT;
  const fillClass = isLow ? "bg-danger" : side === "attacker" ? "bg-accent" : "bg-text-tertiary";
  return (
    <div className="w-full max-w-[9rem]">
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full transition-all ${fillClass}`} style={{ width: `${pct}%` }} />
      </div>
      <p className={`mt-1 text-[11px] tabular-nums ${isLow ? "text-danger" : "text-text-tertiary"}`}>
        {label} — {current} / {max} HP
      </p>
    </div>
  );
}

/** A card's hit strength, next to the HP its bar already shows. Absent on a stored battle that predates stats. */
function PowerStat({ power }: { power: number | undefined }) {
  if (power === undefined) return null;
  return <p className="-mt-1 text-[11px] tabular-nums text-text-tertiary">Power {power}</p>;
}

function OutcomeBanner({
  sequenceComplete,
  outcome,
  winner,
  wasOverkillTiebreak,
  xpAwarded,
  isDemo,
}: {
  sequenceComplete: boolean;
  outcome: BattleResult["outcome"];
  winner: BattleResult["winner"];
  wasOverkillTiebreak: boolean;
  xpAwarded: number;
  isDemo: boolean;
}) {
  if (!sequenceComplete) return <div className="h-[3.25rem]" aria-hidden="true" />;

  if (outcome === "draw") {
    return (
      <div className="mx-auto flex w-fit items-center gap-2 rounded-xl border border-border-default bg-surface-2 px-4 py-2.5">
        <p className="font-display text-lg font-bold text-text-secondary">Draw</p>
        <p className="text-xs text-text-tertiary">No XP, no recovery for either side.</p>
      </div>
    );
  }

  if (winner === "attacker") {
    return (
      <div className="mx-auto flex w-fit items-center gap-2 rounded-xl border border-success/40 bg-success-quiet px-4 py-2.5">
        <p className="font-display text-lg font-bold text-success">{wasOverkillTiebreak ? "Won by margin!" : "Victory!"}</p>
        {isDemo ? (
          <p className="text-xs text-success/80">
            A real win here earns <span className="font-bold tabular-nums">+{xpAwarded} XP</span>.
          </p>
        ) : (
          <p className="text-sm font-bold tabular-nums text-success">+{xpAwarded} XP</p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-fit items-center gap-2 rounded-xl border border-danger/40 bg-danger-quiet px-4 py-2.5">
      <p className="font-display text-lg font-bold text-danger">Defeated</p>
      <p className="text-xs text-danger/80">
        {isDemo
          ? `A real loss rests your card for ${OFFENSIVE_RECOVERY_HOURS} ${OFFENSIVE_RECOVERY_HOURS === 1 ? "hour" : "hours"}.`
          : "Recovering for a while."}
      </p>
    </div>
  );
}

export default function BattleResultScreen({
  attackerCard,
  result,
  wasOverkillTiebreak,
  onClose,
  beatDelayMs = DEFAULT_BEAT_DELAY_MS,
  demo,
}: BattleResultScreenProps) {
  const [defenderCard, setDefenderCard] = useState<NFTCardType | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (result.trainerTier || !result.defenderCardKey) return;
    const defenderToken = parseCardKey(result.defenderCardKey);
    if (!defenderToken) return;

    fetchTokenByKey(defenderToken.contractAddress, defenderToken.tokenId).then((card) => {
      if (!cancelled) setDefenderCard(card);
    });
    return () => {
      cancelled = true;
    };
  }, [result.trainerTier, result.defenderCardKey]);

  const attackerMaxHp = result.attackerStats?.hp ?? result.combat?.finalHpA ?? 0;
  const defenderMaxHp = result.defenderStats?.hp ?? result.combat?.finalHpB ?? 0;

  const beats = useMemo(
    () => combatBeats(result.combat?.history, attackerMaxHp, defenderMaxHp),
    [result.combat, attackerMaxHp, defenderMaxHp],
  );

  const [revealedBeats, setRevealedBeats] = useState(0);

  useEffect(() => {
    if (revealedBeats >= beats.length) return;
    const timer = setTimeout(() => setRevealedBeats((n) => n + 1), beatDelayMs);
    return () => clearTimeout(timer);
  }, [revealedBeats, beats.length, beatDelayMs]);

  const sequenceComplete = revealedBeats >= beats.length;
  const lastRevealed = beats[revealedBeats - 1];
  const attackerHp = lastRevealed ? lastRevealed.hpA : attackerMaxHp;
  const defenderHp = lastRevealed ? lastRevealed.hpB : defenderMaxHp;
  // The finale rides on the last beat, so it only plays once the whole fight has.
  const finaleFor = (side: "attacker" | "defender"): AvatarFinale | undefined =>
    sequenceComplete && result.outcome === "win" && result.winner
      ? result.winner === side
        ? "victory"
        : "defeat"
      : undefined;
  const attackerFinale = finaleFor("attacker");
  const defenderFinale = finaleFor("defender");
  const attackerCue = useMemo(
    () => avatarCue(lastRevealed, revealedBeats, "attacker", attackerFinale),
    [lastRevealed, revealedBeats, attackerFinale],
  );
  const defenderCue = useMemo(
    () => avatarCue(lastRevealed, revealedBeats, "defender", defenderFinale),
    [lastRevealed, revealedBeats, defenderFinale],
  );

  return (
    // Opaque, with the app's own backdrop drawn inside: a translucent, blurred
    // overlay only showed a smear of the page, and a backdrop-filter here would
    // pin PageBackdrop's fixed layers to this box instead of the viewport.
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-surface-0 px-4 py-6">
      <PageBackdrop />
      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col">
        {demo ? (
          <p className="mx-auto mb-3 w-fit rounded-full border border-accent/30 bg-accent-quiet px-3 py-1 text-2xs font-semibold uppercase tracking-wider text-accent-hover">
            Demo battle · nothing is saved
          </p>
        ) : null}
        <div className="mb-5">
          <OutcomeBanner
            sequenceComplete={sequenceComplete}
            outcome={result.outcome}
            winner={result.winner}
            wasOverkillTiebreak={wasOverkillTiebreak}
            xpAwarded={result.xpAwarded ?? 0}
            isDemo={Boolean(demo)}
          />
        </div>

        <div className="flex items-center justify-center gap-4 sm:gap-8">
          <div className="flex flex-1 flex-col items-center gap-2">
            <CardFace card={attackerCard} side="attacker" cue={attackerCue} />
            <HealthBar label="You" current={attackerHp} max={attackerMaxHp} side="attacker" />
            <PowerStat power={result.attackerStats?.power} />
          </div>
          <div
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface-2 text-xs font-bold text-text-primary"
          >
            VS
          </div>
          <div className="flex flex-1 flex-col items-center gap-2">
            <CardFace card={defenderCard} side="defender" trainerTier={result.trainerTier} cue={defenderCue} />
            <HealthBar
              label={
                result.trainerTier
                  ? trainerDisplayName(result.trainerTier)
                  : result.defenderWallet
                    ? formatShortAddress(result.defenderWallet)
                    : "Opponent"
              }
              current={defenderHp}
              max={defenderMaxHp}
              side="defender"
            />
            <PowerStat power={result.defenderStats?.power} />
          </div>
        </div>

        {result.attackerStats && result.defenderStats ? (
          <p className="mt-3 text-center text-[11px] text-text-tertiary">
            Power comes from edition size: fewer editions hit harder. HP comes from rarity and the description.
          </p>
        ) : null}

        <div className="mt-6 max-h-[50vh] flex-1 space-y-1.5 overflow-y-auto rounded-xl border border-border-default bg-surface-1/60 p-3">
          {beats.slice(0, revealedBeats).map((beat, index) => {
            const name =
              beat.side === "attacker"
                ? attackerCard.name
                : result.trainerTier
                  ? trainerDisplayName(result.trainerTier)
                  : (defenderCard?.name ?? "Opponent");
            // Valence, not just side: a hit you land is good for you: a hit
            // landed on you is bad for you, regardless of which side of the
            // screen it's rendered on.
            const critColor = beat.side === "attacker" ? "text-success" : "text-danger";
            if (beat.result === "miss") {
              return (
                <p key={index} className="text-xs italic text-text-tertiary">
                  {beat.side === "attacker" ? `${name}'s hit missed!` : `${name}'s counter missed!`}
                </p>
              );
            }
            if (beat.result === "critical") {
              return (
                <p key={index} className={`text-xs font-bold ${critColor}`}>
                  {beat.side === "attacker"
                    ? `${name} landed a CRITICAL HIT for ${Math.round(beat.damage)}!`
                    : `${name} countered with a CRITICAL HIT for ${Math.round(beat.damage)}!`}
                </p>
              );
            }
            return (
              <p key={index} className="text-xs text-text-secondary">
                {beat.side === "attacker"
                  ? `${name} hit for ${Math.round(beat.damage)}!`
                  : `${name} hit back for ${Math.round(beat.damage)}!`}
              </p>
            );
          })}
        </div>

        {sequenceComplete && demo ? (
          <div className="mt-6 flex flex-col gap-3">
            {demo.callToAction}
            <div className="flex gap-2">
              <button onClick={demo.onReplay} className="button-secondary flex-1 px-4 py-2.5 text-xs font-semibold">
                Replay
              </button>
              <button onClick={onClose} className="button-primary flex-1 px-4 py-2.5 text-xs font-semibold">
                Close
              </button>
            </div>
          </div>
        ) : sequenceComplete ? (
          <button onClick={onClose} className="button-primary mt-6 w-full px-4 py-2.5 text-xs font-semibold">
            Close
          </button>
        ) : null}
      </div>
    </div>
  );
}
