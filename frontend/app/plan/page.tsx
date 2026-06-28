"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  formatPace,
  applyPreferredDays,
  generateTrainingPlan,
  type PlanWeek,
  type WeekPhase,
  type WorkoutType,
} from "@/lib/planGenerator";
import { projectRaceTime } from "@/lib/paceCalculator";
import { startOfWeek } from "@/lib/scheduling";
import {
  getGoal,
  getSavedPlan,
  goalSignature,
  planSignature,
  type SavedPlan,
} from "@/lib/storage";
import { getUserProfile } from "@/lib/profileStorage";
import type { Goal, RaceDistance, UserProfile } from "@/lib/types";
import PageContainer from "@/components/PageContainer";
import GlassCard from "@/components/GlassCard";
import AthleticImage from "@/components/AthleticImage";
import HighlightRail, {
  type HighlightRailItem,
} from "@/components/HighlightRail";
import RevealSection from "@/components/RevealSection";
import AnimatedNumber from "@/components/AnimatedNumber";
import { tokens } from "@/lib/tokens";
import {
  buildMidPlanProgress,
  getWorkoutLog,
  type MidPlanProgress,
  type WorkoutLogEntry,
} from "@/lib/workoutLog";
import {
  buildWeeklyRecalibrationTrace,
  hasRecalibrationChanges,
  type WeeklyRecalibrationTrace,
} from "@/lib/weeklyRecalibrationTrace";
import {
  fetchWeeklyReasoning,
  type WeeklyReasoningResponse,
} from "@/lib/api";
import { trackProductEvent } from "@/lib/instrumentation";
import WhatIfPanel from "@/components/WhatIfPanel";

// Until we track a real plan start date, week 1 is "this week".
const CURRENT_WEEK = 1;

export default function PlanPage() {
  const [goal, setGoal] = useState<Goal | null>(null);
  const [savedPlan, setSavedPlan] = useState<SavedPlan | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [workoutLog, setWorkoutLog] = useState<WorkoutLogEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const g = getGoal();
    const sp = getSavedPlan();
    const p = getUserProfile();
    setGoal(g);
    setSavedPlan(sp);
    setProfile(p);
    // Always load the log against the current goal sig — `getWorkoutLog`
    // already returns [] when the on-disk log was saved for a different
    // goal, so we don't need the saved-plan match here.
    if (g) {
      setWorkoutLog(getWorkoutLog(goalSignature(g)));
    }
    setHydrated(true);
  }, []);

  // Use the saved calendar-aware plan when available and matched to the
  // current plan inputs (goal + profile preferences); otherwise fall
  // back to the deterministic base. The dashboard regenerates the saved
  // plan whenever it loads, so this fallback is mostly a first-render or
  // storage-cleared safety net.
  const { plan, isCalendarAware } = useMemo(() => {
    if (!goal) return { plan: [] as PlanWeek[], isCalendarAware: false };
    if (savedPlan && savedPlan.goalSig === planSignature(goal, profile)) {
      return { plan: savedPlan.weeks, isCalendarAware: true };
    }
    const base = applyPreferredDays(
      generateTrainingPlan(goal),
      profile?.preferred_training_days,
    );
    return { plan: base, isCalendarAware: false };
  }, [goal, savedPlan, profile]);

  // Wait for client hydration before deciding empty vs filled state, so SSR
  // and the first client render agree.
  if (!hydrated) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-12">
        <p className="text-sm text-neutral-500">Loading…</p>
      </main>
    );
  }

  if (!goal) {
    return <EmptyState />;
  }

  return (
    <PageContainer className="mx-auto w-full max-w-3xl px-2 py-12 sm:py-16">
      <RevealSection as="header" className="mb-8" y={18}>
        <AthleticImage
          src="/images/athletic/runner-sunset.jpg"
          alt="Runner climbing a mountain trail above the clouds"
          eyebrow="Your training block"
          title="The Plan"
          headingLevel="h1"
          subtitle={planSummary(goal, plan)}
          className="h-56 sm:h-64"
          priority
        />
      </RevealSection>

      <RevealSection className="mb-8" delay={0.02}>
        <PlanHighlightRail
          goal={goal}
          plan={plan}
          savedPlan={savedPlan}
        />
      </RevealSection>

      <RevealSection delay={0.03}>
        <ProjectedRaceCard goal={goal} />
      </RevealSection>

      {/* Plan-level training progression — a calm, scannable read on how */}
      {/* the block builds toward race day. Sits above the per-week list */}
      {/* so the runner gets the meta-view before drilling into details. */}
      <RevealSection delay={0.03}>
        <ProgressionInsightsCard plan={plan} />
      </RevealSection>

      {/* Mid-plan progress — where the runner is *inside* this block. */}
      {/* Renders for any plan length ≥ 2; uses the saved plan's start */}
      {/* date when available, otherwise today's start-of-week so the */}
      {/* card still appears for fallback (deterministic) plans. */}
      {goal && plan.length >= 2 ? (
        <RevealSection delay={0.03}>
          <MidPlanProgressCard
            goal={goal}
            plan={plan}
            planStart={savedPlan?.planStart ?? startOfWeek().toISOString()}
            log={workoutLog}
          />
        </RevealSection>
      ) : null}

      {/* Premium read on this week's adaptation. Renders a deterministic */}
      {/* "currently aligned" message when there are no week-1 changes,  */}
      {/* otherwise calls /weekly-reasoning for the LLM-generated story. */}
      {goal ? (
        <RevealSection delay={0.03}>
          <ThisWeeksAdaptationCard
            goal={goal}
            profile={profile}
            savedPlan={savedPlan}
          />
        </RevealSection>
      ) : null}

      {plan[0] ? (
        <RevealSection delay={0.03}>
          <WhatIfPanel week={plan[0]} />
        </RevealSection>
      ) : null}

      {isCalendarAware && savedPlan ? (
        <RevealSection delay={0.03}>
          <CalendarAwareBanner saved={savedPlan} />
        </RevealSection>
      ) : null}

      <ol className="space-y-4">
        {plan.map((week, i) => (
          <RevealSection as="li" key={week.weekNumber} delay={Math.min(i * 0.04, 0.2)}>
            <WeekCard
              week={week}
              isCurrent={week.weekNumber === CURRENT_WEEK}
            />
          </RevealSection>
        ))}
      </ol>
    </PageContainer>
  );
}

