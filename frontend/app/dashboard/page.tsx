"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";

import { auth } from "@/lib/firebase";
import { API_BASE, apiFetch } from "@/lib/api";
import { formatPace } from "@/lib/paceCalculator";
import {
  applyPreferredDays,
  generateTrainingPlan,
  type PlanWeek,
  type Workout,
  type WorkoutType,
} from "@/lib/planGenerator";
import GlassCard from "@/components/GlassCard";
import PageContainer from "@/components/PageContainer";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { tokens } from "@/lib/tokens";
import {
  bucketDaysByWeek,
  buildCalendarAwarePlan,
  weeksDiffer,
  type CalendarAwarePlan,
  type WeekChange,
} from "@/lib/planService";
import type { DayAvailability, TravelEvent } from "@/lib/planRefresh";
import { getUserProfile } from "@/lib/profileStorage";
import {
  checkReason,
  dueChecks,
  markRanAt,
  startOfWeek,
  type ScheduleCheck,
} from "@/lib/scheduling";
import { scenarios, type Scenario, type Biometrics } from "@/lib/scenarios";
import {
  getReadinessBaselines,
  getTodayReadiness,
  type ManualReadiness,
  type ReadinessBaselines,
} from "@/lib/readinessStorage";
import {
  classifyRecoveryState,
  computeRecoveryScore01,
  recoveryStateTone,
} from "@/lib/recoveryScore";
import {
  computeDataFreshness,
  recordCalendarSync,
} from "@/lib/dataFreshness";
import {
  getGoal,
  getSavedPlan,
  goalSignature,
  planSignature,
  savePlan,
  type SavedPlan,
} from "@/lib/storage";
import {
  getTodaysWorkout,
  type TodaysWorkout,
  type WorkoutSegment,
} from "@/lib/todaysWorkout";
import {
  findTodayLogEntry,
  getAdjustmentBiasTowardOriginal,
  getWorkoutLog,
  logTodayFromPlan,
} from "@/lib/workoutLog";
import {
  clearTodayCompletion,
  getTodayCompletion,
  setTodayCompletion,
} from "@/lib/todayCompletion";
import type { Goal, RaceDistance, UserProfile } from "@/lib/types";
import AnimatedNumber from "@/components/AnimatedNumber";
import ProgressRing from "@/components/ProgressRing";
import StrideWave from "@/components/StrideWave";

// --- Motion ----------------------------------------------------------------

// Same out-quart easing used across onboarding and the rest of the app
// so motion reads as one coherent system.
const PREMIUM_EASE = [0.22, 1, 0.36, 1] as const;

// Top-level stagger for the dashboard's vertical sections — slightly
// quicker than onboarding because there are more sections and we don't
// want the cascade to feel slow.
const containerVariants: Variants = {
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.05 },
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

// --- Types matching the backend DecisionOutput ------------------------------

type CandidateAction = {
  name: string;
  description: string;
  intensity_modifier: number;
  duration_modifier: number;
};

type DecisionOutput = {
  state: string;
  recovery_score: number;
  selected_action: CandidateAction;
  final_workout: string;
  confidence: number;
  available_minutes: number;
  key_factors: string[];
  alternatives: CandidateAction[];
  scores: Record<string, number>;
  decision_trace: string[];
  // Short, user-facing strings describing any data sources the engine
  // judged stale for this decision (e.g. "Calendar data last synced
  // 3 days ago"). Empty list when everything is current. Optional so
  // older backends without this field still parse cleanly.
  staleness_warnings?: string[];
};

function toRequestBody(
  s: Scenario,
  readiness?: ManualReadiness | null,
  biasTowardOriginal: number = 0,
) {
  return {
    biometrics: applyManualReadiness(s.biometrics, readiness),
    training_context: s.training_context,
    constraints: s.constraints,
    // Snapshot how recent each input source is so the backend can
    // apply a confidence penalty + emit matching warnings. Computed
    // on the client because that's where the data actually lives
    // (manual readiness in localStorage; calendar-sync timestamp set
    // by this very page after a successful availability fetch).
    data_freshness: computeDataFreshness(),
    // Personalization: tendency to reject engine adjustments. The
    // backend uses this to soften the "modify" candidate and lightly
    // favour "proceed" so frequent rejecters get recommendations that
    // sit closer to their original plan. 0 means "no preference signal
    // yet" — the engine then runs unmodified.
    bias_toward_original: biasTowardOriginal,
  };
}

/**
 * Layer the user's manually-entered readiness on top of a scenario's
 * baseline biometrics. We only override individual fields that the user
 * actually filled in — anything unset falls back to the scenario value.
 *
 * This is the "prioritize manual input when biometric data unavailable"
 * fallback path: until Apple Health / Oura / Garmin / Google Fit are
 * wired up, manual entry IS the biometric source. Self-reports
 * (fatigue / soreness) are forwarded directly so the backend's state
 * estimator can factor them into the recovery score.
 */
