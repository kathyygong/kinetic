"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion, type Variants } from "framer-motion";

import OnboardingProgress from "@/components/OnboardingProgress";
import { projectRaceTime, formatPace } from "@/lib/paceCalculator";
import {
  generateTrainingPlan,
  type PlanWeek,
  type Workout,
  type WorkoutType,
} from "@/lib/planGenerator";
import { markOnboardingComplete } from "@/lib/profileStorage";
import { getGoal } from "@/lib/storage";
import { tokens } from "@/lib/tokens";
import type { Goal, RaceDistance } from "@/lib/types";

// --- Motion ----------------------------------------------------------------

const PREMIUM_EASE = [0.22, 1, 0.36, 1] as const;

// Page-exit fade duration. Same value across every onboarding step.
const EXIT_MS = 320;

const containerVariants: Variants = {
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    y: 0,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: { duration: EXIT_MS / 1000, ease: PREMIUM_EASE },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: PREMIUM_EASE },
  },
};

// --- Constants -------------------------------------------------------------

const RACE_LABEL: Record<RaceDistance, string> = {
  "5k": "5K",
  "10k": "10K",
  half: "half marathon",
  marathon: "marathon",
};

const WORKOUT_LABEL: Record<WorkoutType, string> = {
  easy: "Easy run",
  tempo: "Tempo",
  intervals: "Intervals",
  "long run": "Long run",
  race: "Race day",
};

/** Display order for the 4 sample workouts. */
const WORKOUT_DISPLAY_ORDER: WorkoutType[] = [
  "long run",
  "tempo",
  "intervals",
  "easy",
];

// --- Page ------------------------------------------------------------------

/**
 * Onboarding step 4 — celebratory plan preview.
 *
 * Shows the user (a) their projected race time, (b) the shape of the
 * plan we're about to put them on (length, peak mileage, sessions per
 * week), (c) a few representative workouts pulled from a peak build
 * week, and (d) a brief explanation of how the plan adapts to recovery,
 * calendar, and progress.
 *
 * Tone: restrained celebration. The big number is the projected time;
 * everything else is supporting detail. No confetti.
 */