// --- Components -------------------------------------------------------------

function PlanHighlightRail({
  goal,
  plan,
  savedPlan,
}: {
  goal: Goal;
  plan: PlanWeek[];
  savedPlan: SavedPlan | null;
}) {
  const items = useMemo<HighlightRailItem[]>(() => {
    const insights = buildProgressionInsights(plan);
    const changeCount = savedPlan?.reasoning.length ?? 0;
    const easyOnlyCount = savedPlan?.easyOnlyDays.length ?? 0;
    const adaptationDetail =
      changeCount > 0
        ? `${changeCount} calendar-aware change${
            changeCount === 1 ? "" : "s"
          }${easyOnlyCount > 0 ? `, ${easyOnlyCount} easy-only day${easyOnlyCount === 1 ? "" : "s"}` : ""}`
        : "No saved calendar changes in this block";

    return [
      {
        label: "Goal",
        value: RACE_LABEL[goal.race_distance],
        detail: `Race day ${formatTargetDate(goal.target_date)}`,
        tone: "blue",
      },
      {
        label: "Peak week",
        value: insights ? `${insights.peakMileage} mi` : "--",
        detail: insights
          ? `Highest volume in Week ${insights.peakMileageWeek}`
          : "Volume builds conservatively",
        tone: "neutral",
      },
      {
        label: "Long run",
        value: insights ? `${insights.longRunPeak} mi` : "--",
        detail: insights
          ? `${insights.longRunDelta > 0 ? `+${insights.longRunDelta} mi` : "Steady"} across the block`
          : "Long run protects the aerobic build",
        tone: "emerald",
      },
      {
        label: "Adaptation",
        value: changeCount > 0 ? String(changeCount) : "Aligned",
        detail: adaptationDetail,
        tone: changeCount > 0 ? "amber" : "blue",
      },
    ];
  }, [goal, plan, savedPlan]);

  return (
    <HighlightRail
      eyebrow="Get the highlights"
      title="The block at a glance"
      items={items}
    />
  );
}

/**
 * Plan-level progression insights. Three stat cells separated by hairline
 * dividers — peak weekly mileage (with a tiny inline sparkline), long-run
 * build, and average run-days per week (consistency rhythm). Returns null
 * for plans too short to summarise meaningfully.
 */
