"use client";

import { motion } from "framer-motion";

// Same out-quart easing used everywhere else in onboarding so motion
// reads as one coherent system.
const PREMIUM_EASE = [0.22, 1, 0.36, 1] as const;

interface OnboardingProgressProps {
  /** 1-based step number (1, 2, 3, or 4 in the current flow). */
  current: number;
  /** Total number of steps. Defaults to 4. */
  total?: number;
}

/**
 * Hairline progress indicator for the onboarding flow.
 *
 * Visually:
 *   • Top row : "KINETIC" wordmark on the left, "Step N / 4" on the right.
 *               Mirrors the eyebrow style used across the app so the bar
 *               feels like it belongs to the same family as /profile and
 *               /settings.
 *   • Track   : 3px hairline track, neutral.
 *   • Fill    : the filled portion animates from the previous step's width
 *               (`(N-1)/total`) to this step's width (`N/total`) when the
 *               component mounts. Because every step page passes its own
 *               `current` and remounts on navigation, the bar appears to
 *               grow continuously across page boundaries instead of
 *               flashing four disconnected states.
 *
 * Purely presentational — the component knows nothing about routing.
 */
export default function OnboardingProgress({
  current,
  total = 4,
}: OnboardingProgressProps) {
  // Clamp so we don't render negative widths if a caller passes step 0,
  // and so step N === total still ends at exactly 100%.
  const fromPct = Math.max(0, Math.min(100, ((current - 1) / total) * 100));
  const toPct = Math.max(0, Math.min(100, (current / total) * 100));

  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs font-medium uppercase tracking-[0.32em] text-neutral-500 dark:text-neutral-400">
        <span>Kinetic</span>
        <span className="tabular-nums">
          Step{" "}
          <span className="text-neutral-700 dark:text-neutral-200">
            {current}
          </span>{" "}
          / {total}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-label={`Step ${current} of ${total}`}
        className="relative mt-3 h-[3px] w-full overflow-hidden rounded-full bg-neutral-200/70 dark:bg-neutral-800/70"
      >
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-blue-500 dark:bg-blue-400"
          initial={{ width: `${fromPct}%` }}
          animate={{ width: `${toPct}%` }}
          // Slight delay lets the page fade-in start first so the eye lands
          // on the bar already in motion.
          transition={{ duration: 0.85, ease: PREMIUM_EASE, delay: 0.18 }}
        />
      </div>
    </div>
  );
}