function applyManualReadiness(
  base: Biometrics,
  readiness: ManualReadiness | null | undefined,
): Biometrics {
  if (!readiness) return base;
  return {
    hrv: readiness.hrv ?? base.hrv,
    hrv_baseline: base.hrv_baseline,
    sleep_hours: readiness.sleep_hours ?? base.sleep_hours,
    resting_hr: readiness.resting_hr ?? base.resting_hr,
    fatigue_level: readiness.fatigue_level ?? base.fatigue_level,
    soreness_level: readiness.soreness_level ?? base.soreness_level,
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [decision, setDecision] = useState<DecisionOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [responseStatus, setResponseStatus] = useState<"pending" | "accepted" | "rejected">("pending");
  // Did the runner actually complete (or skip) the workout they chose?
  // This is persisted to the workout log; `responseStatus` only governs
  // *which* workout (engine-adjusted vs. original plan) is being marked.
  const [completionStatus, setCompletionStatus] = useState<
    "pending" | "completed" | "skipped"
  >("pending");
  const [goal, setGoal] = useState<Goal | null>(null);
  const [savedPlan, setSavedPlan] = useState<SavedPlan | null>(null);
  // Pending suggestion produced by the latest calendar refresh. Only set
  // when the saved plan's week 0 differs from the fresh computation.
  const [pending, setPending] = useState<{
    proposed: CalendarAwarePlan;
    weekChange: WeekChange;
  } | null>(null);
  // Banner shown once after initial calendar-aware generation.
  const [showInitialBanner, setShowInitialBanner] = useState(false);
  const [suggestionStatus, setSuggestionStatus] =
    useState<"pending" | "accepted" | "rejected">("pending");
  const [scheduleChecks, setScheduleChecks] = useState<ScheduleCheck[]>([]);
  // User profile is loaded from local storage so we can greet by name and
  // show personalized chrome without an extra round-trip.
  const [profile, setProfile] = useState<UserProfile | null>(null);
  // Today's manually-entered readiness (sleep / HRV / RHR / fatigue /
  // soreness). Until biometric integrations land, this is the only real
  // signal source — when present it overrides the demo-scenario
  // biometrics on the `/decision` request below.
  const [todayReadiness, setTodayReadiness] = useState<ManualReadiness | null>(null);
  // Rolling 30-day average of each manually-entered metric — the
  // "baseline" the Recovery insights compare today's reading against.
  // Recomputed alongside `todayReadiness` so saving a new entry on
  // /recovery instantly updates the dashboard's deltas.
  const [readinessBaselines, setReadinessBaselines] = useState<ReadinessBaselines>(
    {},
  );
  // The dashboard no longer exposes a scenario picker. We keep a single
  // baseline scenario as the source of `training_context` and
  // `constraints` for the `/decision` request — the user's manual
  // readiness overrides its biometrics on every call.
  const activeScenario = scenarios[0];

  // Pull the saved goal + saved plan once on mount so we can derive today's
  // structured workout from the user's accepted (calendar-aware) plan.
  useEffect(() => {
    const g = getGoal();
    const p = getSavedPlan();
    setGoal(g);
    setSavedPlan(p);
    setProfile(getUserProfile());
    setTodayReadiness(getTodayReadiness());
    setReadinessBaselines(getReadinessBaselines());
    // Note which scheduled checks are due so we can surface them.
    setScheduleChecks(dueChecks());

    // Hydrate today's response + completion state. We persist this in
    // two places so each can cover the other's blind spot:
    //   1. `getTodayCompletion()` — date-keyed, survives plan changes
    //      and works even on rest days when no plan slot exists.
    //   2. `findTodayLogEntry()` — plan-slot keyed, covers the case
    //      where the runner logged a workout under an older deploy
    //      that only wrote to the workout log.
    // The date-keyed store wins when both exist because it's the source
    // of truth for "what did you click on the dashboard today".
    const todayState = getTodayCompletion();
    if (todayState) {
      setCompletionStatus(todayState.completionStatus);
      setResponseStatus(todayState.responseStatus);
    } else if (g && p) {
      const existing = findTodayLogEntry(goalSignature(g), p);
      if (existing) {
        setCompletionStatus(existing.status);
        if (existing.acceptedAdjustment === true) setResponseStatus("accepted");
        else if (existing.acceptedAdjustment === false) setResponseStatus("rejected");
      }
    }
  }, []);

  // Refresh today's manual readiness whenever the user navigates back
  // to this tab — e.g. after editing on /recovery — so the decision
  // re-runs with the latest values without a hard reload.
  useEffect(() => {
    const refresh = () => {
      setTodayReadiness(getTodayReadiness());
      setReadinessBaselines(getReadinessBaselines());
    };
    const onFocus = () => refresh();
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    // Cross-tab updates: if /recovery is open in another tab, the
    // `storage` event fires here when the user saves there.
    const onStorage = (e: StorageEvent) => {
      if (e.key === "kinetic_readiness" || e.key === null) refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Auth guard
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthChecked(true);
      if (!u) router.replace("/login");
    });
    return () => unsub();
  }, [router]);

  // Load decision whenever the active scenario changes (or on first sign-in).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      // Note: we deliberately don't reset `responseStatus` /
      // `completionStatus` here — those are hydrated from the persisted
      // workout log on mount, so re-fetching the decision (e.g. after
      // a readiness edit) shouldn't undo the runner's earlier choices.
      try {
        // Personalization: derive a [0, 1] bias from the workout log.
        // High values mean the runner has historically rejected the
        // engine's adjustments, so the backend will soften "modify"
        // and lightly favour "proceed". `getAdjustmentBiasTowardOriginal`
        // returns 0 until there are at least a few data points, so new
        // accounts behave exactly like before.
        const biasTowardOriginal = goal
          ? getAdjustmentBiasTowardOriginal(getWorkoutLog(goalSignature(goal)))
          : 0;
        const res = await apiFetch(`/decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            toRequestBody(activeScenario, todayReadiness, biasTowardOriginal),
          ),
        });
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const data = (await res.json()) as DecisionOutput;
        if (!cancelled) setDecision(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load decision");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, activeScenario, todayReadiness, goal]);

  // Calendar-aware plan refresh: fetch availability + travel for the full
  // plan horizon, run the multi-week adjuster, and decide whether to:
  //   - save fresh as the user's plan (initial generation), or
  //   - surface a suggestion card (saved plan exists but week 0 differs).
  //
  // If the calendar fetch fails (or there's nothing to enrich) we still
  // persist the base deterministic plan so the dashboard never renders
  // without a "this week" strip. Calendar awareness overlays cleanly on
  // the next successful refresh.
  useEffect(() => {
    if (!user || !goal) return;
    let cancelled = false;
    (async () => {
      const base = applyPreferredDays(
        generateTrainingPlan(goal),
        profile?.preferred_training_days,
      );
      if (base.length === 0) return;
      const planStart = startOfWeek();
      const planStartIso = isoDate(planStart);
      const sig = planSignature(goal, profile);

      // Step 1: ensure a plan is persisted right away. If the saved plan
      // is missing or stale (different goal / week), drop in the base
      // plan so the UI has something to render even if the network step
      // below never completes.
      const existing = getSavedPlan();
      const isStaleSaved =
        !existing ||
        existing.goalSig !== sig ||
        existing.planStart !== planStartIso;
      if (isStaleSaved) {
        const baseSaved: SavedPlan = {
          planStart: planStartIso,
          goalSig: sig,
          weeks: base,
          reasoning: [],
          easyOnlyDays: [],
          savedAt: new Date().toISOString(),
        };
        savePlan(baseSaved);
        if (!cancelled) setSavedPlan(baseSaved);
      }

      try {
        const horizonDays = Math.min(120, base.length * 7);
        const travelHorizon = Math.min(180, base.length * 7);

        const [availRes, travelRes] = await Promise.all([
          apiFetch(`/availability/week?days=${horizonDays}`),
          apiFetch(`/travel?days=${travelHorizon}`),
        ]);
        if (!availRes.ok || !travelRes.ok) return;
        const availJson = (await availRes.json()) as { days: DayAvailability[] };
        const travelJson = (await travelRes.json()) as { events: TravelEvent[] };

        // Stamp a successful sync so the next /decision call can flag
        // calendar staleness if this fetch ever stops succeeding (e.g.
        // creds expire or the backend returns 503 on subsequent visits).
        recordCalendarSync();

        const buckets = bucketDaysByWeek(
          availJson.days,
          planStart,
          base.length
        );
        const fresh = buildCalendarAwarePlan(
          base,
          buckets,
          travelJson.events,
          planStart
        );

        if (cancelled) return;

        const saved = !isStaleSaved ? existing : null;

        if (!saved) {
          // Initial generation path: bake calendar awareness into the plan,
          // save it, and let the user know once via a quiet banner.
          const initial: SavedPlan = {
            planStart: planStartIso,
            goalSig: sig,
            weeks: fresh.weeks,
            reasoning: fresh.reasoning,
            easyOnlyDays: fresh.easyOnlyDays,
            savedAt: new Date().toISOString(),
          };
          savePlan(initial);
          setSavedPlan(initial);
          setPending(null);
          setShowInitialBanner(fresh.hasChanges);
        } else {
          // Ongoing refresh path. Only surface a suggestion when this
          // week's adjusted version differs from what's already saved.
          const week0Saved = saved.weeks[0];
          const week0Fresh = fresh.weeks[0];
          if (
            week0Saved &&
            week0Fresh &&
            weeksDiffer(week0Saved, week0Fresh)
          ) {
            setPending({ proposed: fresh, weekChange: fresh.perWeek[0] });
            setSuggestionStatus("pending");
          } else {
            setPending(null);
          }
          setSavedPlan(saved);
        }

        // Mark today's scheduled checks as completed once the calendar
        // refresh has actually run.
        for (const c of dueChecks()) markRanAt(c);
        setScheduleChecks([]);
      } catch {
        // Calendar refresh is best-effort; silently ignore failures.
        // The base plan persisted in step 1 keeps the UI functional.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, goal, profile]);

  function acceptSuggestion() {
    if (!pending || !goal) return;
    const next: SavedPlan = {
      planStart: isoDate(startOfWeek()),
      goalSig: planSignature(goal, profile),
      weeks: pending.proposed.weeks,
      reasoning: pending.proposed.reasoning,
      easyOnlyDays: pending.proposed.easyOnlyDays,
      savedAt: new Date().toISOString(),
    };
    savePlan(next);
    setSavedPlan(next);
    setPending(null);
    setSuggestionStatus("accepted");
  }

  function rejectSuggestion() {
    setPending(null);
    setSuggestionStatus("rejected");
  }

  if (!authChecked) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-neutral-500">Loading…</p>
      </main>
    );
  }

  return (
    <PageContainer className="relative mx-auto w-full max-w-4xl px-4 py-12 sm:py-16">
      {/* Background motion (drifting gradient blobs + topographic texture) */}
      {/* is mounted globally in app/layout.tsx so every page shares the */}
      {/* same wash. Nothing to render here. */}

      {/* Stagger every section in from below for a calm, cascading entrance. */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={containerVariants}
        className="space-y-10"
      >
        {/* 1. Greeting + race countdown — warm, personalized opener. */}
        <motion.div variants={itemVariants}>
          <Greeting profile={profile} goal={goal} />
        </motion.div>

        {/* 2. Banners — schedule notice / initial plan / pending suggestion. */}
        {/* These mount-and-unmount based on transient state so they keep */}
        {/* their own AnimatePresence rather than the container's stagger. */}
        <AnimatePresence initial={false}>
          {scheduleChecks.length > 0 && (
            <motion.div
              key="schedule-notice"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: PREMIUM_EASE }}
            >
              <ScheduleNotice checks={scheduleChecks} />
            </motion.div>
          )}

          {showInitialBanner && savedPlan && (
            <motion.div
              key="initial-banner"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: PREMIUM_EASE }}
            >
              <InitialPlanBanner
                saved={savedPlan}
                onDismiss={() => setShowInitialBanner(false)}
              />
            </motion.div>
          )}

          {pending && (
            <motion.div
              key="plan-adjustment"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: PREMIUM_EASE }}
            >
              <PlanAdjustmentCard
                weekChange={pending.weekChange}
                easyOnlyCount={pending.proposed.easyOnlyDays.filter(
                  (d) => d.weekIndex === 0
                ).length}
                status={suggestionStatus}
                onAccept={acceptSuggestion}
                onReject={rejectSuggestion}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* 3. This week strip — context for "where am I in the week". */}
        {savedPlan && savedPlan.weeks[0] && (
          <motion.section variants={itemVariants}>
            <ThisWeekStrip
              week={savedPlan.weeks[0]}
              planStart={savedPlan.planStart}
            />
          </motion.section>
        )}

        {error && (
          <motion.div
            variants={itemVariants}
            className={`rounded-2xl border p-6 text-sm ${tokens.warning.soft}`}
          >
            <p className="font-medium">Couldn&apos;t load today&apos;s decision</p>
            <p className="mt-1 opacity-80">{error}</p>
            <p className="mt-2 text-xs opacity-70">
              Make sure the backend is running at {API_BASE}.
            </p>
          </motion.div>
        )}

        {loading && (
          <motion.div variants={itemVariants}>
            <SkeletonState />
          </motion.div>
        )}

        {decision && !loading && (
          <>
            {/* 4. Hero — today's recommendation, breakdown, confidence, CTA. */}
            <motion.div variants={itemVariants}>
              <HeroCard
                decision={decision}
                goal={goal}
                planWeeks={savedPlan?.weeks ?? null}
                planStart={savedPlan?.planStart ?? null}
                responseStatus={responseStatus}
                completionStatus={completionStatus}
                onAccept={() => {
                  setResponseStatus("accepted");
                  setTodayCompletion({ responseStatus: "accepted" });
                }}
                onReject={() => {
                  setResponseStatus("rejected");
                  setTodayCompletion({ responseStatus: "rejected" });
                }}
                onMarkCompleted={() => {
                  setCompletionStatus("completed");
                  setTodayCompletion({
                    completionStatus: "completed",
                    responseStatus,
                  });
                  if (goal && savedPlan) {
                    // Only attach the acceptedAdjustment flag when the engine
                    // actually offered an adjustment to consider. Otherwise
                    // there was nothing to accept/reject, so the field stays
                    // unset rather than misleadingly logging "false".
                    const offeredAdjustment =
                      decision.selected_action.name !== "proceed";
                    logTodayFromPlan(
                      "completed",
                      goalSignature(goal),
                      savedPlan,
                      new Date(),
                      offeredAdjustment
                        ? { acceptedAdjustment: responseStatus === "accepted" }
                        : undefined,
                    );
                  }
                }}
                onMarkSkipped={() => {
                  setCompletionStatus("skipped");
                  setTodayCompletion({
                    completionStatus: "skipped",
                    responseStatus,
                  });
                  if (goal && savedPlan) {
                    const offeredAdjustment =
                      decision.selected_action.name !== "proceed";
                    logTodayFromPlan(
                      "skipped",
                      goalSignature(goal),
                      savedPlan,
                      new Date(),
                      offeredAdjustment
                        ? { acceptedAdjustment: responseStatus === "accepted" }
                        : undefined,
                    );
                  }
                }}
                onReset={() => {
                  setResponseStatus("pending");
                  setCompletionStatus("pending");
                  clearTodayCompletion();
                }}
              />
            </motion.div>

            {/* 5. Reasoning — short bullets explaining the choice. */}
            <motion.section variants={itemVariants}>
              <ReasoningCard
                decision={decision}
                readiness={todayReadiness}
                baselines={readinessBaselines}
              />
            </motion.section>

            {/* 6. Context row — supporting numbers (time, recovery). */}
            <motion.section variants={itemVariants}>
              <ContextRow
                availableMinutes={decision.available_minutes}
                state={decision.state}
                baselines={readinessBaselines}
                readiness={todayReadiness}
              />
            </motion.section>
          </>
        )}
      </motion.div>
    </PageContainer>
  );
}

// --- Greeting --------------------------------------------------------------

/**
 * Time-aware greeting + race countdown that sits at the top of the
 * dashboard. The eyebrow ("KINETIC · TODAY") matches the wordmark
 * styling used across the onboarding flow so the app reads as one
 * continuous experience.
 *
 * Falls back gracefully when no profile/goal is loaded yet — we still
 * want a friendly headline rather than a blank page during hydration.
 */
function Greeting({
  profile,
  goal,
}: {
  profile: UserProfile | null;
  goal: Goal | null;
}) {
  const firstName = useMemo(() => {
    const full = profile?.full_name?.trim();
    if (!full) return null;
    // Use only the first token to keep the headline short and casual.
    return full.split(/\s+/)[0];
  }, [profile?.full_name]);

  const partOfDay = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    []
  );

  const headline = firstName ? `${partOfDay}, ${firstName}.` : `${partOfDay}.`;

  return (
    <header>
      <p className="text-xs font-medium uppercase tracking-[0.32em] text-neutral-500 dark:text-neutral-400">
        Kinetic · Today
      </p>
      <h1 className="mt-3 text-balance text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
        {headline}
      </h1>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {todayLabel}
          {goal?.target_date ? (
            <>
              <span className="mx-2 text-neutral-300 dark:text-neutral-600">·</span>
              <RaceCountdown goal={goal} />
            </>
          ) : null}
        </p>
      </div>
      {/* Subtle stride waveform under the headline — visually anchors */}
      {/* the page in motion, fits the Kinetic brand. */}
      <div className="mt-5 -ml-1" aria-hidden="true">
        <StrideWave width={320} height={36} tone="blue" loop />
      </div>
    </header>
  );
}

/**
 * Inline race countdown shown next to today's date in the greeting.
 * Renders nothing if there's no target date yet. Phrasing scales with
 * the time horizon so it always feels natural ("12 weeks", "5 days",
 * "Race day!").
 */
function RaceCountdown({ goal }: { goal: Goal }) {
  const phrase = useMemo(() => {
    if (!goal.target_date) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(`${goal.target_date}T00:00:00`);
    target.setHours(0, 0, 0, 0);
    const ms = target.getTime() - today.getTime();
    const days = Math.round(ms / (1000 * 60 * 60 * 24));
    const distance = formatRaceDistance(goal.race_distance);
    if (days === 0) return `Race day · ${distance}`;
    if (days < 0) {
      const past = Math.abs(days);
      return `${past} day${past === 1 ? "" : "s"} since your ${distance}`;
    }
    if (days <= 14) {
      return `${days} day${days === 1 ? "" : "s"} until your ${distance}`;
    }
    const weeks = Math.round(days / 7);
    return `${weeks} week${weeks === 1 ? "" : "s"} until your ${distance}`;
  }, [goal.race_distance, goal.target_date]);
  if (!phrase) return null;
  return <span className="font-medium text-neutral-700 dark:text-neutral-200">{phrase}</span>;
}

function formatRaceDistance(d: RaceDistance | undefined): string {
  switch (d) {
    case "5k":
      return "5K";
    case "10k":
      return "10K";
    case "half":
      return "half marathon";
    case "marathon":
      return "marathon";
    default:
      return "race";
  }
}

// --- This week strip -------------------------------------------------------

/**
 * Compact 7-day strip showing the current training week at a glance.
 * Each chip surfaces the workout type + planned distance, with today's
 * chip filled in solid blue so the runner sees their next session
 * without scrolling. A small summary line above shows total runs and
 * mileage planned for the week.
 *
 * Lives directly under the greeting so the user can scan their week
 * before diving into today's hero card.
 */
function ThisWeekStrip({
  week,
  planStart,
}: {
  week: PlanWeek;
  planStart: string;
}) {
  // Map workouts onto canonical Mon..Sun day labels so the strip
  // always renders 7 chips, even if the plan only schedules 4 runs.
  const ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
  type DayLabel = (typeof ORDER)[number];

  const byDay = useMemo(() => {
    const map = new Map<DayLabel, Workout>();
    for (const w of week.workouts) {
      const key = (w.day as DayLabel) ?? null;
      if (key && ORDER.includes(key)) map.set(key, w);
    }
    return map;
  }, [week.workouts]);

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString("en-US", { weekday: "short" }) as DayLabel;
  }, []);

  // Total mileage + run count summary — surfaces the volume at a glance.
  const totalMiles = useMemo(
    () =>
      Math.round(
        week.workouts.reduce((sum, w) => sum + (w.distance ?? 0), 0) * 10
      ) / 10,
    [week.workouts]
  );

  return (
    <div className="rounded-3xl border border-white/40 bg-white/70 p-6 backdrop-blur-md shadow-sm dark:border-white/10 dark:bg-neutral-900/60">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
            This week
          </p>
          <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
            <span className="font-semibold text-neutral-900 dark:text-white">
              {week.workouts.length}
            </span>{" "}
            run{week.workouts.length === 1 ? "" : "s"} ·{" "}
            <span className="font-semibold text-neutral-900 dark:text-white">
              {totalMiles}
            </span>{" "}
            mi planned
            <span className="ml-2 text-xs uppercase tracking-[0.18em] text-neutral-400 dark:text-neutral-500">
              · {week.phase}
            </span>
          </p>
        </div>
        <p className="text-xs text-neutral-400 dark:text-neutral-500">
          Week of{" "}
          {new Date(`${planStart}T00:00:00`).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </p>
      </div>
      <div className="mt-5 grid grid-cols-7 gap-2">
        {ORDER.map((day) => {
          const w = byDay.get(day);
          const isToday = day === todayLabel;
          return (
            <DayChip key={day} day={day} workout={w} isToday={isToday} />
          );
        })}
      </div>
    </div>
  );
}

/**
 * Single-day chip used inside the week strip. Shows the day label
 * plus the workout type icon/dot and distance. Today gets a filled
 * blue surface; rest days get a muted, dashed-style chip so the eye
 * naturally lands on the days that have work.
 */
function DayChip({
  day,
  workout,
  isToday,
}: {
  day: string;
  workout: Workout | undefined;
  isToday: boolean;
}) {
  const isRest = !workout;
  const baseClasses =
    "flex flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-3 text-center transition-colors";
  const stateClasses = isToday
    ? "border-transparent bg-blue-500 text-white shadow-sm dark:bg-blue-400 dark:text-neutral-900"
    : isRest
      ? "border-neutral-200/70 bg-white/40 text-neutral-400 dark:border-white/10 dark:bg-white/5 dark:text-neutral-500"
      : "border-neutral-200/70 bg-white/70 text-neutral-700 dark:border-white/10 dark:bg-neutral-900/60 dark:text-neutral-200";
  return (
    <div className={`${baseClasses} ${stateClasses}`}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">
        {day}
      </span>
      {isRest ? (
        <span className="text-[11px] font-medium opacity-80">Rest</span>
      ) : (
        <>
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isToday ? "bg-white dark:bg-neutral-900" : workoutDotClass(workout!.type)
            }`}
            aria-hidden="true"
          />
          <span className="text-[11px] font-medium capitalize">
            {shortWorkoutType(workout!.type)}
          </span>
          <span className="text-[11px] tabular-nums opacity-80">
            {workout!.distance} mi
          </span>
        </>
      )}
    </div>
  );
}