function ProgressionInsightsCard({ plan }: { plan: PlanWeek[] }) {
  const insights = useMemo(() => buildProgressionInsights(plan), [plan]);
  if (!insights) return null;

  return (
    <GlassCard interactive={false} className="mb-8 p-6">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
          Progression
        </p>
        <p className="text-[11px] text-neutral-500 dark:text-neutral-500">
          {insights.weeks} weeks
        </p>
      </div>

      <div className="mt-5 grid gap-6 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-neutral-200/70 sm:dark:divide-white/10">
        {/* Weekly mileage trend with sparkline. */}
        <div className="sm:pr-6">
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-neutral-500 dark:text-neutral-400">
            Peak mileage
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-neutral-50">
            {insights.peakMileage}
            <span className="ml-1 text-sm font-medium text-neutral-500 dark:text-neutral-400">
              mi/wk
            </span>
          </p>
          <div className="mt-3">
            <MileageSparkline
              series={insights.mileageSeries}
              peakIndex={insights.peakMileageWeekIndex}
            />
          </div>
          <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
            Week {insights.peakMileageWeek} of {insights.weeks}
          </p>
        </div>

        {/* Long-run progression — first → peak, with the build delta. */}
        <div className="sm:px-6">
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-neutral-500 dark:text-neutral-400">
            Long run build
          </p>
          <p className="mt-2 flex items-baseline gap-2 text-3xl font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-neutral-50">
            <span>{insights.longRunStart}</span>
            <span aria-hidden="true" className="text-neutral-300 dark:text-neutral-600">
              →
            </span>
            <span>
              {insights.longRunPeak}
              <span className="ml-1 text-sm font-medium text-neutral-500 dark:text-neutral-400">
                mi
              </span>
            </span>
          </p>
          <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
            {insights.longRunDelta > 0
              ? `+${insights.longRunDelta} mi over the block`
              : "Long run holds steady"}
          </p>
        </div>

        {/* Consistency — average running days per week. */}
        <div className="sm:pl-6">
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-neutral-500 dark:text-neutral-400">
            Run rhythm
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-neutral-50">
            {insights.runDaysPerWeek}
            <span className="ml-1 text-sm font-medium text-neutral-500 dark:text-neutral-400">
              days/wk
            </span>
          </p>
          <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
            {insights.consistencyLabel}
          </p>
        </div>
      </div>
    </GlassCard>
  );
}

/**
 * Tiny inline sparkline rendered as bars — reads training cycles
 * (build / cutback) more cleanly than a line, and stays legible at
 * very small sizes. The peak week gets a slightly stronger fill so
 * the eye lands on it without needing a separate label.
 */
function MileageSparkline({
  series,
  peakIndex,
}: {
  series: number[];
  peakIndex: number;
}) {
  if (series.length === 0) return null;
  const max = Math.max(...series, 1);
  // Width fits ~20 weeks comfortably; bars get narrower as the plan grows.
  const barWidth = 4;
  const gap = 2;
  const height = 28;
  const width = series.length * (barWidth + gap) - gap;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Weekly mileage trend"
      className="overflow-visible"
    >
      {series.map((value, i) => {
        const h = Math.max(2, Math.round((value / max) * height));
        const x = i * (barWidth + gap);
        const y = height - h;
        const isPeak = i === peakIndex;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={h}
            rx={1}
            className={
              isPeak
                ? "fill-blue-500 dark:fill-blue-400"
                : "fill-neutral-300 dark:fill-neutral-600"
            }
          />
        );
      })}
    </svg>
  );
}

/**
 * "Build so far" — surfaces where the runner is *inside* the plan:
 * how their weekly mileage and long run have climbed from week 1 to
 * the current week, plus consistency and adapter-saved sessions
 * derived from the persisted workout log.
 *
 * Hidden when there's no meaningful mid-plan story to tell yet (very
 * short plans, or `now` outside the plan window).
 */