export default function OnboardingPreviewPage() {
  const router = useRouter();
  const [goal, setGoal] = useState<Goal | null>(null);
  // Drives the page-exit fade on "Start training".
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const stored = getGoal();
    if (!stored) {
      router.replace("/onboarding/goal");
      return;
    }
    setGoal(stored);
  }, [router]);

  // Derive everything from the goal in a single memoized pass so we don't
  // re-run the plan generator on each render.
  const summary = useMemo(() => {
    if (!goal) return null;

    const projectedSec = projectRaceTime(
      goal.race_distance,
      goal.current_prs,
      goal.experience_level
    );

    const plan: PlanWeek[] = generateTrainingPlan(goal);
    const totalWeeks = plan.length;
    const peakWeek = pickPeakWeek(plan);
    const peakMileage = peakWeek
      ? Math.round(peakWeek.workouts.reduce((s, w) => s + w.distance, 0))
      : 0;
    const sessionsPerWeek = peakWeek ? peakWeek.workouts.length : 0;

    const sampleWorkouts: Workout[] = pickSampleWorkouts(peakWeek);

    return {
      projectedSec,
      totalWeeks,
      peakMileage,
      sessionsPerWeek,
      sampleWorkouts,
      raceDateLabel: formatLongDate(goal.target_date),
      hasAnyPR: hasAnyPR(goal),
    };
  }, [goal]);

  const handleStart = () => {
    if (isExiting) return;
    // Persist the "I finished onboarding" flag so future sign-ins skip
    // straight to /dashboard. Identity, goal, PRs, training days, and
    // service connections were all written by earlier steps; this is
    // the final source-of-truth bit.
    markOnboardingComplete();
    // Page-exit fade, then route to the dashboard.
    setIsExiting(true);
    window.setTimeout(() => router.push("/dashboard"), EXIT_MS - 40);
  };

  return (
    <main className="relative flex min-h-[calc(100vh-3rem)] items-center justify-center overflow-hidden py-16 sm:py-24">
      {/* Global animated wash lives in app/layout.tsx. */}

      <motion.div
        initial="hidden"
        animate={isExiting ? "exit" : "show"}
        variants={containerVariants}
        className="w-full max-w-3xl"
      >
        {/* Step indicator. */}
        <motion.div variants={itemVariants}>
          <OnboardingProgress current={4} />
        </motion.div>

        {/* Header */}
        <motion.div variants={itemVariants} className="mt-10 text-center">
          {/* Restrained celebration: a small "Plan ready" pill in lieu of confetti. */}
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700 dark:border-blue-400/30 dark:bg-blue-950/40 dark:text-blue-200">
              <SparkleIcon />
              Plan ready
            </span>
          </div>
          <h1 className="mt-4 text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-neutral-900 dark:text-neutral-100 sm:text-5xl">
            Here&apos;s your training plan.
          </h1>
          {goal && summary && (
            <p className="mt-4 text-base text-neutral-600 dark:text-neutral-400">
              Built for your {RACE_LABEL[goal.race_distance]} on{" "}
              <span className="font-medium text-neutral-800 dark:text-neutral-200">
                {summary.raceDateLabel}
              </span>
              . {summary.totalWeeks} weeks of focused, adaptive training.
            </p>
          )}
        </motion.div>

        {/* Hero card — projected time + plan shape. */}
        {goal && summary && (
          <motion.section
            variants={itemVariants}
            className="mt-10 overflow-hidden rounded-3xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 via-sky-400/5 to-transparent p-6 shadow-sm backdrop-blur-md sm:p-10 dark:border-blue-400/20"
          >
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-5 sm:items-center">
              {/* Projected race time — the centerpiece. */}
              <div className="sm:col-span-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-700/80 dark:text-blue-200/80">
                  Projected {RACE_LABEL[goal.race_distance]}
                </p>
                <div className="mt-2 flex items-baseline gap-3">
                  <span className="text-5xl font-semibold tabular-nums tracking-tight text-neutral-900 sm:text-6xl dark:text-neutral-100">
                    {formatHMS(summary.projectedSec)}
                  </span>
                  <span className="text-sm text-neutral-500 dark:text-neutral-400">
                    on race day
                  </span>
                </div>
                <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
                  {summary.hasAnyPR
                    ? `Based on your current PRs and a typical ${goal.experience_level} block.`
                    : `Estimate based on your starting fitness. We'll refine it as you log runs.`}
                </p>
              </div>

              {/* Plan shape: 3 small stats stacked on the right. */}
              <div className="sm:col-span-2">
                <dl className="grid grid-cols-3 gap-3 sm:grid-cols-1 sm:gap-4">
                  <PlanStat label="Weeks" value={String(summary.totalWeeks)} />
                  <PlanStat
                    label="Peak week"
                    value={`${summary.peakMileage} mi`}
                  />
                  <PlanStat
                    label="Per week"
                    value={`${summary.sessionsPerWeek} runs`}
                  />
                </dl>
              </div>
            </div>
          </motion.section>
        )}

        {/* Sample workouts. */}
        {summary && summary.sampleWorkouts.length > 0 && (
          <motion.section variants={itemVariants} className="mt-10">
            <header className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
                A look at your peak week
              </h2>
              <span className="text-xs uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">
                Sample
              </span>
            </header>
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {summary.sampleWorkouts.map((w) => (
                <li
                  key={w.type + w.day}
                  className="flex items-center gap-4 rounded-2xl border border-black/10 bg-white/80 px-4 py-3.5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-neutral-900/70"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-200">
                    <WorkoutIcon type={w.type} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                        {WORKOUT_LABEL[w.type]}
                      </p>
                      <p className="shrink-0 text-sm tabular-nums text-neutral-700 dark:text-neutral-300">
                        {formatDistance(w.distance)}
                      </p>
                    </div>
                    <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                      {formatPace(w.pace)} · {formatDuration(w.duration)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </motion.section>
        )}

        {/* Recovery-aware adaptation explanation. */}
        <motion.section variants={itemVariants} className="mt-10">
          <header>
            <h2 className="text-base font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
              Built to adapt
            </h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              This isn&apos;t a static spreadsheet. Each morning, Kinetic
              re-tunes the week ahead based on what&apos;s actually happening
              in your life and body.
            </p>
          </header>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <AdaptCard
              icon={<RecoveryIcon />}
              title="Recovery-aware"
              body="Off-night of sleep or elevated fatigue? We pull back intensity automatically — no guilt, no missed-workout spiral."
            />
            <AdaptCard
              icon={<CalendarIcon />}
              title="Schedule-aware"
              body="When your calendar gets packed, workouts shift to fit your real day, not the other way around."
            />
            <AdaptCard
              icon={<TrendIcon />}
              title="Progress-aware"
              body="Hitting paces with room to spare? The plan steps up. Struggling? We hold so the next breakthrough sticks."
            />
          </div>
        </motion.section>

        {/* CTA. */}
        <motion.div
          variants={itemVariants}
          className="mt-12 flex flex-col-reverse items-center justify-center gap-3 sm:flex-row sm:justify-between"
        >
          <Link
            href="/onboarding/integrations"
            className={`text-sm text-neutral-500 underline-offset-4 hover:text-neutral-800 hover:underline dark:text-neutral-400 dark:hover:text-neutral-200 ${tokens.motion}`}
          >
            Back
          </Link>
          <motion.button
            type="button"
            onClick={handleStart}
            disabled={!goal || isExiting}
            whileHover={{ y: -1 }}
            whileTap={{ y: 0, scale: 0.97 }}
            transition={{ duration: 0.18, ease: PREMIUM_EASE }}
            className={`inline-flex items-center justify-center gap-2 rounded-full px-8 py-3.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${tokens.primary.solid}`}
          >
            Start training
            <ArrowRight />
          </motion.button>
        </motion.div>
      </motion.div>
    </main>
  );
}

// --- Subcomponents ---------------------------------------------------------

function PlanStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-black/5 bg-white/60 px-3 py-2.5 backdrop-blur-md dark:border-white/10 dark:bg-neutral-900/50">
      <dt className="text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-neutral-100">
        {value}
      </dd>
    </div>
  );
}

function AdaptCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-black/10 bg-white/80 p-5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-neutral-900/70">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-200">
        {icon}
      </div>
      <p className="mt-1 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
        {title}
      </p>
      <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
        {body}
      </p>
    </div>
  );
}