function shortWorkoutType(type: WorkoutType): string {
  switch (type) {
    case "long run":
      return "Long";
    case "intervals":
      return "Intervals";
    case "tempo":
      return "Tempo";
    case "race":
      return "Race";
    case "easy":
    default:
      return "Easy";
  }
}

function workoutDotClass(type: WorkoutType): string {
  switch (type) {
    case "long run":
      return "bg-violet-500 dark:bg-violet-400";
    case "intervals":
      return "bg-rose-500 dark:bg-rose-400";
    case "tempo":
      return "bg-amber-500 dark:bg-amber-400";
    case "race":
      return "bg-emerald-500 dark:bg-emerald-400";
    case "easy":
    default:
      return "bg-blue-500 dark:bg-blue-400";
  }
}


// --- Cards ------------------------------------------------------------------

/**
 * Hero card: large "Today's Recommendation" panel with the workout name,
 * supporting metrics (distance · duration · note), the structured workout
 * breakdown, a confidence callout, and the primary Accept CTA.
 *
 * Visual: GlassCard surface with a subtle blue-50 → transparent gradient
 * to set it apart from the secondary cards below.
 */
function HeroCard({
  decision,
  goal,
  planWeeks,
  planStart,
  responseStatus,
  completionStatus,
  onAccept,
  onReject,
  onMarkCompleted,
  onMarkSkipped,
  onReset,
}: {
  decision: DecisionOutput;
  goal: Goal | null;
  planWeeks: PlanWeek[] | null;
  planStart: string | null;
  /** Step 1: which workout the runner is doing today (engine-adjusted vs. original). */
  responseStatus: "pending" | "accepted" | "rejected";
  /** Step 2: did the runner actually complete it? Persisted to the workout log. */
  completionStatus: "pending" | "completed" | "skipped";
  onAccept: () => void;
  onReject: () => void;
  onMarkCompleted: () => void;
  onMarkSkipped: () => void;
  onReset: () => void;
}) {
  // Derive a structured workout if we have a goal saved; otherwise fall back
  // to the backend's free-text final_workout.
  const todays = useMemo<TodaysWorkout | null>(() => {
    if (!goal) return null;
    try {
      const plan = planWeeks ?? undefined;
      return getTodaysWorkout(
        goal,
        plan,
        decision.selected_action,
        new Date(),
        planStart ? { planStart } : undefined
      );
    } catch {
      return null;
    }
  }, [goal, planWeeks, planStart, decision.selected_action]);

  const headline = todays ? todays.headline : decision.selected_action.name;

  // The engine surfaces three top-level actions: "proceed" (run the plan
  // as-is), "modify" (change intensity/duration), and "rest". Only the
  // last two represent an actual adjustment the runner needs to weigh
  // in on. When the engine says "proceed", there's nothing to
  // accept/reject — we should jump straight to "did you do it?".
  const needsAdjustment = decision.selected_action.name !== "proceed";

  return (
    <GlassCard
      interactive={false}
      className="overflow-hidden bg-gradient-to-br from-blue-50/80 via-white/60 to-transparent p-8 backdrop-blur-md sm:p-10 dark:from-blue-950/40 dark:via-neutral-900/40 dark:to-transparent"
    >
      <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
        {/* Left: workout */}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
            Today&apos;s recommendation
          </p>
          <h2 className="mt-3 text-balance text-4xl font-semibold capitalize leading-[1.1] tracking-tight text-neutral-900 sm:text-[2.75rem] dark:text-neutral-50">
            {headline}
          </h2>
          {todays && todays.type !== "rest" ? (
            <p className="mt-4 text-sm tabular-nums text-neutral-600 dark:text-neutral-400">
              <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                {todays.totalDistance.toFixed(1)}
              </span>{" "}
              mi
              <span className="mx-2 text-neutral-300 dark:text-neutral-600">·</span>
              <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                {todays.totalDuration}
              </span>{" "}
              min
            </p>
          ) : null}
          {todays?.note ? (
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              {todays.note}
            </p>
          ) : null}
          {!todays && (
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
              {decision.final_workout}
            </p>
          )}
        </div>

        {/* Right: confidence */}
        <ConfidenceBadge decision={decision} />
      </div>

      {todays && todays.segments.length > 0 ? (
        <WorkoutBreakdown segments={todays.segments} />
      ) : null}

      {/* Primary CTA — two-step flow:
          1. Choose which workout the runner is doing (accept adjustment / keep original).
          2. After choosing, confirm whether they completed or skipped it. */}
      <div className="mt-10 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <AnimatePresence mode="wait" initial={false}>
          {responseStatus === "pending" && needsAdjustment ? (
            <motion.div
              key="cta-response"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:flex-1 sm:items-center sm:justify-between"
            >
              <motion.button
                onClick={onReject}
                whileHover={{ y: -1 }}
                whileTap={{ y: 0, scale: 0.97 }}
                transition={{ duration: 0.18, ease: PREMIUM_EASE }}
                className="rounded-full border border-black/10 bg-white/70 px-5 py-2.5 text-sm font-medium text-neutral-700 backdrop-blur hover:border-black/20 hover:bg-white hover:shadow-sm dark:border-white/15 dark:bg-neutral-900/40 dark:text-neutral-300 dark:hover:bg-neutral-900/60"
                title="Stick with the original planned workout instead of the adjusted one"
              >
                Reject — keep original plan
              </motion.button>
              <motion.button
                onClick={onAccept}
                whileHover={{ y: -1 }}
                whileTap={{ y: 0, scale: 0.97 }}
                transition={{ duration: 0.18, ease: PREMIUM_EASE }}
                className={`rounded-full px-6 py-3 text-sm font-semibold ${tokens.primary.solid}`}
                title="Use the adjusted workout above (recovery-aware)"
              >
                Accept adjustment
              </motion.button>
            </motion.div>
          ) : completionStatus === "pending" ? (
            <motion.div
              key="cta-completion"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="flex flex-col gap-3 sm:flex-1 sm:flex-row sm:items-center sm:justify-between"
            >
              {/* The "Adjustment chosen / Original plan chosen" pill only
                  makes sense when the runner had a choice to make. When
                  the engine recommended proceeding as-planned, suppress
                  it so the row reads as a single, clean prompt. */}
              {needsAdjustment ? (
                <div className="flex items-center gap-3 text-xs">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium ${
                      responseStatus === "accepted"
                        ? tokens.success.soft
                        : "border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-white/10 dark:bg-neutral-800 dark:text-neutral-300"
                    }`}
                  >
                    {responseStatus === "accepted"
                      ? "Adjustment chosen"
                      : "Original plan chosen"}
                  </span>
                  <button
                    type="button"
                    onClick={onReset}
                    className={`text-xs font-medium text-neutral-500 underline-offset-4 hover:text-neutral-800 hover:underline dark:text-neutral-400 dark:hover:text-neutral-200 ${tokens.motion}`}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <span aria-hidden="true" />
              )}
              <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center">
                <p className="self-center pr-1 text-xs text-neutral-500 dark:text-neutral-400 sm:pr-3">
                  Did you do the workout?
                </p>
                <motion.button
                  onClick={onMarkSkipped}
                  whileHover={{ y: -1 }}
                  whileTap={{ y: 0, scale: 0.97 }}
                  transition={{ duration: 0.18, ease: PREMIUM_EASE }}
                  className="rounded-full border border-black/10 bg-white/70 px-5 py-2.5 text-sm font-medium text-neutral-700 backdrop-blur hover:border-black/20 hover:bg-white hover:shadow-sm dark:border-white/15 dark:bg-neutral-900/40 dark:text-neutral-300 dark:hover:bg-neutral-900/60"
                >
                  Mark as skipped
                </motion.button>
                <motion.button
                  onClick={onMarkCompleted}
                  whileHover={{ y: -1 }}
                  whileTap={{ y: 0, scale: 0.97 }}
                  transition={{ duration: 0.18, ease: PREMIUM_EASE }}
                  className={`rounded-full px-6 py-3 text-sm font-semibold ${tokens.primary.solid}`}
                >
                  Mark as completed
                </motion.button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="cta-final"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="flex flex-col gap-2 sm:flex-1 sm:flex-row sm:items-center sm:justify-between"
            >
              <span
                className={`inline-flex items-center gap-2 self-start rounded-full border px-3 py-1 text-xs font-medium ${
                  completionStatus === "completed"
                    ? tokens.success.soft
                    : "border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-white/10 dark:bg-neutral-800 dark:text-neutral-300"
                }`}
              >
                {/* Tiny animated checkmark on completion — draws itself */}
                {/* in (~360ms), then sits as a static badge. Adds a beat */}
                {/* of celebration without a full confetti burst. */}
                {completionStatus === "completed" ? (
                  <motion.svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                    initial={{ scale: 0.6 }}
                    animate={{ scale: 1 }}
                    transition={{
                      duration: 0.36,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  >
                    <motion.path
                      d="M5 12 L10 17 L19 7"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{
                        duration: 0.42,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    />
                  </motion.svg>
                ) : null}
                {finalStatusLabel(responseStatus, completionStatus)}
              </span>
              <button
                type="button"
                onClick={onReset}
                className={`self-start text-xs font-medium text-neutral-500 underline-offset-4 hover:text-neutral-800 hover:underline dark:text-neutral-400 dark:hover:text-neutral-200 sm:self-auto ${tokens.motion}`}
              >
                Change
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </GlassCard>
  );
}

function finalStatusLabel(
  response: "pending" | "accepted" | "rejected",
  completion: "pending" | "completed" | "skipped",
): string {
  if (completion === "completed") {
    return response === "accepted"
      ? "Adjustment completed"
      : "Original plan completed";
  }
  if (completion === "skipped") return "Skipped";
  return "";
}

function WorkoutBreakdown({ segments }: { segments: WorkoutSegment[] }) {
  return (
    <div className="mt-8 overflow-hidden rounded-2xl border border-black/5 bg-white/40 backdrop-blur dark:border-white/10 dark:bg-neutral-950/30">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="bg-white/60 text-xs uppercase tracking-[0.18em] text-neutral-500 dark:bg-neutral-900/40 dark:text-neutral-400">
            <th className="px-4 py-3 font-medium">Segment</th>
            <th className="px-4 py-3 font-medium tabular-nums">Distance</th>
            <th className="px-4 py-3 font-medium tabular-nums">Pace</th>
            <th className="px-4 py-3 text-right font-medium tabular-nums">Time</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((seg, i) => (
            <tr
              key={i}
              className="border-t border-black/5 dark:border-white/10"
            >
              <td className="px-4 py-3">
                <p className="font-medium text-neutral-800 dark:text-neutral-200">
                  {seg.label}
                </p>
                {seg.note ? (
                  <p className="mt-0.5 text-xs text-neutral-500">{seg.note}</p>
                ) : null}
              </td>
              <td className="px-4 py-3 tabular-nums text-neutral-700 dark:text-neutral-300">
                {seg.distance.toFixed(1)} mi
              </td>
              <td className="px-4 py-3 tabular-nums text-neutral-700 dark:text-neutral-300">
                {formatPace(seg.pace)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-neutral-700 dark:text-neutral-300">
                {seg.duration} min
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConfidenceBadge({
  decision,
}: {
  decision: DecisionOutput;
}) {
  const confidence = decision.confidence;
  const warnings = decision.staleness_warnings ?? [];
  const [isOpen, setIsOpen] = useState(false);
  const insightsId = "confidence-insights";

  // Derive the contributors from the engine's structured output. Same
  // formula the backend uses (see `decision_engine.make_decision`):
  //   base_confidence = 0.5 * best_score + 0.5 * spread
  //   confidence = base_confidence - freshness_penalty
  // We don't need the exact penalty number here — only whether the
  // freshness signal is healthy / soft / hard. That's already encoded
  // in the count and severity of `staleness_warnings`.
  const insights = useMemo<ConfidenceInsight[]>(() => {
    const scoreEntries = Object.entries(decision.scores ?? {});
    const selectedName = decision.selected_action.name;
    const selectedScore =
      decision.scores?.[selectedName] ??
      (scoreEntries.length > 0
        ? Math.max(...scoreEntries.map(([, v]) => v))
        : 0);
    const otherScores = scoreEntries
      .filter(([name]) => name !== selectedName)
      .map(([, v]) => v);
    const runnerUp = otherScores.length > 0 ? Math.max(...otherScores) : 0;
    const spread = Math.max(0, selectedScore - runnerUp);

    const rows: ConfidenceInsight[] = [];

    // 1) Plan fit — how strong the chosen action's absolute score is.
    rows.push(
      selectedScore >= 0.7
        ? {
            key: "fit",
            label: "Plan fit",
            tone: "good",
            description:
              "The recommended workout is a strong match for today's state, calendar, and recovery.",
          }
        : selectedScore >= 0.5
          ? {
              key: "fit",
              label: "Plan fit",
              tone: "ok",
              description:
                "The recommended workout is a reasonable match for today, with some compromises.",
            }
          : {
              key: "fit",
              label: "Plan fit",
              tone: "weak",
              description:
                "No option scored particularly well — today's signals are pulling in different directions.",
            },
    );

    // 2) Decision clarity — how clearly the chosen action beat the
    //    runner-up. A wide spread = obvious winner; a tight spread =
    //    the engine is essentially picking between near-equals.
    if (otherScores.length > 0) {
      rows.push(
        spread >= 0.25
          ? {
              key: "clarity",
              label: "Decision clarity",
              tone: "good",
              description:
                "Top pick scored well above the alternatives — a clear winner.",
            }
          : spread >= 0.1
            ? {
                key: "clarity",
                label: "Decision clarity",
                tone: "ok",
                description:
                  "Top pick edged out the alternatives by a moderate margin.",
              }
            : {
                key: "clarity",
                label: "Decision clarity",
                tone: "weak",
                description:
                  "Close call — top pick is only narrowly ahead of the alternatives.",
              },
      );
    }

    // 3) Data freshness — derived from the staleness warnings. Each
    //    warning corresponds to a specific source (recovery, calendar)
    //    that's drifted past the freshness threshold.
    rows.push(
      warnings.length === 0
        ? {
            key: "freshness",
            label: "Data freshness",
            tone: "good",
            description: "Recovery and calendar inputs are current.",
          }
        : warnings.length === 1
          ? {
              key: "freshness",
              label: "Data freshness",
              tone: "ok",
              description: warnings[0]!,
            }
          : {
              key: "freshness",
              label: "Data freshness",
              tone: "weak",
              description: warnings.join(" · "),
            },
    );

    return rows;
  }, [decision.scores, decision.selected_action.name, warnings]);

  // Map raw 0–1 confidence onto three tiers. The runner cares whether
  // we're confident enough to act, not the third decimal place — Low /
  // Med / High reads at a glance and aligns with the rest of the
  // dashboard's qualitative language ("recovered", "build", etc.).
  const clamped = Math.max(0, Math.min(1, confidence));
  const tier: "low" | "med" | "high" =
    clamped >= 0.75 ? "high" : clamped >= 0.5 ? "med" : "low";

  const TIER_META = {
    low: {
      label: "Low",
      activeBars: 1,
      // Red — flags "we're working with thin data; tread carefully".
      barFill: "bg-red-500 dark:bg-red-400",
      labelText: "text-red-700 dark:text-red-300",
      ring: "ring-red-200/70 dark:ring-red-400/20",
      bg: "bg-red-50/70 dark:bg-red-500/[0.06]",
    },
    med: {
      label: "Medium",
      activeBars: 2,
      // Yellow — neutral caution, decent signal but not great.
      barFill: "bg-yellow-500 dark:bg-yellow-400",
      labelText: "text-yellow-700 dark:text-yellow-300",
      ring: "ring-yellow-200/70 dark:ring-yellow-400/20",
      bg: "bg-yellow-50/70 dark:bg-yellow-500/[0.06]",
    },
    high: {
      label: "High",
      activeBars: 3,
      // Green — go signal, the engine is confident in this call.
      barFill: "bg-green-500 dark:bg-green-400",
      labelText: "text-green-700 dark:text-green-300",
      ring: "ring-green-200/70 dark:ring-green-400/20",
      bg: "bg-green-50/70 dark:bg-green-500/[0.06]",
    },
  } as const;

  const meta = TIER_META[tier];
  const hasWarnings = warnings.length > 0;

  // Three signal-strength bars climbing left → right. Active bars
  // animate up from the baseline on mount; inactive bars stay as faint
  // tracks so the slot is always visible. A subtle aria-label on the
  // wrapper keeps it screen-reader friendly while the visual stays
  // compact.
  const BAR_HEIGHTS = [10, 16, 22] as const;

  return (
    <div className="flex w-full shrink-0 flex-col items-stretch gap-2 sm:w-auto sm:max-w-[18rem]">
      <motion.button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-controls={insightsId}
        aria-label={`Confidence: ${meta.label}. ${
          isOpen ? "Hide" : "Show"
        } breakdown`}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -1 }}
        whileTap={{ y: 0, scale: 0.985 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className={`group flex items-center gap-3 self-start rounded-2xl px-3.5 py-2.5 text-left ring-1 backdrop-blur-md transition-shadow hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 sm:self-end ${meta.bg} ${meta.ring}`}
      >
        {/* Signal-strength bars */}
        <div
          className="flex h-6 items-end gap-1"
          aria-hidden="true"
        >
          {BAR_HEIGHTS.map((h, i) => {
            const isActive = i < meta.activeBars;
            return (
              <div
                key={i}
                className="relative w-1.5 overflow-hidden rounded-full bg-neutral-200/80 dark:bg-white/10"
                style={{ height: `${h}px` }}
              >
                <motion.div
                  className={`absolute inset-x-0 bottom-0 rounded-full ${
                    isActive ? meta.barFill : "bg-transparent"
                  }`}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: isActive ? 1 : 0 }}
                  transition={{
                    duration: 0.45,
                    ease: [0.22, 1, 0.36, 1],
                    delay: 0.08 + i * 0.08,
                  }}
                  style={{ originY: 1, height: "100%" }}
                />
              </div>
            );
          })}
        </div>

        {/* Label stack */}
        <div className="flex flex-col items-start leading-tight">
          <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-neutral-500 dark:text-neutral-400">
            Confidence
          </span>
          <span
            className={`text-sm font-semibold tracking-tight ${meta.labelText}`}
          >
            {meta.label}
          </span>
        </div>

        {/* Info chevron — signals "more detail available". Rotates on
            open the same way the Recovery card does so the two
            disclosures feel consistent. */}
        <span
          aria-hidden="true"
          className={`ml-1 text-neutral-400 transition-transform duration-200 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 ${
            isOpen ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </motion.button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id={insightsId}
            key="confidence-insights"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: PREMIUM_EASE }}
            className="overflow-hidden self-stretch sm:self-end"
          >
            <div
              className={`rounded-2xl border bg-white/70 px-4 py-3 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-neutral-900/40 ${
                hasWarnings
                  ? "border-amber-200/60 dark:border-amber-400/20"
                  : "border-neutral-200/70"
              }`}
            >
              <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-neutral-500 dark:text-neutral-400">
                What feeds this score
              </p>
              <ul className="mt-2 divide-y divide-neutral-200/60 dark:divide-white/5">
                {insights.map((insight) => (
                  <ConfidenceInsightRow key={insight.key} insight={insight} />
                ))}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {hasWarnings && !isOpen && (
        <div
          role="status"
          aria-label="Data freshness warnings"
          className="self-start rounded-2xl border border-amber-200/70 bg-amber-50/70 px-3 py-2 text-left text-[11px] leading-snug text-amber-800 backdrop-blur sm:self-end sm:text-right dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200"
        >
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] opacity-80">
            Heads up
          </p>
          <ul className="mt-1 space-y-0.5">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// --- Confidence insights ---------------------------------------------------

type ConfidenceInsightTone = "good" | "ok" | "weak";

type ConfidenceInsight = {
  key: string;
  label: string;
  description: string;
  tone: ConfidenceInsightTone;
};

/**
 * Single contributor row inside the Confidence disclosure. Mirrors the
 * Recovery insight row visually (red/yellow/green dot + uppercase
 * eyebrow + sentence) so both disclosures read as the same family.
 */
function ConfidenceInsightRow({ insight }: { insight: ConfidenceInsight }) {
  const dotClass = (() => {
    switch (insight.tone) {
      case "good":
        return "bg-green-500 dark:bg-green-400";
      case "ok":
        return "bg-yellow-500 dark:bg-yellow-400";
      case "weak":
      default:
        return "bg-red-500 dark:bg-red-400";
    }
  })();
  return (
    <li className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      <span
        aria-hidden="true"
        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-neutral-500 dark:text-neutral-400">
          {insight.label}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-neutral-700 dark:text-neutral-300">
          {insight.description}
        </p>
      </div>
    </li>
  );
}

function ReasoningCard({
  decision,
  readiness,
  baselines,
}: {
  decision: DecisionOutput;
  readiness?: ManualReadiness | null;
  baselines?: ReadinessBaselines;
}) {
  // The user-facing recovery score is computed client-side (see
  // `lib/recoveryScore.ts`) so the number quoted in this card always
  // matches the dashboard ring and the recovery page. Falls back to
  // the backend's `decision.recovery_score` if there's no logged
  // readiness — that path is rare (the dashboard's gating already
  // hides the recovery card without a reading) but keeps the text
  // sensible when a stale decision is rendered.
  const displayScore =
    computeRecoveryScore01(readiness, baselines) ?? decision.recovery_score;
  // Concise top-line summary — translates the engine's structured output
  // into one calm sentence the runner can read at a glance.
  const summary = useMemo(
    () => buildReasoningSummary(decision, displayScore),
    [decision, displayScore],
  );

  // Three canonical factors. We translate the backend's free-form
  // `key_factors` into structured Recovery / Calendar / Progression rows
  // so the reasoning reads as one coherent story rather than a wall of
  // bullets. Each factor renders as a card with an icon, title, and a
  // short explanation.
  const factors = useMemo(
    () => buildReasoningFactors(decision, displayScore),
    [decision, displayScore],
  );

  return (
    <section>
      <p className="text-xs font-medium uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
        Reasoning
      </p>
      <h3 className="mt-2 text-xl font-semibold tracking-tight">
        Why this recommendation
      </h3>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
        {summary}
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {factors.map((f) => (
          <ReasoningFactorCard key={f.key} factor={f} />
        ))}
      </div>
    </section>
  );
}

// --- Reasoning helpers ------------------------------------------------------

type ReasoningTone = "neutral" | "positive" | "caution";

type ReasoningFactor = {
  key: string;
  title: string;
  explanation: string;
  tone: ReasoningTone;
  icon: "heart" | "calendar" | "trend";
};

/**
 * Build a single calm sentence summarising why the engine landed on
 * today's recommendation. Voice shifts with the dominant signal:
 *  • strong recovery + on-plan  → confident ("lean in")
 *  • low recovery / rest day   → supportive ("protect the block")
 *  • tight schedule            → practical ("quality over quantity")
 *  • mid-zone modified         → steady    ("softened to match")
 * Keep it to one sentence — the factor cards below carry the detail.
 */
function buildReasoningSummary(
  decision: DecisionOutput,
  displayScore: number,
): string {
  const score = displayScore;
  const minutes = decision.available_minutes ?? 0;
  const action = decision.selected_action.name.toLowerCase();
  const intensity = decision.selected_action.intensity_modifier;
  const duration = decision.selected_action.duration_modifier;
  const onPlan = intensity >= 1 && duration >= 1;

  // Supportive — readiness wins the priority. A planned rest day is a
  // feature, not a setback; phrase it that way so the runner doesn't
  // read it as falling behind.
  if (action === "rest") {
    return "Readiness is below your baseline today — a planned rest is what protects the next quality session.";
  }
  if (score < 0.6) {
    return `Readiness is low at ${score.toFixed(2)}. Today is dialled back so the rest of your block stays on course — that's the smart trade.`;
  }

  // Confident — recovery is in a strong place and the plan is on. Read
  // it as a green light; this is the kind of day fitness compounds on.
  if (score >= 0.85 && onPlan) {
    return minutes >= 60
      ? `You're primed with ${minutes} minutes free — lean into the planned session. This is a day fitness compounds.`
      : "You're primed today. Window's tight but recovery's there — make the planned session count.";
  }

  // Practical — schedule is the constraint, not the body. Frame the
  // tight window as a focused trade rather than a compromise.
  if (minutes > 0 && minutes < 30) {
    return `Only ${minutes} minutes free today. Today's session was trimmed to fit — quality over quantity, you'll still bank progress.`;
  }

  // Steady — the default for mid-zone, modified, or full-but-not-elite
  // recovery. Calm, factual, no over-promising.
  return minutes > 0
      ? `Recovery is workable with ${minutes} minutes open. The engine softened today's session to match what your body's giving you.`
      : "Recovery is workable but the day is full. Today's session is sized to slot into whatever window opens up.";
}

/**
 * Translate the engine's structured output into three reader-friendly
 * factor cards. Each card has its own tone (neutral/positive/caution)
 * which sets the accent dot colour, and its language shifts with the
 * underlying signal — confident on a strong recovery, supportive when
 * readiness is low, practical when the schedule is tight.
 */
function buildReasoningFactors(
  decision: DecisionOutput,
  displayScore: number,
): ReasoningFactor[] {
  const score = displayScore;
  const state = decision.state;
  const action = decision.selected_action.name.toLowerCase();

  // Recovery — confident when HRV/sleep are aligned, supportive when
  // the body is asking for less. The chosen action wins over the raw
  // score: if the engine called rest, we adopt supportive voice even on
  // a borderline-workable score so the card never contradicts the call.
  const recoveryTone: ReasoningTone =
    action === "rest" || state === "fatigued" || score < 0.6
      ? "caution"
      : state === "recovered" || score >= 0.85
        ? "positive"
        : "neutral";
  const recoveryExplanation =
    action === "rest"
      ? `Recovery ${score.toFixed(2)} — your body's asking for less today. Resting now protects the next quality session.`
      : score >= 0.85
        ? `Recovery ${score.toFixed(2)} — HRV and sleep are dialled in. Green light for quality work today.`
        : score >= 0.6
          ? `Recovery ${score.toFixed(2)} — readiness is workable. The engine kept the stimulus and eased the dose.`
          : `Recovery ${score.toFixed(2)} — your body's asking for less today. Listening now is what keeps the block compounding.`;

  // Calendar load — confident when there's room, practical when the
  // window is tight. Always frame the trade-off, never apologise for it.
  const minutes = decision.available_minutes ?? 0;
  const calendarTone: ReasoningTone =
    minutes >= 60 ? "positive" : minutes >= 30 ? "neutral" : "caution";
  const calendarExplanation =
    minutes <= 0
      ? "No clear window today — today's session is sized to slot into whatever break opens up."
      : minutes >= 60
        ? `${minutes} minutes free — full runway for warm-up, the main set, and a proper cool-down.`
        : minutes >= 30
          ? `${minutes} minutes is a focused window. Streamline the warm-up and step into the main effort early.`
          : `Only ${minutes} minutes today. Right stimulus, smaller dose — that beats a session you can't finish.`;

  // Training progression — surfaces the engine's narrative when present,
  // otherwise falls back to an action-aware summary. Confident when the
  // plan holds, supportive on planned rest, practical when reshaped.
  const progressionFromEngine = decision.key_factors.find(
    (f) => /progress|build|taper|phase|mileage|volume/i.test(f),
  );
  const intensity = decision.selected_action.intensity_modifier;
  const duration = decision.selected_action.duration_modifier;
  const progressionExplanation =
    progressionFromEngine ??
    (action === "rest"
      ? "A planned pause. Rest is what makes the next quality day possible — it keeps you progressing."
      : intensity >= 1 && duration >= 1
        ? "On-plan, on-pace — the kind of session that moves the needle."
        : intensity < 1 || duration < 1
          ? "Reshaped to your current state. Same stimulus family, lower dose — the block stays on track."
          : "Holding course — today matches the prescribed phase.");
  const progressionTone: ReasoningTone =
    intensity < 0.85 || duration < 0.85 ? "caution" : "neutral";

  return [
    {
      key: "recovery",
      title: "Recovery",
      explanation: recoveryExplanation,
      tone: recoveryTone,
      icon: "heart",
    },
    {
      key: "calendar",
      title: "Calendar load",
      explanation: calendarExplanation,
      tone: calendarTone,
      icon: "calendar",
    },
    {
      key: "progression",
      title: "Training progression",
      explanation: progressionExplanation,
      tone: progressionTone,
      icon: "trend",
    },
  ];
}

/**
 * Single factor card. Glass-style surface to match the rest of the
 * dashboard, with a small tinted icon chip on the left and tone-driven
 * accent dot. Intentionally low-contrast so the section reads as
 * supporting context rather than competing with the hero card.
 */
function ReasoningFactorCard({ factor }: { factor: ReasoningFactor }) {
  // Tone is purposely subtle — accent only on the icon chip and dot, so
  // the cards read as one calm row even when one factor is "caution".
  const toneClasses = (() => {
    switch (factor.tone) {
      case "positive":
        return {
          chip: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300",
          dot: "bg-emerald-500 dark:bg-emerald-400",
        };
      case "caution":
        return {
          chip: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300",
          dot: "bg-amber-500 dark:bg-amber-400",
        };
      case "neutral":
      default:
        return {
          chip: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300",
          dot: "bg-blue-500 dark:bg-blue-400",
        };
    }
  })();

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/40 bg-white/70 p-5 backdrop-blur-md dark:border-white/10 dark:bg-neutral-900/60">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${toneClasses.chip}`}
        >
          <ReasoningIcon name={factor.icon} />
        </span>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${toneClasses.dot}`}
          />
          <p className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            {factor.title}
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
        {factor.explanation}
      </p>
    </div>
  );
}

/**
 * Inline SVG icons for the reasoning factor chips. Keeping them in this
 * file (rather than pulling in a new icon library) keeps the dashboard
 * dependency-free and lets the strokes match the muted, hairline feel
 * we use elsewhere.
 */
function ReasoningIcon({ name }: { name: ReasoningFactor["icon"] }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "heart":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common} aria-hidden="true">
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    case "trend":
    default:
      return (
        <svg {...common} aria-hidden="true">
          <path d="M3 17l6-6 4 4 8-8" />
          <path d="M14 7h7v7" />
        </svg>
      );
  }
}

/**
 * Quiet context row at the bottom of the dashboard — surfaces the supporting
 * numbers (available time, recovery score) that the engine used. Two equal
 * cells with primary numbers in `text-4xl font-bold`. The Recovery cell is
 * a click-to-expand disclosure that reveals data-driven insight rows
 * (HRV vs baseline, sleep, resting HR) when the runner taps it.
 */
function ContextRow({
  availableMinutes,
  state,
  baselines,
  readiness,
}: {
  availableMinutes: number | null | undefined;
  state: string;
  baselines?: ReadinessBaselines;
  readiness?: ManualReadiness | null;
}) {
  const [insightsOpen, setInsightsOpen] = useState(false);
  const insights = useMemo(
    () => buildRecoveryInsights(baselines, readiness),
    [baselines, readiness],
  );
  const insightsId = "recovery-insights";

  // Compute the displayed recovery score client-side from the runner's
  // logged readiness + their personal rolling baseline. We deliberately
  // *don't* show the backend's `decision.recovery_score` here because
  // that number is computed against the active scenario's hard-coded
  // baseline — which means it can drift away from what the recovery
  // page (which uses the same shared helper) shows. Routing both
  // surfaces through `computeRecoveryScore01` guarantees they always
  // agree for a given set of inputs.
  const score01 = useMemo(
    () => computeRecoveryScore01(readiness, baselines),
    [readiness, baselines],
  );

  // Recovery score is meaningful only when the runner has logged today's
  // biometrics AND we have at least one component to score from. Without
  // a reading, the helper returns null and we surface an empty-state
  // card instead of a misleading inherited number.
  const hasReadingToday = score01 !== null;
  const recoveryScore = score01 ?? 0;

  // Classify state client-side from the *same* score the ring is
  // showing — so the tone, the label, and the number can never drift
  // apart. The shared helper enforces:
  //
  //   recovered (80–100) → emerald (green)
  //   fatigued  (50–79)  → amber   (yellow)
  //   at_risk   (0–49)   → rose    (red)
  //
  // We prefer the locally computed state over `decision.state` so the
  // engine's view and the user's view of "today" always agree.
  const localState = useMemo(
    () => classifyRecoveryState(readiness, baselines),
    [readiness, baselines],
  );
  const tone = recoveryStateTone(localState);

  return (
    <section>
      <p className="text-xs font-medium uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
        Context
      </p>
      <div className="mt-6 grid items-start gap-4 sm:grid-cols-2">
        <GlassCard className="p-6">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
            Available time
          </p>
          <p className="mt-2 text-4xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">
            {availableMinutes != null && availableMinutes > 0 ? (
              <>
                <AnimatedNumber value={availableMinutes} duration={0.9} />
                <span className="ml-1 text-base font-medium text-neutral-600 dark:text-neutral-400">
                  min
                </span>
              </>
            ) : (
              "—"
            )}
          </p>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            From your calendar today
          </p>
        </GlassCard>

        {/* Recovery card — click-to-expand disclosure. Collapsed view */}
        {/* now leads with an animated progress ring (0–100%) so the */}
        {/* runner can read their state at a glance; expanded view */}
        {/* reveals data-driven insight rows as before. When the runner */}
        {/* hasn't logged any biometrics today, we suppress the score */}
        {/* entirely (resetting every morning) and surface a calm CTA */}
        {/* nudging them to log readiness — the score we'd show would */}
        {/* otherwise be inherited from yesterday's data. */}
        <GlassCard className="overflow-hidden p-0">
          {hasReadingToday ? (
            <button
              type="button"
              onClick={() =>
                insights.length > 0 && setInsightsOpen((v) => !v)
              }
              aria-expanded={insightsOpen}
              aria-controls={insightsId}
              disabled={insights.length === 0}
              className="group flex w-full items-center gap-5 p-6 text-left transition-colors hover:bg-white/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-default disabled:hover:bg-transparent dark:hover:bg-white/[0.03]"
            >
              <ProgressRing
                value={Math.max(0, Math.min(1, recoveryScore))}
                size={84}
                stroke={7}
                tone={tone}
              >
                <AnimatedNumber
                  value={Math.round(recoveryScore * 100)}
                  duration={1.1}
                  className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50"
                />
              </ProgressRing>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
                    Recovery
                  </p>
                  {insights.length > 0 ? (
                    <span
                      aria-hidden="true"
                      className={`text-neutral-400 transition-transform duration-200 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 ${
                        insightsOpen ? "rotate-180" : ""
                      }`}
                    >
                      ▾
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm capitalize text-neutral-700 dark:text-neutral-200">
                  {(localState ?? state).replace("_", " ")}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-500">
                  {insights.length > 0 ? "Tap for insights" : "Log readiness for insights"}
                </p>
              </div>
            </button>
          ) : (
            <Link
              href="/recovery"
              className="group flex w-full items-center gap-5 p-6 text-left transition-colors hover:bg-white/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:hover:bg-white/[0.03]"
            >
              {/* Empty-state ring — same footprint as the live one but */}
              {/* with no fill, so the layout doesn't shift when the */}
              {/* runner logs today's reading. */}
              <ProgressRing value={0} size={84} stroke={7} tone="blue">
                <span
                  aria-hidden="true"
                  className="text-2xl font-semibold tracking-tight text-neutral-300 dark:text-neutral-600"
                >
                  —
                </span>
              </ProgressRing>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
                    Recovery
                  </p>
                  <span
                    aria-hidden="true"
                    className="text-neutral-400 transition-colors group-hover:text-neutral-600 dark:group-hover:text-neutral-300"
                  >
                    →
                  </span>
                </div>
                <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-200">
                  No reading today
                </p>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-500">
                  Log HRV, sleep, or resting HR to unlock today&apos;s score
                </p>
              </div>
            </Link>
          )}
          <AnimatePresence initial={false}>
            {hasReadingToday && insightsOpen && insights.length > 0 && (
              <motion.div
                id={insightsId}
                key="insights"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.28, ease: PREMIUM_EASE }}
                className="overflow-hidden"
              >
                <div className="border-t border-neutral-200/70 px-6 pb-6 pt-4 dark:border-white/10">
                  <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-neutral-500 dark:text-neutral-400">
                    Insights
                  </p>
                  <ul className="mt-3 divide-y divide-neutral-200/60 dark:divide-white/5">
                    {insights.map((insight) => (
                      <RecoveryInsightRow key={insight.key} insight={insight} />
                    ))}
                  </ul>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </GlassCard>
      </div>
    </section>
  );
}

// --- Recovery insights ------------------------------------------------------

type RecoveryInsightTone = "neutral" | "positive" | "caution";

type RecoveryInsight = {
  key: string;
  label: string;
  // Tabular value shown on the right of the row (e.g. "−12%" or "4.5h").
  value: string;
  // One short sentence describing what the value means.
  description: string;
  tone: RecoveryInsightTone;
};

/**
 * Translate today's manually-logged readiness into a small set of
 * data-driven insight rows. Each metric (HRV / sleep / resting HR) is
 * compared against the runner's own rolling 30-day baseline — so when
 * only a single day has been logged, baseline equals today's value and
 * the delta reads as a flat 0%. Voice flexes with the signal:
 *  • near baseline → neutral, factual
 *  • clearly favorable    → positive
 *  • clearly unfavorable  → caution, supportive
 * Returns up to three rows; metrics the runner hasn't logged today (or
 * lack any historical entries to baseline against) are omitted so the
 * disclosure only ever shows real data.
 */
function buildRecoveryInsights(
  baselines: ReadinessBaselines | undefined,
  readiness: ManualReadiness | null | undefined,
): RecoveryInsight[] {
  const rows: RecoveryInsight[] = [];

  // HRV vs 30-day baseline — the strongest single readiness signal.
  // Higher than baseline reads as a green light; lower means ease off.
  if (
    readiness?.hrv !== undefined &&
    baselines?.hrv !== undefined &&
    baselines.hrv > 0
  ) {
    const delta = ((readiness.hrv - baselines.hrv) / baselines.hrv) * 100;
    const rounded = Math.round(delta);
    if (rounded <= -8) {
      rows.push({
        key: "hrv",
        label: "HRV",
        value: `${rounded}%`,
        description: `HRV is ${Math.abs(rounded)}% below your 30-day baseline — a signal to ease the load.`,
        tone: "caution",
      });
    } else if (rounded >= 8) {
      rows.push({
        key: "hrv",
        label: "HRV",
        value: `+${rounded}%`,
        description: `HRV is ${rounded}% above your 30-day baseline — a green light for quality work.`,
        tone: "positive",
      });
    } else {
      rows.push({
        key: "hrv",
        label: "HRV",
        value: rounded === 0 ? "0%" : `${rounded > 0 ? "+" : ""}${rounded}%`,
        description: "HRV is steady around your 30-day baseline.",
        tone: "neutral",
      });
    }
  }

  // Sleep vs 30-day baseline. ±10% is the meaningful band (roughly an
  // hour either way for a typical 8 h sleeper).
  if (
    readiness?.sleep_hours !== undefined &&
    baselines?.sleep_hours !== undefined &&
    baselines.sleep_hours > 0
  ) {
    const sleep = readiness.sleep_hours;
    const delta = ((sleep - baselines.sleep_hours) / baselines.sleep_hours) * 100;
    const rounded = Math.round(delta);
    const label = formatHours(sleep);
    if (rounded <= -10) {
      rows.push({
        key: "sleep",
        label: "Sleep",
        value: label,
        description: `Slept ${label} — ${Math.abs(rounded)}% below your 30-day baseline.`,
        tone: "caution",
      });
    } else if (rounded >= 10) {
      rows.push({
        key: "sleep",
        label: "Sleep",
        value: label,
        description: `Slept ${label} — ${rounded}% above your 30-day baseline.`,
        tone: "positive",
      });
    } else {
      rows.push({
        key: "sleep",
        label: "Sleep",
        value: label,
        description: `Slept ${label} — steady around your 30-day baseline.`,
        tone: "neutral",
      });
    }
  }

  // Resting HR vs 30-day baseline. Lower = better recovery, so the
  // tone is inverted relative to HRV. RHR is more stable than HRV /
  // sleep; ±5% is the band where deviations carry signal (3 bpm on a
  // 60 bpm baseline).
  if (
    readiness?.resting_hr !== undefined &&
    baselines?.resting_hr !== undefined &&
    baselines.resting_hr > 0
  ) {
    const rhr = readiness.resting_hr;
    const delta = ((rhr - baselines.resting_hr) / baselines.resting_hr) * 100;
    const rounded = Math.round(delta);
    if (rounded >= 5) {
      rows.push({
        key: "rhr",
        label: "Resting HR",
        value: `${rhr} bpm`,
        description: `Resting HR is ${rounded}% above your 30-day baseline — body is still under load.`,
        tone: "caution",
      });
    } else if (rounded <= -5) {
      rows.push({
        key: "rhr",
        label: "Resting HR",
        value: `${rhr} bpm`,
        description: `Resting HR is ${Math.abs(rounded)}% below your 30-day baseline — strong aerobic recovery.`,
        tone: "positive",
      });
    } else {
      rows.push({
        key: "rhr",
        label: "Resting HR",
        value: `${rhr} bpm`,
        description: `Resting HR is steady around your 30-day baseline.`,
        tone: "neutral",
      });
    }
  }

  return rows;
}

/**
 * Format sleep hours as "7.5h" / "8h" — strips a trailing ".0" so whole
 * numbers read cleanly while keeping precision when it matters.
 */
function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}h` : `${rounded}h`;
}

/**
 * Single insight row inside the Recovery disclosure. Two-column layout:
 * label + description on the left, tabular value on the right. A small
 * tone-driven dot anchors the row visually without competing with the
 * data — same minimal accent treatment used by the reasoning factors.
 */
function RecoveryInsightRow({ insight }: { insight: RecoveryInsight }) {
  const dotClass = (() => {
    switch (insight.tone) {
      case "positive":
        // Green light — metric is meaningfully better than baseline.
        return "bg-green-500 dark:bg-green-400";
      case "caution":
        // Red — metric is meaningfully worse than baseline; ease off.
        return "bg-red-500 dark:bg-red-400";
      case "neutral":
      default:
        // Yellow — data is logged but sits within the noise band.
        return "bg-yellow-500 dark:bg-yellow-400";
    }
  })();
  const valueClass = (() => {
    switch (insight.tone) {
      case "positive":
        return "text-green-700 dark:text-green-300";
      case "caution":
        return "text-red-700 dark:text-red-300";
      case "neutral":
      default:
        return "text-neutral-700 dark:text-neutral-300";
    }
  })();
  return (
    <li className="flex items-start gap-4 py-3 first:pt-0 last:pb-0">
      <span
        aria-hidden="true"
        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-neutral-500 dark:text-neutral-400">
          {insight.label}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          {insight.description}
        </p>
      </div>
      <p
        className={`shrink-0 text-sm font-semibold tabular-nums ${valueClass}`}
      >
        {insight.value}
      </p>
    </li>
  );
}

function SkeletonState() {
  // Soft shimmering placeholders with the same rounded-3xl + backdrop-blur
  // surface treatment as the real cards, so the loading state feels like
  // part of the design rather than an obvious gap.
  return (
    <div className="space-y-8">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="relative h-40 overflow-hidden rounded-3xl border border-white/40 bg-white/60 backdrop-blur-md dark:border-white/10 dark:bg-neutral-900/50"
        >
          <motion.div
            aria-hidden="true"
            initial={{ x: "-100%" }}
            animate={{ x: "100%" }}
            transition={{
              duration: 1.6,
              ease: "linear",
              repeat: Infinity,
              delay: i * 0.18,
            }}
            className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/50 to-transparent dark:via-white/10"
          />
        </div>
      ))}
    </div>
  );
}

function ScheduleNotice({ checks }: { checks: ScheduleCheck[] }) {
  return (
    <div
      className={`rounded-2xl border p-4 text-xs backdrop-blur-md ${tokens.primary.soft}`}
    >
      <p className="font-medium uppercase tracking-[0.18em]">Scheduled checks</p>
      <ul className="mt-2 space-y-1">
        {checks.map((c) => (
          <li key={c}>• {checkReason(c)}</li>
        ))}
      </ul>
    </div>
  );
}

function InitialPlanBanner({
  saved,
  onDismiss,
}: {
  saved: SavedPlan;
  onDismiss: () => void;
}) {
  const totalChanges = saved.reasoning.length;
  const travelDays = saved.easyOnlyDays.length;
  return (
    <div
      className={`flex items-start justify-between gap-4 rounded-2xl border px-5 py-4 text-sm backdrop-blur-md ${tokens.success.soft}`}
    >
      <div className="min-w-0">
        <p className={`text-xs font-medium uppercase tracking-wider ${tokens.success.text}`}>
          Plan optimized for your calendar
        </p>
        <p className="mt-1 text-xs">
          {totalChanges} adjustment{totalChanges === 1 ? "" : "s"} across the
          plan
          {travelDays > 0
            ? ` · ${travelDays} travel day${travelDays === 1 ? "" : "s"} kept easy`
            : ""}
          . You can review the full plan on the Plan page.
        </p>
      </div>
      <motion.button
        type="button"
        onClick={onDismiss}
        whileHover={{ y: -1 }}
        whileTap={{ y: 0, scale: 0.97 }}
        transition={{ duration: 0.18, ease: PREMIUM_EASE }}
        className={`shrink-0 rounded-full border bg-white/60 px-3 py-1 text-xs font-medium hover:bg-white dark:bg-emerald-900/30 ${tokens.success.border} ${tokens.success.text}`}
      >
        Dismiss
      </motion.button>
    </div>
  );
}

function PlanAdjustmentCard({
  weekChange,
  easyOnlyCount,
  status,
  onAccept,
  onReject,
}: {
  weekChange: WeekChange;
  easyOnlyCount: number;
  status: "pending" | "accepted" | "rejected";
  onAccept: () => void;
  onReject: () => void;
}) {
  const accentBorder =
    status === "accepted"
      ? tokens.success.border
      : status === "rejected"
        ? "border-neutral-200 dark:border-white/10"
        : tokens.warning.border;
  const accentBg =
    status === "accepted"
      ? "bg-emerald-50/40 dark:bg-emerald-950/20"
      : status === "rejected"
        ? "bg-white dark:bg-neutral-900"
        : "bg-amber-50/40 dark:bg-amber-950/20";

  const count = weekChange.adjustments.length;
  const headline =
    count === 0
      ? "No changes — your plan fits this week"
      : `${count} suggested change${count === 1 ? "" : "s"} for this week`;

  return (
    <section
      className={`rounded-3xl border ${accentBorder} ${accentBg} p-6 shadow-sm backdrop-blur-md`}
    >
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p className={`text-xs uppercase tracking-[0.24em] ${tokens.warning.text}`}>
            Calendar-aware suggestion
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">
            {headline}
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            Based on your calendar
            {easyOnlyCount > 0
              ? ` and ${easyOnlyCount} travel day${
                  easyOnlyCount === 1 ? "" : "s"
                }`
              : ""}
            .
          </p>
        </div>
      </div>

      <ul className="mt-5 space-y-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
        {weekChange.adjustments.map((a, i) => (
          <li key={i} className="flex gap-3">
            <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${tokens.warning.dot}`} />
            <span>
              {a.day} · {a.action} — {a.reason}
            </span>
          </li>
        ))}
      </ul>

      {status === "pending" ? (
        <div className="mt-6 flex items-center justify-end gap-3">
          <motion.button
            onClick={onReject}
            whileHover={{ y: -1 }}
            whileTap={{ y: 0, scale: 0.97 }}
            transition={{ duration: 0.18, ease: PREMIUM_EASE }}
            className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-neutral-700 hover:border-black/20 hover:bg-neutral-50 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Keep original
          </motion.button>
          <motion.button
            onClick={onAccept}
            whileHover={{ y: -1 }}
            whileTap={{ y: 0, scale: 0.97 }}
            transition={{ duration: 0.18, ease: PREMIUM_EASE }}
            className={`rounded-full px-4 py-2 text-sm font-medium ${tokens.primary.solid}`}
          >
            Apply changes
          </motion.button>
        </div>
      ) : (
        <div
          className={`mt-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
            status === "accepted"
              ? tokens.success.soft
              : "border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-white/10 dark:bg-neutral-800 dark:text-neutral-300"
          }`}
        >
          {status === "accepted" ? "Applied to this week" : "Original plan kept"}
        </div>
      )}
    </section>
  );
}

// Local helper: ISO YYYY-MM-DD for date keys.
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