function MidPlanProgressCard({
  goal,
  plan,
  planStart,
  log,
}: {
  goal: Goal;
  plan: PlanWeek[];
  planStart: string;
  log: WorkoutLogEntry[];
}) {
  const progress = useMemo<MidPlanProgress | null>(
    () => buildMidPlanProgress(goal, plan, planStart, log),
    [goal, plan, planStart, log],
  );
  if (!progress) return null;

  const isStartOfPlan = progress.weekIndex === 0;

  const mileageHelper =
    progress.mileageDelta > 0
      ? `+${progress.mileageDelta} mi from Week 1`
      : isStartOfPlan
        ? "Your starting point"
        : "Holding volume steady";
  const longRunHelper =
    progress.longRunDelta > 0
      ? `+${progress.longRunDelta} mi from Week 1`
      : isStartOfPlan
        ? "Build starts here"
        : "Holding long run steady";
  const consistencyHelper =
    progress.workoutsDue === 0
      ? "Sessions begin this week"
      : progress.workoutsCompleted === 0
        ? "Log a session to start tracking"
        : `${progress.workoutsCompleted} of ${progress.workoutsDue} sessions`;
  const savedHelper =
    progress.workoutsSaved === 0
      ? isStartOfPlan
        ? "Adapter ready to help"
        : "No adapted sessions yet"
      : progress.workoutsSaved === 1
        ? "Adapted session completed"
        : "Adapted sessions completed";

  return (
    <GlassCard interactive={false} className="mb-8 p-6">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
          Build so far
        </p>
        <p className="text-[11px] text-neutral-500 dark:text-neutral-500">
          Week {progress.weekNumber} of {progress.weeksTotal}
        </p>
      </div>

      <div
        className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0 lg:divide-x lg:divide-neutral-200/70 lg:dark:divide-white/10"
      >
        {/* Weekly mileage */}
        <div className="lg:px-6 lg:first:pl-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-neutral-500 dark:text-neutral-400">
            Weekly mileage
          </p>
          <p className="mt-2 flex items-baseline gap-2 text-3xl font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-neutral-50">
            {progress.mileageDelta > 0 ? (
              <>
                <span className="text-neutral-400 dark:text-neutral-500">
                  {progress.startWeekMileage}
                </span>
                <span
                  aria-hidden="true"
                  className="text-neutral-300 dark:text-neutral-600"
                >
                  →
                </span>
                <span>
                  {progress.currentWeekMileage}
                  <span className="ml-1 text-sm font-medium text-neutral-500 dark:text-neutral-400">
                    mi
                  </span>
                </span>
              </>
            ) : (
              <span>
                {progress.currentWeekMileage}
                <span className="ml-1 text-sm font-medium text-neutral-500 dark:text-neutral-400">
                  mi
                </span>
              </span>
            )}
          </p>
          <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
            {mileageHelper}
          </p>
        </div>

        {/* Long run */}
        <div className="lg:px-6">
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-neutral-500 dark:text-neutral-400">
            Long run
          </p>
          <p className="mt-2 flex items-baseline gap-2 text-3xl font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-neutral-50">
            {progress.longRunDelta > 0 ? (
              <>
                <span className="text-neutral-400 dark:text-neutral-500">
                  {progress.startLongRun}
                </span>
                <span
                  aria-hidden="true"
                  className="text-neutral-300 dark:text-neutral-600"
                >
                  →
                </span>
                <span>
                  {progress.currentLongRun}
                  <span className="ml-1 text-sm font-medium text-neutral-500 dark:text-neutral-400">
                    mi
                  </span>
                </span>
              </>
            ) : (
              <span>
                {progress.currentLongRun}
                <span className="ml-1 text-sm font-medium text-neutral-500 dark:text-neutral-400">
                  mi
                </span>
              </span>
            )}
          </p>
          <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
            {longRunHelper}
          </p>
        </div>

        {/* Consistency */}
        <div className="lg:px-6">
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-neutral-500 dark:text-neutral-400">
            Consistency
          </p>
          <p className="mt-2 flex items-baseline gap-1 text-3xl font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-neutral-50">
            <AnimatedNumber value={progress.consistencyPct} duration={1.0} />
            <span className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
              %
            </span>
          </p>
          <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
            {consistencyHelper}
          </p>
        </div>

        {/* Workouts saved by the adapter */}
        <div className="lg:px-6 lg:last:pr-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-neutral-500 dark:text-neutral-400">
            Workouts saved
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-neutral-50">
            <AnimatedNumber value={progress.workoutsSaved} duration={0.9} />
          </p>
          <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
            {savedHelper}
          </p>
        </div>
      </div>
    </GlassCard>
  );
}