// --- Icons -----------------------------------------------------------------

function SparkleIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6L12 3z"
        fill="currentColor"
      />
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12h14M13 5l7 7-7 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WorkoutIcon({ type }: { type: WorkoutType }) {
  const stroke = "currentColor";
  switch (type) {
    case "long run":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M3 12c4-7 14-7 18 0M7 12v5M11 12v8M15 12v5M19 12v3"
            stroke={stroke}
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      );
    case "tempo":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M5 19l4-8 3 4 3-7 4 11"
            stroke={stroke}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "intervals":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M4 6h4v12H4zM10 9h4v9h-4zM16 4h4v14h-4z"
            stroke={stroke}
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "easy":
    default:
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M4 14c2-3 6-3 8 0s6 3 8 0"
            stroke={stroke}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

function RecoveryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 12h4l2-5 4 10 2-5h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3"
        y="5"
        width="18"
        height="16"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M3 10h18M8 3v4M16 3v4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TrendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 17l6-6 4 4 8-9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 6h7v7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// --- Helpers ---------------------------------------------------------------

/** Format integer seconds as "M:SS" or "H:MM:SS". */
function formatHMS(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s
      .toString()
      .padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Display distance with one decimal only when non-integer. */
function formatDistance(miles: number): string {
  return Number.isInteger(miles)
    ? `${miles} mi`
    : `${miles.toFixed(1)} mi`;
}

/** Format duration in minutes as "Xmin" or "Xh YYmin". */
function formatDuration(min: number): string {
  const total = Math.max(0, Math.round(min));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

/** "September 1, 2026" — undefined-safe. */
function formatLongDate(iso: string | undefined | null): string {
  if (!iso) return "your race day";
  // Parse as local date to avoid the off-by-one timezone shift you get
  // from `new Date("2026-09-01")` (which is UTC midnight).
  const [y, m, d] = iso.split("-").map((p) => Number.parseInt(p, 10));
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function hasAnyPR(goal: Goal): boolean {
  const prs = goal.current_prs ?? {};
  return (["5k", "10k", "half", "marathon"] as const).some(
    (k) => typeof prs[k] === "number" && (prs[k] as number) > 0
  );
}

/**
 * Pick the highest-volume non-recovery, non-race build week. Falls back
 * to the second week of the plan if every build week is a recovery week
 * (extremely short plans). Never returns the race week.
 */
function pickPeakWeek(plan: PlanWeek[]): PlanWeek | null {
  if (plan.length === 0) return null;
  const candidates = plan.filter((w) => w.phase === "build");
  const pool = candidates.length > 0 ? candidates : plan.filter((w) => w.phase !== "race");
  if (pool.length === 0) return plan[0] ?? null;
  let best = pool[0];
  let bestVolume = totalMiles(best);
  for (const w of pool) {
    const v = totalMiles(w);
    if (v > bestVolume) {
      best = w;
      bestVolume = v;
    }
  }
  return best;
}

function totalMiles(week: PlanWeek): number {
  return week.workouts.reduce((s, w) => s + w.distance, 0);
}

/**
 * From the peak week, pick at most one workout per type in the order
 * defined by `WORKOUT_DISPLAY_ORDER`. Capped at 4 cards. If the user's
 * plan only has 3 workout types (beginner template), returns 3.
 */
function pickSampleWorkouts(week: PlanWeek | null): Workout[] {
  if (!week) return [];
  const byType = new Map<WorkoutType, Workout>();
  for (const w of week.workouts) {
    if (!byType.has(w.type)) byType.set(w.type, w);
  }
  const out: Workout[] = [];
  for (const t of WORKOUT_DISPLAY_ORDER) {
    const w = byType.get(t);
    if (w) out.push(w);
    if (out.length >= 4) break;
  }
  return out;
}