function ProjectedRaceCard({ goal }: { goal: Goal }) {
  const projectedSeconds = projectRaceTime(
    goal.race_distance,
    goal.current_prs,
    goal.experience_level
  );
  const currentPR = goal.current_prs?.[goal.race_distance];
  const hasCurrentPR = typeof currentPR === "number" && currentPR > 0;
  const delta = hasCurrentPR ? currentPR - projectedSeconds : 0;

  return (
    <GlassCard
      interactive={false}
      className={`mb-8 overflow-hidden p-8 ${tokens.primary.heroGradient}`}
    >
      <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
        Projected finish
      </p>
      <div className="mt-2 flex items-baseline gap-3">
        <span className="text-4xl font-bold tabular-nums tracking-tight">
          {formatRaceTime(projectedSeconds)}
        </span>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          for {RACE_LABEL[goal.race_distance]}
        </span>
      </div>
      {hasCurrentPR && delta > 0 ? (
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
          Current PR{" "}
          <span className="tabular-nums text-neutral-500">
            {formatRaceTime(currentPR)}
          </span>{" "}
          ·{" "}
          <span className={`font-medium ${tokens.success.text}`}>
            −{formatRaceTime(delta)}
          </span>{" "}
          improvement
        </p>
      ) : (
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
          Based on your current fitness and a full training block.
        </p>
      )}
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// ThisWeeksAdaptationCard
// ---------------------------------------------------------------------------
//
// Premium read on how the plan moved this week. Builds a local trace by
// diffing the deterministic base week against `savedPlan.weeks[0]`,
// short-circuits to a calm "aligned" message when nothing changed, and
// otherwise hits `POST /weekly-reasoning` for an LLM-written summary
// (changes, preserved workouts, tradeoff, confidence note).
//
// We render across four states:
//
//   - Hydrating: no goal yet → nothing rendered (parent gate)
//   - No changes: success-toned single line, the exact spec copy
//   - Loading: subdued skeleton with the eyebrow preserved
//   - Loaded: the five-field premium card
//   - Error: silent fallback to the no-changes copy so the page is never
//     visually broken if the backend is offline. The detail-level
//     `CalendarAwareBanner` below still surfaces the raw bullets in that
//     case, so no information is lost.
//
function ThisWeeksAdaptationCard({
  goal,
  profile,
  savedPlan,
}: {
  goal: Goal;
  profile: UserProfile | null;
  savedPlan: SavedPlan | null;
}) {
  const trace = useMemo<WeeklyRecalibrationTrace | null>(() => {
    if (!savedPlan) return null;
    if (savedPlan.goalSig !== planSignature(goal, profile)) return null;
    const adjustedWeek = savedPlan.weeks[0];
    if (!adjustedWeek) return null;
    const baseWeeks = applyPreferredDays(
      generateTrainingPlan(goal),
      profile?.preferred_training_days,
    );
    const originalWeek = baseWeeks[0];
    if (!originalWeek) return null;
    return buildWeeklyRecalibrationTrace({
      originalWeek,
      adjustedWeek,
      reasoning: savedPlan.reasoning ?? [],
      easyOnlyDays: (savedPlan.easyOnlyDays ?? []).filter(
        (e) => e.weekIndex === 0,
      ),
    });
  }, [goal, profile, savedPlan]);

  const aligned = !trace || !hasRecalibrationChanges(trace);

  const [reasoning, setReasoning] = useState<WeeklyReasoningResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // Refetch whenever the trace meaningfully changes. We key off a stable
  // JSON serialisation so React doesn't refire for identity-only changes
  // (the memo above already protects us, but this keeps the effect
  // honest if upstream ever drops memoisation).
  const traceKey = useMemo(
    () => (trace && !aligned ? JSON.stringify(trace) : null),
    [trace, aligned],
  );

  useEffect(() => {
    if (!traceKey || !trace) return;
    let cancelled = false;
    const startedAt = performance.now();
    setLoading(true);
    setFailed(false);
    fetchWeeklyReasoning(trace)
      .then((res) => {
        if (!cancelled) {
          setReasoning(res);
          trackProductEvent("ai_reasoning_completed", {
            surface: "plan_weekly",
            outcome: "success",
            ui_fallback_used: false,
            latency_ms: Math.round(performance.now() - startedAt),
            modified_workout_count: trace.modified_workouts.length,
            dropped_workout_count: trace.dropped_workouts.length,
            preserved_workout_count: trace.preserved_workouts.length,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          trackProductEvent("ai_reasoning_completed", {
            surface: "plan_weekly",
            outcome: "client_fallback",
            ui_fallback_used: true,
            latency_ms: Math.round(performance.now() - startedAt),
            modified_workout_count: trace.modified_workouts.length,
            dropped_workout_count: trace.dropped_workouts.length,
            preserved_workout_count: trace.preserved_workouts.length,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [traceKey, trace]);

  // No recalibration this week → calm, premium one-liner.
  if (aligned) {
    return (
      <GlassCard interactive={false} className="mb-8 p-6">
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-neutral-500">
          This week&apos;s adaptation
        </p>
        <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
          Your plan is currently aligned with your schedule.
        </p>
      </GlassCard>
    );
  }

  // Loading the LLM read — keep the eyebrow stable so the layout
  // doesn't jitter when the response lands.
  if (loading || (!reasoning && !failed)) {
    return (
      <GlassCard interactive={false} className="mb-8 p-6">
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-neutral-500">
          This week&apos;s adaptation
        </p>
        <div className="mt-4 space-y-2.5" aria-busy="true">
          <div className="h-3 w-3/4 animate-pulse rounded bg-neutral-200/70 dark:bg-neutral-800/70" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-neutral-200/70 dark:bg-neutral-800/70" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-neutral-200/70 dark:bg-neutral-800/70" />
        </div>
        <p className="mt-4 text-xs text-neutral-500">
          Reading this week…
        </p>
      </GlassCard>
    );
  }

  // Backend unreachable → fall back to the spec copy. The detail-level
  // CalendarAwareBanner still renders below.
  if (failed || !reasoning) {
    return (
      <GlassCard interactive={false} className="mb-8 p-6">
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-neutral-500">
          This week&apos;s adaptation
        </p>
        <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
          Your plan is currently aligned with your schedule.
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard interactive={false} className="mb-8 p-6">
      <header className="flex items-center gap-2">
        <span
          className={`h-1.5 w-1.5 rounded-full ${tokens.primary.dot}`}
          aria-hidden
        />
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-neutral-500">
          This week&apos;s adaptation
        </p>
      </header>

      <p className="mt-3 text-[15px] leading-relaxed text-neutral-900 dark:text-neutral-100">
        {reasoning.summary}
      </p>

      {reasoning.changes.length > 0 ? (
        <ul className="mt-5 space-y-3">
          {reasoning.changes.map((c, i) => (
            <li key={i} className="flex gap-3">
              <span
                className={`mt-2 h-1 w-1 shrink-0 rounded-full ${tokens.primary.dot}`}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {c.title}
                </p>
                <p className="mt-0.5 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                  {c.explanation}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {reasoning.preserved.length > 0 ? (
        <div className="mt-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-500">
            Preserved
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {reasoning.preserved.map((p, i) => (
              <span
                key={i}
                className={`rounded-full border px-2.5 py-1 text-xs ${tokens.success.soft}`}
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {reasoning.tradeoff ? (
        <p className="mt-5 border-t border-black/5 pt-4 text-sm italic text-gray-600 dark:border-white/10 dark:text-gray-400">
          {reasoning.tradeoff}
        </p>
      ) : null}

      {reasoning.confidence_note ? (
        <p className="mt-3 text-xs text-neutral-500">
          {reasoning.confidence_note}
        </p>
      ) : null}
    </GlassCard>
  );
}

function CalendarAwareBanner({ saved }: { saved: SavedPlan }) {
  if (saved.reasoning.length === 0 && saved.easyOnlyDays.length === 0) {
    // Plan is calendar-aware but no adjustments were needed.
    return (
      <div className={`mb-6 rounded-xl border px-4 py-3 text-xs ${tokens.success.soft}`}>
        <span className="font-medium">Calendar-aware · </span>
        Your plan fits cleanly into your calendar — no adjustments needed.
      </div>
    );
  }

  return (
    <details className={`mb-6 rounded-xl border px-4 py-3 text-sm ${tokens.warning.soft}`}>
      <summary className={`cursor-pointer text-xs font-medium uppercase tracking-wider ${tokens.warning.text}`}>
        Calendar-aware adjustments · {saved.reasoning.length}{" "}
        change{saved.reasoning.length === 1 ? "" : "s"}
        {saved.easyOnlyDays.length > 0
          ? ` · ${saved.easyOnlyDays.length} travel day${
              saved.easyOnlyDays.length === 1 ? "" : "s"
            }`
          : ""}
      </summary>
      <ul className="mt-3 space-y-1.5 text-xs leading-relaxed">
        {saved.reasoning.map((line, i) => (
          <li key={i} className="flex gap-2">
            <span className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${tokens.warning.dot}`} />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function EmptyState() {
  return (
    <PageContainer className="mx-auto w-full max-w-3xl px-2 py-12 sm:py-16">
      <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Kinetic</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Plan</h1>

      <div className="mt-8 rounded-xl border border-dashed border-black/10 bg-white p-8 text-center dark:border-white/10 dark:bg-neutral-900">
        <h2 className="text-xl font-medium tracking-tight">Please set a goal</h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Tell Kinetic what you&apos;re training toward and we&apos;ll build a plan for you.
        </p>
        <Link
          href="/settings"
          className={`mt-5 inline-flex items-center rounded-md px-4 py-2 text-sm font-medium ${tokens.primary.solid}`}
        >
          Set training goal
        </Link>
      </div>
    </PageContainer>
  );
}

function WeekCard({ week, isCurrent }: { week: PlanWeek; isCurrent: boolean }) {
  const totalMiles = week.workouts.reduce((sum, w) => sum + w.distance, 0);

  return (
    <GlassCard
        className={[
          "p-5",
          isCurrent ? "ring-1 ring-black/10 dark:ring-white/15" : "",
        ].join(" ")}
      >
        <header className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold tracking-tight">
              Week {week.weekNumber}
            </h2>
            {isCurrent && (
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${tokens.primary.softActive}`}>
                Current
              </span>
            )}
            <PhaseBadge phase={week.phase} />
          </div>
          <span className="text-xs text-neutral-500">
            {week.workouts.length} workouts · {totalMiles.toFixed(1)} mi
          </span>
        </header>

        <ul className="divide-y divide-black/5 dark:divide-white/10">
          {week.workouts.map((w, i) => (
            <li
              key={`${week.weekNumber}-${i}`}
              className="flex items-center justify-between py-2.5 text-sm"
            >
              <div className="flex items-center gap-3">
                <span className="w-10 text-xs font-medium uppercase tracking-wider text-neutral-500">
                  {w.day}
                </span>
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-medium ${typeStyle(
                    w.type
                  )}`}
                >
                  {w.type}
                </span>
              </div>
              <div className="flex items-baseline gap-3 tabular-nums">
                <span className="font-medium text-neutral-800 dark:text-neutral-200">
                  {w.distance.toFixed(1)} mi
                </span>
                <span className="text-[11px] font-normal text-neutral-400 dark:text-neutral-500">
                  {formatPace(w.pace)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </GlassCard>
  );
}

// --- Helpers ----------------------------------------------------------------

function PhaseBadge({ phase }: { phase: WeekPhase }) {
  if (phase === "build") return null;
  const config: Record<Exclude<WeekPhase, "build">, { label: string; cls: string }> = {
    recovery: {
      label: "↓ Recovery",
      cls: tokens.primary.soft,
    },
    taper: {
      label: "Taper",
      cls: tokens.warning.soft,
    },
    race: {
      label: "🏁 Race week",
      cls: tokens.primary.softActive,
    },
  };
  const { label, cls } = config[phase];
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${cls}`}
    >
      {label}
    </span>
  );
}

function typeStyle(type: WorkoutType): string {
  switch (type) {
    case "easy":
      return tokens.success.soft;
    case "tempo":
      return tokens.warning.soft;
    case "intervals":
      return tokens.warning.soft;
    case "long run":
      return tokens.primary.soft;
    case "race":
      return tokens.primary.solid;
  }
}

const RACE_LABEL: Record<RaceDistance, string> = {
  "5k": "5K",
  "10k": "10K",
  half: "Half marathon",
  marathon: "Marathon",
};

function planSummary(goal: Goal, plan: PlanWeek[]): string {
  const weeks = plan.length;
  const totalMiles = plan.reduce(
    (sum, w) => sum + w.workouts.reduce((s, x) => s + x.distance, 0),
    0
  );
  const label = RACE_LABEL[goal.race_distance] ?? "Race";
  return `${label} · ${weeks}-week plan · ${totalMiles.toFixed(0)} mi total`;
}

function formatTargetDate(value: string): string {
  if (!value) return "not set";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// --- Progression insights ---------------------------------------------------

type ProgressionInsights = {
  weeks: number;
  // Weekly mileage series + the peak (rounded) and which week it lands on.
  mileageSeries: number[];
  peakMileage: number;
  peakMileageWeek: number;
  peakMileageWeekIndex: number;
  // Long-run progression: first non-trivial long run distance and the
  // peak across the block, plus the build delta in miles.
  longRunStart: number;
  longRunPeak: number;
  longRunDelta: number;
  // Average running days per week + a one-line consistency descriptor.
  runDaysPerWeek: number;
  consistencyLabel: string;
};

/**
 * Distil a plan into the three numbers we surface on the Plan page:
 *  • Peak weekly mileage (with the underlying weekly series)
 *  • Long-run progression (start → peak)
 *  • Average running days / week + a consistency descriptor
 *
 * Returns null for plans too short to summarise meaningfully (< 2 weeks).
 */
function buildProgressionInsights(plan: PlanWeek[]): ProgressionInsights | null {
  if (plan.length < 2) return null;

  // Weekly mileage — sum of all run distances per week. Any workout with
  // positive distance counts (easy / tempo / intervals / long / race).
  const mileageSeries = plan.map(
    (week) =>
      Math.round(week.workouts.reduce((sum, w) => sum + w.distance, 0) * 10) /
      10,
  );
  const peakMileage = Math.max(...mileageSeries);
  const peakMileageWeekIndex = mileageSeries.indexOf(peakMileage);
  const peakMileageWeek = plan[peakMileageWeekIndex]?.weekNumber ?? 1;

  // Long-run progression — the longest *long-run* per week. Race day is
  // intentionally excluded: the build narrative is about how the long run
  // grew through training, not the goal race itself, which would otherwise
  // dominate the peak (e.g. "13 → 26 mi" for a marathon block).
  const longestPerWeek = plan.map((week) =>
    Math.max(
      0,
      ...week.workouts
        .filter((w) => w.type === "long run")
        .map((w) => w.distance),
    ),
  );
  // Fall back to the longest non-race workout when no "long run" exists
  // (e.g. very short plans dominated by easy days).
  const longRunPeakRaw = Math.max(
    0,
    ...longestPerWeek,
    ...plan.flatMap((w) =>
      w.workouts.filter((x) => x.type !== "race").map((x) => x.distance),
    ),
  );
  const firstNonZero = longestPerWeek.find((m) => m > 0) ?? longRunPeakRaw;
  const longRunStart = Math.round(firstNonZero);
  const longRunPeak = Math.round(longRunPeakRaw);
  const longRunDelta = Math.max(0, longRunPeak - longRunStart);

  // Run rhythm — average running days per week (any workout with positive
  // distance counts as a running day). Cross-train / rest days are
  // excluded from the count, matching how runners think about "run days".
  const totalRunDays = plan.reduce(
    (sum, week) => sum + week.workouts.filter((w) => w.distance > 0).length,
    0,
  );
  const avg = totalRunDays / plan.length;
  const runDaysPerWeek = Math.round(avg * 10) / 10;
  const consistencyLabel =
    avg >= 5
      ? "Steady, high-volume rhythm"
      : avg >= 4
        ? "Consistent weekly rhythm"
        : avg >= 3
          ? "Balanced run / recovery rhythm"
          : "Light, recovery-led rhythm";

  return {
    weeks: plan.length,
    mileageSeries,
    peakMileage: Math.round(peakMileage),
    peakMileageWeek,
    peakMileageWeekIndex,
    longRunStart,
    longRunPeak,
    longRunDelta,
    runDaysPerWeek,
    consistencyLabel,
  };
}

/** Format a duration in seconds as "H:MM:SS" or "M:SS" depending on length. */
function formatRaceTime(seconds: number): string {
  const totalSec = Math.max(0, Math.round(seconds));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

