"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";

import { auth } from "@/lib/firebase";
import {
  API_BASE,
  apiFetch,
  fetchDailyReasoning,
  type DailyReasoning,
} from "@/lib/api";
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
import { scenarios, type Scenario } from "@/lib/scenarios";
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
  recordCalendarFailure,
  recordCalendarSync,
} from "@/lib/dataFreshness";
import {
  clearDemoLearning,
  resetDemoData,
  seedDemoData,
} from "@/lib/demoData";
import { trackProductEvent } from "@/lib/instrumentation";
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
import AIStatusBadge from "@/components/AIStatusBadge";
import AthleticImage from "@/components/AthleticImage";
import FloatingMetric from "@/components/FloatingMetric";
import HighlightRail, {
  type HighlightRailItem,
} from "@/components/HighlightRail";
import LiquidSurface from "@/components/LiquidSurface";
import MetricArc from "@/components/MetricArc";
import ProgressRing from "@/components/ProgressRing";
import StrideWave from "@/components/StrideWave";
import {
  buildRecommendationEventId,
  bucketCalendarLoad,
  bucketConfidence,
  bucketRecoveryStatus,
  bucketSelectedAction,
  bucketSleepStatus,
  getRecommendationEvent,
  listLearnedPreferences,
  saveRecommendationEvent,
  updateRecommendationEvent,
} from "@/lib/behaviorStorage";
import type {
  LearnedPreference,
  RecommendationEvent,
} from "@/lib/behaviorTypes";
import { isoDateKey } from "@/lib/readinessStorage";
import { applyManualReadiness } from "@/lib/decisionInputs";
import { areDemoToolsEnabled } from "@/lib/demoTools";

const DEMO_TOOLS_ENABLED = areDemoToolsEnabled();

// Rejection reasons surfaced when a user declines an adjusted
// recommendation. Slugged values get saved to storage so downstream
// analysis can group on them; human labels live alongside in the
// dialog below.
type RejectReason =
  | "too_hard"
  | "too_easy"
  | "not_enough_time"
  | "felt_better"
  | "other";

const REJECT_REASONS: { value: RejectReason; label: string }[] = [
  { value: "too_hard", label: "Too hard" },
  { value: "too_easy", label: "Too easy" },
  { value: "not_enough_time", label: "Not enough time" },
  { value: "felt_better", label: "Felt better than the data suggested" },
  { value: "other", label: "Other" },
];

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

const WEEKDAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
type WeekdayLabel = (typeof WEEKDAY_ORDER)[number];

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
  readinessBaselines?: ReadinessBaselines | null,
  biasTowardOriginal: number = 0,
  learnedPreferences: LearnedPreference[] = [],
  plannedWorkoutOverride?: string | null,
) {
  return {
    biometrics: applyManualReadiness(
      s.biometrics,
      readiness,
      readinessBaselines,
    ),
    // The demo scenario carries a placeholder `planned_workout`. When we
    // can resolve the runner's real plan slot for today we send that
    // instead, so the engine reasons about — and the AI explanation
    // describes — the same session the hero shows (a rest day stays a
    // rest day). Falls back to the scenario string when no plan/goal is
    // available yet.
    training_context: plannedWorkoutOverride
      ? { ...s.training_context, planned_workout: plannedWorkoutOverride }
      : s.training_context,
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
    // Personalization: patterns the runner has explicitly confirmed
    // on the "Kinetic is learning" card. The backend can use these
    // as soft inputs when scoring candidates (e.g. nudge intensity
    // down for an "intensity_tolerance" preference). Always an array;
    // empty when the runner hasn't confirmed anything yet, which is
    // also the case for older clients that don't send this field at
    // all. Newer servers should treat the empty list and a missing
    // field identically.
    learned_preferences: learnedPreferences,
  };
}

/**
 * Convert today's plan slot into a `planned_workout` phrase for the
 * `/decision` request. The engine echoes this string back in
 * `final_workout` and the daily reasoning, so deriving it from the
 * runner's real plan (instead of the demo scenario's placeholder)
 * keeps the AI explanation consistent with the hero headline — e.g.
 * the reasoning reads "rest day" on a day the hero shows as rest,
 * rather than referencing an interval session that isn't scheduled.
 */
function plannedWorkoutLabel(todays: TodaysWorkout): string {
  if (todays.type === "rest") return "rest day";
  const mins = Math.max(1, Math.round(todays.totalDuration));
  switch (todays.type) {
    case "easy":
      return `${mins} min easy run`;
    case "tempo":
      return `${mins} min tempo run`;
    case "intervals":
      return `${mins} min interval run`;
    case "long run":
      return `${mins} min long run`;
    case "race":
      return `${mins} min race effort`;
    default:
      return `${mins} min run`;
  }
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [decision, setDecision] = useState<DecisionOutput | null>(null);
  const [aiReasoning, setAiReasoning] = useState<DailyReasoning | null>(null);
  const [aiReasoningLoading, setAiReasoningLoading] = useState(false);
  const [demoNotice, setDemoNotice] = useState<string | null>(null);
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
  const trackedStaleWarningRef = useRef<string | null>(null);
  // Controls the rejection-reason dialog mounted at the bottom of the
  // page. Opening it defers the actual responseStatus change until the
  // user picks a reason, so a stray click + escape doesn't permanently
  // lock the day into "rejected".
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  // Saved post-workout check-in for today's recommendation, if any.
  // Hydrated from the behavior log on mount so a reload preserves the
  // user's reflection (effort, note, "did you do it?"). The check-in
  // card reads this to decide between the editable form and the
  // collapsed "Logged" chip.
  const [savedActual, setSavedActual] = useState<
    RecommendationEvent["actualWorkout"] | null
  >(null);
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
      setAiReasoning(null);
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
        // Personalization: forward only the preferences the runner has
        // explicitly confirmed on the "Kinetic is learning" card.
        // Unconfirmed (i.e. still-tentative) patterns stay local and
        // never influence the engine — "the user is in control" is the
        // contract that whole flow is built on, so we re-enforce it
        // here on the wire too.
        const confirmedPreferences = listLearnedPreferences().filter(
          (p) => p.userConfirmed === true,
        );
        // Resolve today's real plan slot so the engine decides about the
        // same workout the hero renders. Without a goal (or on a plan-shape
        // edge case) we leave it null and the scenario placeholder stands.
        let plannedWorkoutOverride: string | null = null;
        if (goal) {
          try {
            const todays = getTodaysWorkout(
              goal,
              savedPlan?.weeks,
              undefined,
              new Date(),
              savedPlan?.planStart ? { planStart: savedPlan.planStart } : undefined,
            );
            plannedWorkoutOverride = plannedWorkoutLabel(todays);
          } catch {
            plannedWorkoutOverride = null;
          }
        }
        const res = await apiFetch(`/decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            toRequestBody(
              activeScenario,
              todayReadiness,
              readinessBaselines,
              biasTowardOriginal,
              confirmedPreferences,
              plannedWorkoutOverride,
            ),
          ),
        });
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        // The current backend wraps the engine output as
        //   { decision, ai_reasoning, reasoning_available }
        // so it can piggy-back a cached LLM explanation in the same
        // round trip. Older backends (and the probe scripts) return
        // the bare `DecisionOutput`. Accept both shapes so the page
        // never crashes if the contract drifts again.
        const raw = (await res.json()) as
          | DecisionOutput
          | { decision: DecisionOutput; ai_reasoning?: DailyReasoning | null };
        const data: DecisionOutput =
          "decision" in raw && raw.decision ? raw.decision : (raw as DecisionOutput);
        const cachedReasoning =
          "decision" in raw && raw.decision ? raw.ai_reasoning ?? null : null;
        // Defensive validation: every downstream renderer assumes
        // `selected_action` is present (HeroCard reads
        // `decision.selected_action.name` directly). If the response
        // doesn't carry it — error envelope, partial payload, future
        // shape drift — surface a typed error instead of letting the
        // page crash on the read.
        if (!data || typeof data !== "object" || !data.selected_action) {
          throw new Error("Decision response missing selected_action");
        }
        if (!cancelled) {
          setDecision(data);
          setAiReasoning(cachedReasoning);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load decision");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    user,
    activeScenario,
    todayReadiness,
    readinessBaselines,
    goal,
    savedPlan,
  ]);

  // Hydrate the explanation asynchronously. The local ReasoningCard
  // renders immediately from deterministic decision fields; this call
  // can safely succeed, timeout, or fall back without changing the
  // selected workout or any persisted state.
  useEffect(() => {
    if (!decision || aiReasoning) return;
    let cancelled = false;
    const controller = new AbortController();
    const startedAt = performance.now();
    setAiReasoningLoading(true);
    fetchDailyReasoning(decision, { signal: controller.signal })
      .then((res) => {
        if (!cancelled) {
          setAiReasoning(res);
          trackProductEvent("ai_reasoning_completed", {
            surface: "dashboard_daily",
            outcome: "success",
            ui_fallback_used: false,
            latency_ms: Math.round(performance.now() - startedAt),
            selected_action: decision.selected_action.name,
            staleness_warning_count: decision.staleness_warnings?.length ?? 0,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          trackProductEvent("ai_reasoning_completed", {
            surface: "dashboard_daily",
            outcome: "client_fallback",
            ui_fallback_used: true,
            latency_ms: Math.round(performance.now() - startedAt),
            selected_action: decision.selected_action.name,
            staleness_warning_count: decision.staleness_warnings?.length ?? 0,
          });
        }
        // Keep the deterministic local explanation on failures.
      })
      .finally(() => {
        if (!cancelled) setAiReasoningLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [decision, aiReasoning]);

  // Behavior tracking: log a RecommendationEvent whenever a decision is
  // visible on the dashboard. The id is derived from today's date + the
  // planned + recommended workout strings, so re-renders, refetches
  // and reloads on the same day with the same recommendation are all
  // deduped against the existing record. Once a row exists, this
  // effect never overwrites it — user response and actualWorkout
  // updates are applied through separate `updateRecommendationEvent`
  // calls from the accept/reject/log handlers.
  //
  // The id + labels are memoized so the accept/reject handlers below
  // can patch the same event without re-deriving the id ad-hoc.
  const recommendationEvent = useMemo(() => {
    if (!decision || !goal) return null;
    // Build the planned and recommended labels the same way the hero
    // card does, so the logged event matches what the user actually
    // saw. `getTodaysWorkout` without an action gives the unmodified
    // plan slot; with the engine's action it gives the recommended
    // workout (which may be a rest day, shortened session, etc).
    let plannedLabel = "";
    let recommendedLabel = "";
    try {
      const planArg = savedPlan?.weeks;
      const planStartArg = savedPlan?.planStart
        ? { planStart: savedPlan.planStart }
        : undefined;
      plannedLabel = getTodaysWorkout(
        goal,
        planArg,
        undefined,
        new Date(),
        planStartArg,
      ).headline;
      recommendedLabel = getTodaysWorkout(
        goal,
        planArg,
        decision.selected_action,
        new Date(),
        planStartArg,
      ).headline;
    } catch {
      // Plan-shape edge cases (e.g. goal saved but plan not yet
      // generated) — fall back to the backend's free-text label so we
      // still produce a useful record.
      plannedLabel = plannedLabel || decision.final_workout;
      recommendedLabel = recommendedLabel || decision.final_workout;
    }
    const date = isoDateKey();
    return {
      id: buildRecommendationEventId(date, plannedLabel, recommendedLabel),
      date,
      plannedLabel,
      recommendedLabel,
    };
  }, [decision, goal, savedPlan]);

  // Does today's final recommendation resolve to a rest day? Uses the
  // SAME plan lookup the hero headline does (with the engine's action
  // applied), so the reasoning copy never describes a "quality session"
  // on a day the hero shows as rest. Covers both an engine-chosen rest
  // and a scheduled rest slot the engine simply proceeded with.
  const todayIsRestDay = useMemo(() => {
    if (!goal || !decision) return false;
    try {
      return (
        getTodaysWorkout(
          goal,
          savedPlan?.weeks,
          decision.selected_action,
          new Date(),
          savedPlan?.planStart ? { planStart: savedPlan.planStart } : undefined,
        ).type === "rest"
      );
    } catch {
      return false;
    }
  }, [goal, savedPlan, decision]);

  useEffect(() => {
    if (!decision) return;
    const warnings = decision.staleness_warnings ?? [];
    if (warnings.length === 0) return;
    const key = `${recommendationEvent?.id ?? decision.final_workout}:${warnings.length}`;
    if (trackedStaleWarningRef.current === key) return;
    trackedStaleWarningRef.current = key;
    trackProductEvent("stale_data_warning_shown", {
      warning_count: warnings.length,
      has_calendar_warning: warnings.some((w) => /calendar/i.test(w)),
      has_recovery_warning: warnings.some((w) => /recovery|readiness/i.test(w)),
      selected_action: decision.selected_action.name,
      confidence_bucket: bucketConfidence(decision.confidence),
    });
  }, [decision, recommendationEvent]);

  useEffect(() => {
    if (!recommendationEvent || !decision) return;
    const recoveryState = classifyRecoveryState(
      todayReadiness,
      readinessBaselines,
    );
    saveRecommendationEvent({
      id: recommendationEvent.id,
      date: recommendationEvent.date,
      plannedWorkout: recommendationEvent.plannedLabel,
      recommendedWorkout: recommendationEvent.recommendedLabel,
      selectedAction: bucketSelectedAction(decision.selected_action.name),
      confidence: bucketConfidence(decision.confidence),
      recoveryScore: decision.recovery_score,
      availableMinutes: decision.available_minutes,
      userResponse: null,
      context: {
        calendarLoad: bucketCalendarLoad(decision.available_minutes),
        sleepStatus: bucketSleepStatus(
          todayReadiness?.sleep_hours,
          readinessBaselines.sleep_hours,
        ),
        recoveryStatus: bucketRecoveryStatus(recoveryState),
      },
    });
    // Intentionally omit `todayReadiness` / `readinessBaselines` from the
    // dep list: the event's id is anchored to date + planned + recommended
    // labels, so context-only changes (e.g. a freshly logged readiness)
    // would otherwise re-fire saveRecommendationEvent — which is a no-op
    // for an existing id but adds unnecessary churn. The dependencies we
    // do listen on cover every input that can change the id itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommendationEvent, decision]);

  // Hydrate the post-workout check-in form from storage whenever the
  // active recommendation changes (new day, plan rebuilt, etc.). The
  // saveRecommendationEvent effect above runs first, so by the time
  // this lookup fires there is guaranteed to be a record under this
  // id when one is appropriate. We only read `actualWorkout` — every
  // other field of the event is owned by other effects/handlers.
  useEffect(() => {
    if (!recommendationEvent) {
      setSavedActual(null);
      return;
    }
    const existing = getRecommendationEvent(recommendationEvent.id);
    setSavedActual(existing?.actualWorkout ?? null);
  }, [recommendationEvent]);

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
        // When the backend's Google OAuth has expired (or the user
        // never authorized the calendar at all) both endpoints return
        // 503. Stamp a failure so the Profile page can swap the
        // misleading "Last synced X days ago" subtitle for a
        // "Couldn't reach Google · Reconnect" affordance. We don't
        // surface anything inline on the dashboard — the saved plan
        // path below still drives the UI — but the Profile becomes
        // the source of truth for "calendar is offline right now".
        if (!availRes.ok || !travelRes.ok) {
          recordCalendarFailure();
          trackProductEvent("calendar_sync_completed", {
            outcome: "failed",
            availability_ok: availRes.ok,
            travel_ok: travelRes.ok,
            horizon_days: horizonDays,
            travel_horizon_days: travelHorizon,
          });
          return;
        }
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

        trackProductEvent("calendar_sync_completed", {
          outcome: "success",
          horizon_days: horizonDays,
          travel_horizon_days: travelHorizon,
          week_count: base.length,
          has_changes: fresh.hasChanges,
          total_changes: fresh.totalChanges,
          easy_only_day_count: fresh.easyOnlyDays.length,
        });

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
          if (fresh.hasChanges) {
            trackProductEvent("weekly_plan_recalibrated", {
              surface: "dashboard_initial_generation",
              outcome: "generated",
              total_changes: fresh.totalChanges,
              easy_only_day_count: fresh.easyOnlyDays.length,
            });
          }
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
        // Stamp a failure so the Profile page can show the runner
        // that the live calendar isn't reachable right now — the
        // most common cause is the backend's Google OAuth token
        // having expired.
        recordCalendarFailure();
        trackProductEvent("calendar_sync_completed", {
          outcome: "failed",
          availability_ok: false,
          travel_ok: false,
        });
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
    trackProductEvent("weekly_plan_recalibrated", {
      surface: "dashboard_suggestion",
      outcome: "accepted",
      total_changes: pending.proposed.totalChanges,
      week_adjustment_count: pending.weekChange.adjustments.length,
      easy_only_day_count: pending.proposed.easyOnlyDays.length,
    });
  }

  function rejectSuggestion() {
    if (pending) {
      trackProductEvent("weekly_plan_recalibrated", {
        surface: "dashboard_suggestion",
        outcome: "rejected",
        total_changes: pending.proposed.totalChanges,
        week_adjustment_count: pending.weekChange.adjustments.length,
        easy_only_day_count: pending.proposed.easyOnlyDays.length,
      });
    }
    setPending(null);
    setSuggestionStatus("rejected");
  }

  function handleSeedDemoData(kind: "seed" | "reset") {
    const result = kind === "reset" ? resetDemoData() : seedDemoData();
    trackProductEvent("demo_data_control_used", {
      action: kind,
      plan_weeks: result.planWeeks,
      readiness_entries: result.readinessEntries,
      recommendation_events: result.recommendationEvents,
    });
    setDemoNotice(
      kind === "reset"
        ? `Demo reset: ${result.planWeeks} weeks seeded.`
        : `Demo seeded: ${result.planWeeks} weeks, ${result.recommendationEvents} behavior events.`,
    );
    window.setTimeout(() => window.location.reload(), 450);
  }

  function handleClearDemoLearning() {
    clearDemoLearning();
    trackProductEvent("demo_data_control_used", {
      action: "clear_learning",
    });
    setDemoNotice("Learned preferences cleared.");
  }

  if (!authChecked) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-neutral-500">Loading…</p>
      </main>
    );
  }

  return (
    <PageContainer className="relative mx-auto w-full max-w-6xl px-3 py-5 sm:px-4 sm:py-10">
      {/* Background motion (drifting gradient blobs + topographic texture) */}
      {/* is mounted globally in app/layout.tsx so every page shares the */}
      {/* same wash. Nothing to render here. */}

      {/* Stagger every section in from below for a calm, cascading entrance. */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={containerVariants}
        className="space-y-6 sm:space-y-8"
      >
        <motion.div variants={itemVariants}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <Greeting profile={profile} goal={goal} />
            <AIStatusBadge className="self-start" />
          </div>
        </motion.div>

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
                  trackProductEvent("recommendation_response", {
                    response: "accepted",
                    selected_action: decision.selected_action.name,
                    confidence_bucket: bucketConfidence(decision.confidence),
                    staleness_warning_count: decision.staleness_warnings?.length ?? 0,
                  });
                  if (recommendationEvent) {
                    updateRecommendationEvent(recommendationEvent.id, {
                      userResponse: "accepted",
                    });
                  }
                }}
                onReject={() => {
                  // Defer the responseStatus change until the user
                  // picks a reason in the dialog. This keeps the
                  // accept/reject row visible behind the modal so
                  // dismissing returns the user to a clean state.
                  setRejectDialogOpen(true);
                }}
                onMarkCompleted={() => {
                  setCompletionStatus("completed");
                  setTodayCompletion({
                    completionStatus: "completed",
                    responseStatus,
                  });
                  const offeredAdjustment =
                    decision.selected_action.name !== "proceed";
                  trackProductEvent("recommendation_completion", {
                    status: "completed",
                    response_status: responseStatus,
                    selected_action: decision.selected_action.name,
                    accepted_adjustment: offeredAdjustment
                      ? responseStatus === "accepted"
                      : null,
                  });
                  if (goal && savedPlan) {
                    // Only attach the acceptedAdjustment flag when the engine
                    // actually offered an adjustment to consider. Otherwise
                    // there was nothing to accept/reject, so the field stays
                    // unset rather than misleadingly logging "false".
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
                  const offeredAdjustment =
                    decision.selected_action.name !== "proceed";
                  trackProductEvent("recommendation_completion", {
                    status: "skipped",
                    response_status: responseStatus,
                    selected_action: decision.selected_action.name,
                    accepted_adjustment: offeredAdjustment
                      ? responseStatus === "accepted"
                      : null,
                  });
                  if (goal && savedPlan) {
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

            <AnimatePresence initial={false}>
              {completionStatus !== "pending" && recommendationEvent && (
                <motion.div
                  key="post-workout-checkin"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22, ease: PREMIUM_EASE }}
                >
                  <PostWorkoutCheckIn
                    defaultCompleted={completionStatus === "completed"}
                    saved={savedActual ?? null}
                    onEdit={() => setSavedActual(null)}
                    onSubmit={({ completed, perceivedEffort, note }) => {
                      const patch = {
                        completed,
                        ...(typeof perceivedEffort === "number"
                          ? { perceivedEffort }
                          : {}),
                        ...(note ? { note } : {}),
                      };
                      const merged = updateRecommendationEvent(
                        recommendationEvent.id,
                        { actualWorkout: patch },
                      );
                      trackProductEvent("post_workout_checkin_saved", {
                        completed,
                        has_effort: typeof perceivedEffort === "number",
                        has_user_reflection: Boolean(note),
                        perceived_effort:
                          typeof perceivedEffort === "number"
                            ? perceivedEffort
                            : null,
                      });
                      setSavedActual(merged?.actualWorkout ?? patch);
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <motion.section variants={itemVariants}>
              <DashboardHighlightRail
                decision={decision}
                week={savedPlan?.weeks[0] ?? null}
              />
            </motion.section>

            <motion.section variants={itemVariants}>
              <ReasoningCard
                decision={decision}
                readiness={todayReadiness}
                baselines={readinessBaselines}
                aiReasoning={aiReasoning}
                reasoningLoading={aiReasoningLoading}
                restDay={todayIsRestDay}
              />
            </motion.section>

            {savedPlan && savedPlan.weeks[0] && (
              <motion.section variants={itemVariants}>
                <ThisWeekStrip
                  week={savedPlan.weeks[0]}
                  planStart={savedPlan.planStart}
                />
              </motion.section>
            )}

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

        {DEMO_TOOLS_ENABLED && (
          <motion.div variants={itemVariants}>
            <DemoControls
              notice={demoNotice}
              onSeed={() => handleSeedDemoData("seed")}
              onReset={() => handleSeedDemoData("reset")}
              onClearLearning={handleClearDemoLearning}
            />
          </motion.div>
        )}
      </motion.div>

      {/* Rejection-reason dialog. Mounted at the page root so the */}
      {/* backdrop covers the full viewport. Submission writes both */}
      {/* responseStatus + rejectionReason to the behavior log, then */}
      {/* advances the dashboard's two-step CTA to the completion step. */}
      <RejectReasonDialog
        open={rejectDialogOpen}
        onClose={() => setRejectDialogOpen(false)}
        onSelect={(reason) => {
          setRejectDialogOpen(false);
          setResponseStatus("rejected");
          setTodayCompletion({ responseStatus: "rejected" });
          trackProductEvent("recommendation_response", {
            response: "rejected",
            rejection_reason: reason,
            selected_action: decision?.selected_action.name ?? "unknown",
            confidence_bucket: decision
              ? bucketConfidence(decision.confidence)
              : "unknown",
            staleness_warning_count: decision?.staleness_warnings?.length ?? 0,
          });
          if (recommendationEvent) {
            updateRecommendationEvent(recommendationEvent.id, {
              userResponse: "rejected",
              rejectionReason: reason,
            });
          }
        }}
      />
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
    <header className="max-w-3xl">
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400">
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 rounded-full bg-gradient-to-br from-sky-400 to-blue-600"
        />
        Kinetic · Today
      </p>
      <h1 className="mt-2 text-balance text-[2rem] font-semibold leading-[1.03] text-neutral-950 sm:text-5xl lg:text-[3.65rem] dark:text-neutral-50">
        {headline}
      </h1>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
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
      <div className="mt-2 -ml-1" aria-hidden="true">
        <StrideWave width={280} height={30} tone="blue" loop />
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

function DemoControls({
  notice,
  onSeed,
  onReset,
  onClearLearning,
}: {
  notice: string | null;
  onSeed: () => void;
  onReset: () => void;
  onClearLearning: () => void;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-black/5 bg-white/45 px-4 py-3 text-sm shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-neutral-900/45 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-blue-500" aria-hidden="true" />
        <span className="truncate text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
          Demo tools
        </span>
        {notice && (
          <span
            role="status"
            aria-live="polite"
            className="hidden truncate text-xs text-neutral-500 dark:text-neutral-400 sm:inline"
          >
            {notice}
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:flex sm:shrink-0">
        <button
          type="button"
          onClick={onSeed}
          className={`rounded-full border border-black/10 bg-white/80 px-3 py-2 text-xs font-medium text-neutral-700 hover:border-black/20 hover:bg-white dark:border-white/15 dark:bg-neutral-950/50 dark:text-neutral-200 dark:hover:bg-neutral-900 ${tokens.motion}`}
        >
          Seed
        </button>
        <button
          type="button"
          onClick={onReset}
          className={`rounded-full border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800 hover:bg-blue-100 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200 dark:hover:bg-blue-950/50 ${tokens.motion}`}
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onClearLearning}
          className={`rounded-full border border-black/10 bg-white/80 px-3 py-2 text-xs font-medium text-neutral-700 hover:border-black/20 hover:bg-white dark:border-white/15 dark:bg-neutral-950/50 dark:text-neutral-200 dark:hover:bg-neutral-900 ${tokens.motion}`}
        >
          Clear learning
        </button>
      </div>
      {notice && (
        <span
          role="status"
          aria-live="polite"
          className="text-xs text-neutral-500 dark:text-neutral-400 sm:hidden"
        >
          {notice}
        </span>
      )}
    </section>
  );
}

function DashboardHighlightRail({
  decision,
  week,
}: {
  decision: DecisionOutput;
  week: PlanWeek | null;
}) {
  const recoveryPct = Math.round(
    Math.max(0, Math.min(1, decision.recovery_score)) * 100,
  );
  const items = useMemo<HighlightRailItem[]>(() => {
    const weekItem: HighlightRailItem = week
      ? {
          label: "Week",
          value: `${weekMileage(week)} mi`,
          detail: `${week.workouts.length} run${
            week.workouts.length === 1 ? "" : "s"
          } · ${week.phase}`,
          tone: "neutral",
        }
      : {
          label: "Confidence",
          value: `${Math.round(decision.confidence * 100)}%`,
          detail: "Grounded to today's decision",
          tone: "neutral",
        };

    return [
      {
        label: "Action",
        value: formatActionLabel(decision.selected_action.name),
        detail: actionMetricDetail(decision.selected_action.name),
        tone: highlightToneForAction(decision.selected_action.name),
      },
      {
        label: "Recovery",
        value: `${recoveryPct}%`,
        detail: formatStateLabel(decision.state),
        tone: highlightToneForRecovery(decision.recovery_score),
      },
      {
        label: "Window",
        value: `${decision.available_minutes} min`,
        detail: "Available today",
        tone: highlightToneForAvailability(decision.available_minutes),
      },
      weekItem,
    ];
  }, [decision, recoveryPct, week]);

  return (
    <HighlightRail
      eyebrow="Signal check"
      title="What shaped today"
      items={items}
      className="pt-1"
    />
  );
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
  const byDay = useMemo(() => {
    const map = new Map<WeekdayLabel, Workout>();
    for (const w of week.workouts) {
      const key = (w.day as WeekdayLabel) ?? null;
      if (key && WEEKDAY_ORDER.includes(key)) map.set(key, w);
    }
    return map;
  }, [week.workouts]);

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString("en-US", { weekday: "short" }) as WeekdayLabel;
  }, []);

  // Total mileage + run count summary — surfaces the volume at a glance.
  const totalMiles = useMemo(
    () => weekMileage(week),
    [week]
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
        {WEEKDAY_ORDER.map((day) => {
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
      // "Reps" keeps the chip label short enough to fit the narrow 7-up
      // day grid at 375px; "Intervals" (9 chars) overflowed the chip.
      return "Reps";
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

function weekMileage(week: PlanWeek): number {
  return (
    Math.round(
      week.workouts.reduce((sum, workout) => sum + (workout.distance ?? 0), 0) *
        10,
    ) / 10
  );
}

function highlightToneForAction(
  action: string,
): NonNullable<HighlightRailItem["tone"]> {
  if (action === "proceed") return "emerald";
  if (action === "modify" || action === "rest") return "amber";
  return "blue";
}

function highlightToneForRecovery(
  score: number,
): NonNullable<HighlightRailItem["tone"]> {
  if (score >= 0.75) return "emerald";
  if (score >= 0.5) return "amber";
  return "amber";
}

function highlightToneForAvailability(
  minutes: number,
): NonNullable<HighlightRailItem["tone"]> {
  if (minutes >= 75) return "emerald";
  if (minutes >= 35) return "blue";
  return "amber";
}


// --- Cards ------------------------------------------------------------------

/**
 * Hero card: large "Today's Recommendation" panel with the workout name,
 * supporting metrics (distance · duration · note), the structured workout
 * breakdown, a confidence callout, and the primary Accept CTA.
 *
 * Visual: photo-backed LiquidSurface stage with the recommendation and
 * deterministic metrics sharing one primary product moment.
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
  const recoveryPct = Math.round(Math.max(0, Math.min(1, decision.recovery_score)) * 100);
  const recoveryTone = recoveryToneForScore(decision.recovery_score);
  const availabilityTone = availabilityToneForMinutes(decision.available_minutes);
  const actionTone = actionMetricTone(decision.selected_action.name);
  const actionLabel = formatActionLabel(decision.selected_action.name);
  const stageTitle =
    todays?.type === "rest" || decision.selected_action.name === "rest"
      ? "Recovery is training."
      : "Today’s work, staged.";
  const stageSubtitle = `${actionLabel} call · ${decision.available_minutes} min window`;

  // The engine surfaces three top-level actions: "proceed" (run the plan
  // as-is), "modify" (change intensity/duration), and "rest". Only the
  // last two represent an actual adjustment the runner needs to weigh
  // in on. When the engine says "proceed", there's nothing to
  // accept/reject — we should jump straight to "did you do it?".
  const needsAdjustment = decision.selected_action.name !== "proceed";

  return (
    <LiquidSurface className="rounded-[1.5rem] p-2 sm:rounded-[2.5rem] sm:p-4 lg:p-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(16rem,0.82fr)_minmax(0,1.18fr)] lg:items-stretch">
        <AthleticImage
          src="/images/athletic/track-lanes.jpg"
          alt="Runner on blue track lanes at dawn"
          eyebrow="Training stage"
          title={stageTitle}
          subtitle={stageSubtitle}
          className="h-[20rem] min-[360px]:h-[17rem] sm:h-[22rem] lg:h-full lg:min-h-[34rem]"
          rounded="rounded-[1.15rem] sm:rounded-[2rem]"
          focus="center"
          priority
        >
          <div className="mt-4 grid max-w-sm grid-cols-2 gap-2">
            <div className="rounded-2xl border border-white/15 bg-white/15 p-3 text-white shadow-[0_18px_38px_-28px_rgb(2_6_23/0.8)] backdrop-blur-md">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/65">
                Ready
              </p>
              <p className="mt-1 text-2xl font-semibold leading-none tabular-nums">
                {recoveryPct}%
              </p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/15 p-3 text-white shadow-[0_18px_38px_-28px_rgb(2_6_23/0.8)] backdrop-blur-md">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/65">
                Window
              </p>
              <p className="mt-1 text-2xl font-semibold leading-none tabular-nums">
                {decision.available_minutes}
                <span className="ml-1 text-xs font-medium uppercase tracking-[0.14em] text-white/65">
                  min
                </span>
              </p>
            </div>
          </div>
        </AthleticImage>

        <div className="flex min-w-0 flex-col justify-between px-1 py-2 sm:p-4 lg:p-5">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(16rem,0.72fr)] xl:items-start">
        {/* Left: workout */}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full bg-gradient-to-br from-sky-400 to-blue-600"
            />
            Today&apos;s recommendation
          </p>
          <h2 className="mt-3 text-balance text-[2rem] font-semibold capitalize leading-[1.03] text-neutral-950 sm:text-5xl dark:text-neutral-50">
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

        {/* Right: stage metrics — readiness gauge + floating capsules. */}
        <div className="rounded-[1.75rem] border border-white/65 bg-white/58 p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.7),0_24px_50px_-30px_rgb(30_58_138/0.5)] backdrop-blur-md dark:border-white/10 dark:bg-neutral-950/34 sm:p-5">
          {/* Readiness gauge — the centrepiece "speedometer" arc. */}
          <div className="flex flex-col items-center">
            <MetricArc
              value={decision.recovery_score}
              size={208}
              stroke={15}
              tone={recoveryTone}
            >
              <AnimatedNumber
                value={recoveryPct}
                suffix="%"
                className="text-[2.45rem] font-semibold leading-none text-neutral-900 dark:text-neutral-50"
              />
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                Ready
              </p>
            </MetricArc>
            <div className="mt-2 text-center">
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
                Training state
              </p>
              <p className="mt-1 text-lg font-semibold leading-tight text-neutral-950 dark:text-neutral-50">
                {formatStateLabel(decision.state)}
              </p>
              <p className="mx-auto mt-1 max-w-[17rem] text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                {decision.key_factors[0] ?? "Deterministic engine result"}
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <FloatingMetric
              label="Window"
              value={<AnimatedNumber value={decision.available_minutes} />}
              unit="min"
              detail="Available today"
              tone={availabilityTone}
            />
            <FloatingMetric
              label="Action"
              value={actionLabel}
              detail={actionMetricDetail(decision.selected_action.name)}
              tone={actionTone}
              valueClassName="text-xl leading-tight"
            />
          </div>

          <div className="mt-3">
            <ConfidenceBadge decision={decision} />
          </div>
        </div>
      </div>

      {todays && todays.segments.length > 0 ? (
        <WorkoutBreakdown segments={todays.segments} />
      ) : null}

      {/* Primary CTA — two-step flow:
          1. Choose which workout the runner is doing (accept adjustment / keep original).
          2. After choosing, confirm whether they completed or skipped it. */}
      <div className="mt-6 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
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
        </div>
      </div>
    </LiquidSurface>
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

function recoveryToneForScore(
  score: number,
): "blue" | "emerald" | "amber" | "rose" {
  if (score >= 0.75) return "emerald";
  if (score >= 0.5) return "amber";
  return "rose";
}

function availabilityToneForMinutes(
  minutes: number,
): "blue" | "emerald" | "amber" | "rose" | "neutral" {
  if (minutes >= 75) return "emerald";
  if (minutes >= 45) return "blue";
  if (minutes >= 25) return "amber";
  return "rose";
}

function actionMetricTone(
  action: string,
): "blue" | "emerald" | "amber" | "rose" | "neutral" {
  if (action === "proceed") return "emerald";
  if (action === "rest") return "rose";
  if (action === "modify") return "amber";
  return "blue";
}

function formatActionLabel(action: string): string {
  if (action === "proceed") return "Proceed";
  if (action === "modify") return "Modify";
  if (action === "rest") return "Rest";
  return action
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function actionMetricDetail(action: string): string {
  if (action === "proceed") return "Plan fits";
  if (action === "modify") return "Adjusted today";
  if (action === "rest") return "Recovery first";
  return "Engine choice";
}

function formatStateLabel(state: string): string {
  if (state === "recovered") return "Recovered";
  if (state === "fatigued") return "Fatigued";
  if (state === "at_risk") return "At risk";
  return formatActionLabel(state);
}

function WorkoutBreakdown({ segments }: { segments: WorkoutSegment[] }) {
  return (
    <div className="mt-6 overflow-x-auto rounded-2xl border border-black/5 bg-white/45 backdrop-blur dark:border-white/10 dark:bg-neutral-950/30">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <thead>
          <tr className="bg-white/60 text-[11px] uppercase tracking-[0.18em] text-neutral-500 dark:bg-neutral-900/40 dark:text-neutral-400">
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

/**
 * Rejection-reason dialog. Shown when the runner declines an adjusted
 * recommendation, before we commit `responseStatus = "rejected"` to
 * state. Picking a reason confirms the rejection; pressing Esc, the
 * Cancel link, or the backdrop dismisses without locking in.
 *
 * Visual: small GlassCard, centered, with a dim+blur backdrop. Reason
 * options are stacked vertical pills that match the rest of the
 * dashboard's button system. One-click flow — selecting a reason both
 * confirms and writes; no extra Submit step.
 */
function RejectReasonDialog({
  open,
  onSelect,
  onClose,
}: {
  open: boolean;
  onSelect: (reason: RejectReason) => void;
  onClose: () => void;
}) {
  // Esc to dismiss + lock body scroll while open. Both effects are
  // bypassed when the dialog isn't mounted, so there's no listener or
  // style mutation in the steady state.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="reject-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-dialog-title"
        >
          <motion.div
            key="reject-card"
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.22, ease: PREMIUM_EASE }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm"
          >
            <GlassCard interactive={false} className="p-6 sm:p-7">
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                A quick note
              </p>
              <h3
                id="reject-dialog-title"
                className="mt-2 text-xl font-semibold leading-tight text-neutral-900 dark:text-neutral-50"
              >
                Why keep the original?
              </h3>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                Helps Kinetic learn what works for you.
              </p>
              <div className="mt-5 flex flex-col gap-2">
                {REJECT_REASONS.map((r) => (
                  <motion.button
                    key={r.value}
                    type="button"
                    onClick={() => onSelect(r.value)}
                    whileHover={{ y: -1 }}
                    whileTap={{ y: 0, scale: 0.98 }}
                    transition={{ duration: 0.15, ease: PREMIUM_EASE }}
                    className="rounded-xl border border-black/10 bg-white/70 px-4 py-3 text-left text-sm font-medium text-neutral-800 backdrop-blur hover:border-black/20 hover:bg-white hover:shadow-sm dark:border-white/10 dark:bg-neutral-900/40 dark:text-neutral-200 dark:hover:bg-neutral-900/60"
                  >
                    {r.label}
                  </motion.button>
                ))}
              </div>
              <button
                type="button"
                onClick={onClose}
                className={`mt-5 w-full text-xs font-medium text-neutral-500 underline-offset-4 hover:text-neutral-800 hover:underline dark:text-neutral-400 dark:hover:text-neutral-200 ${tokens.motion}`}
              >
                Cancel
              </button>
            </GlassCard>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Post-workout check-in — a small, opinionated form for capturing
 * how the day actually went. Three fields only:
 *
 *   1. Did you complete the workout? (yes/no)
 *   2. Perceived effort (1-10)
 *   3. Optional note
 *
 * Submission patches `actualWorkout` on the matching
 * RecommendationEvent. Once saved, the form collapses into a quiet
 * confirmation chip with an Edit affordance so the surface area on
 * the dashboard stays small.
 *
 * Design intent: this should read as a 10-second check-in, never a
 * form. The yes/no defaults to whatever the HeroCard recorded so most
 * users land here with only a single number to pick.
 */
function PostWorkoutCheckIn({
  defaultCompleted,
  saved,
  onSubmit,
  onEdit,
}: {
  /** Pre-fills the yes/no toggle from the HeroCard's completion choice. */
  defaultCompleted: boolean;
  /** Previously saved actualWorkout, if any. When present, renders the collapsed chip. */
  saved: NonNullable<RecommendationEvent["actualWorkout"]> | null;
  onSubmit: (input: {
    completed: boolean;
    perceivedEffort?: number;
    note?: string;
  }) => void;
  /** Switch the chip back into the editable form. */
  onEdit: () => void;
}) {
  const [completed, setCompleted] = useState<boolean>(
    saved?.completed ?? defaultCompleted,
  );
  const [effort, setEffort] = useState<number | null>(
    saved?.perceivedEffort ?? null,
  );
  const [note, setNote] = useState<string>(saved?.note ?? "");

  // Collapsed state: a quiet pill summarising what was logged, plus
  // an Edit affordance. Hidden under AnimatePresence in the parent
  // alongside the editable form so transitions stay smooth.
  if (saved) {
    return (
      <GlassCard
        interactive={false}
        className="flex items-center justify-between gap-4 p-5 sm:p-6"
      >
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
            Check-in logged
          </p>
          <p className="mt-1.5 truncate text-sm text-neutral-700 dark:text-neutral-300">
            {saved.completed ? "Completed" : "Skipped"}
            {typeof saved.perceivedEffort === "number" ? (
              <>
                <span className="mx-2 text-neutral-300 dark:text-neutral-600">
                  ·
                </span>
                Effort{" "}
                <span className="font-semibold text-neutral-900 dark:text-neutral-100 tabular-nums">
                  {saved.perceivedEffort}
                </span>
                /10
              </>
            ) : null}
            {saved.note ? (
              <>
                <span className="mx-2 text-neutral-300 dark:text-neutral-600">
                  ·
                </span>
                <span className="italic text-neutral-600 dark:text-neutral-400">
                  &ldquo;{saved.note}&rdquo;
                </span>
              </>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className={`shrink-0 text-xs font-medium text-neutral-500 underline-offset-4 hover:text-neutral-800 hover:underline dark:text-neutral-400 dark:hover:text-neutral-200 ${tokens.motion}`}
        >
          Edit
        </button>
      </GlassCard>
    );
  }

  // Editable form. Stays inert-looking until the user lands on a
  // perceived effort number — Save is disabled until then so accidental
  // submits don't write a useless record.
  const canSubmit = effort !== null;

  return (
    <GlassCard interactive={false} className="p-6 sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
            Quick check-in
          </p>
          <h3 className="mt-2 text-xl font-semibold leading-tight text-neutral-900 dark:text-neutral-50">
            How did it go?
          </h3>
        </div>
      </div>

      {/* Yes / No */}
      <div className="mt-5 flex gap-2">
        <CheckInToggle
          active={completed}
          onClick={() => setCompleted(true)}
          label="I did it"
        />
        <CheckInToggle
          active={!completed}
          onClick={() => setCompleted(false)}
          label="Skipped"
        />
      </div>

      {/* Perceived effort — only meaningful when they completed the workout. */}
      {completed ? (
        <div className="mt-6">
          <div className="flex items-baseline justify-between">
            <label className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
              Perceived effort
            </label>
            <span className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
              {effort ?? "—"}
              <span className="text-neutral-400 dark:text-neutral-500">/10</span>
            </span>
          </div>
          <div className="mt-2 grid grid-cols-10 gap-1.5">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
              const isActive = effort === n;
              return (
                <motion.button
                  key={n}
                  type="button"
                  onClick={() => setEffort(n)}
                  whileHover={{ y: -1 }}
                  whileTap={{ y: 0, scale: 0.95 }}
                  transition={{ duration: 0.12, ease: PREMIUM_EASE }}
                  className={`flex h-10 items-center justify-center rounded-lg text-sm font-medium tabular-nums transition-colors ${
                    isActive
                      ? "bg-neutral-900 text-white shadow-sm dark:bg-white dark:text-neutral-900"
                      : "border border-black/10 bg-white/70 text-neutral-700 hover:border-black/20 hover:bg-white dark:border-white/10 dark:bg-neutral-900/40 dark:text-neutral-300 dark:hover:bg-neutral-900/60"
                  }`}
                  aria-pressed={isActive}
                  aria-label={`Effort ${n} of 10`}
                >
                  {n}
                </motion.button>
              );
            })}
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] uppercase tracking-[0.18em] text-neutral-400 dark:text-neutral-500">
            <span>Easy</span>
            <span>All out</span>
          </div>
        </div>
      ) : null}

      {/* Optional note */}
      <div className="mt-6">
        <label
          htmlFor="checkin-note"
          className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400"
        >
          Note <span className="text-neutral-400">(optional)</span>
        </label>
        <textarea
          id="checkin-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={240}
          placeholder="Anything worth remembering?"
          className="mt-2 w-full resize-none rounded-xl border border-black/10 bg-white/70 px-3 py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 backdrop-blur focus:border-black/30 focus:outline-none focus:ring-0 dark:border-white/10 dark:bg-neutral-900/40 dark:text-neutral-100 dark:placeholder:text-neutral-500"
        />
      </div>

      <div className="mt-6 flex items-center justify-end">
        <motion.button
          type="button"
          onClick={() =>
            onSubmit({
              completed,
              // Effort is only relevant when they completed the workout.
              // Strip it on "Skipped" so the actualWorkout record stays
              // honest (no phantom effort score for a session that
              // didn't happen).
              perceivedEffort:
                completed && effort !== null ? effort : undefined,
              note: note.trim() ? note.trim() : undefined,
            })
          }
          disabled={completed && !canSubmit}
          whileHover={completed && !canSubmit ? undefined : { y: -1 }}
          whileTap={completed && !canSubmit ? undefined : { y: 0, scale: 0.97 }}
          transition={{ duration: 0.18, ease: PREMIUM_EASE }}
          className={`rounded-full px-6 py-2.5 text-sm font-semibold ${
            completed && !canSubmit
              ? "cursor-not-allowed bg-neutral-200 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-600"
              : tokens.primary.solid
          }`}
        >
          Save check-in
        </motion.button>
      </div>
    </GlassCard>
  );
}

function CheckInToggle({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -1 }}
      whileTap={{ y: 0, scale: 0.97 }}
      transition={{ duration: 0.15, ease: PREMIUM_EASE }}
      className={`flex-1 rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "bg-neutral-900 text-white shadow-sm dark:bg-white dark:text-neutral-900"
          : "border border-black/10 bg-white/70 text-neutral-700 hover:border-black/20 hover:bg-white dark:border-white/10 dark:bg-neutral-900/40 dark:text-neutral-300 dark:hover:bg-neutral-900/60"
      }`}
      aria-pressed={active}
    >
      {label}
    </motion.button>
  );
}


function ConfidenceBadge({
  decision,
}: {
  decision: DecisionOutput;
}) {
  const confidence = decision.confidence;
  const warnings = useMemo(
    () => decision.staleness_warnings ?? [],
    [decision.staleness_warnings],
  );
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
          <span className={`text-sm font-semibold ${meta.labelText}`}>
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
  aiReasoning,
  reasoningLoading = false,
  restDay = false,
}: {
  decision: DecisionOutput;
  readiness?: ManualReadiness | null;
  baselines?: ReadinessBaselines;
  aiReasoning?: DailyReasoning | null;
  reasoningLoading?: boolean;
  restDay?: boolean;
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
    () => aiReasoning?.summary ?? buildReasoningSummary(decision, displayScore, restDay),
    [aiReasoning, decision, displayScore, restDay],
  );

  // Three canonical factors. We translate the backend's free-form
  // `key_factors` into structured Recovery / Calendar / Progression rows
  // so the reasoning reads as one coherent story rather than a wall of
  // bullets. Each factor renders as a card with an icon, title, and a
  // short explanation.
  const factors = useMemo(
    () =>
      aiReasoning
        ? aiReasoning.factors.slice(0, 3).map(reasoningFactorFromAI)
        : buildReasoningFactors(decision, displayScore, restDay),
    [aiReasoning, decision, displayScore, restDay],
  );

  return (
    <section>
      <p className="text-xs font-medium uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
        Reasoning {aiReasoning ? "· bounded AI" : reasoningLoading ? "· loading AI" : "· deterministic"}
      </p>
      <h3 className="mt-2 text-xl font-semibold">
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

      {aiReasoning ? (
        <div className="mt-4 rounded-2xl border border-black/5 bg-white/50 p-4 text-xs leading-relaxed text-neutral-600 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.03] dark:text-neutral-300">
          <p>{aiReasoning.tradeoff}</p>
          <p className="mt-2 text-neutral-500 dark:text-neutral-400">
            {aiReasoning.confidence_note}
          </p>
        </div>
      ) : reasoningLoading ? (
        <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">
          Checking the bounded AI explanation. Deterministic reasoning is shown meanwhile.
        </p>
      ) : null}
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

function reasoningFactorFromAI(
  factor: DailyReasoning["factors"][number],
  index: number,
): ReasoningFactor {
  const title = factor.title.trim() || `Factor ${index + 1}`;
  const lower = title.toLowerCase();
  const icon: ReasoningFactor["icon"] =
    /calendar|time|schedule|window/.test(lower)
      ? "calendar"
      : /progress|build|plan|training|mileage|load/.test(lower)
        ? "trend"
        : "heart";
  const tone: ReasoningTone =
    factor.impact === "positive"
      ? "positive"
      : factor.impact === "negative"
        ? "caution"
        : "neutral";
  return {
    key: `${index}-${title}`,
    title,
    explanation: factor.explanation,
    tone,
    icon,
  };
}

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
  restDay = false,
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
  // Scheduled rest day: the plan has no run today even though the engine
  // would otherwise proceed. Frame it as intentional recovery so it
  // never reads like a quality session.
  if (restDay) {
    return "Today is a scheduled rest day — easy mobility or a walk at most. Recovery is where this block's work gets absorbed.";
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
  restDay = false,
): ReasoningFactor[] {
  const score = displayScore;
  const state = decision.state;
  const action = decision.selected_action.name.toLowerCase();
  // A scheduled rest day the engine simply proceeded with (the plan has
  // no run today). The `action === "rest"` branches below already cover
  // an engine-forced rest; this flag handles the "fresh, but nothing
  // scheduled" case so the cards never imply a quality session.
  const scheduledRest = restDay && action !== "rest";

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
      : scheduledRest
        ? `Recovery ${score.toFixed(2)} — you're fresh, and a scheduled rest day banks that freshness for the next quality session.`
        : score >= 0.85
          ? `Recovery ${score.toFixed(2)} — HRV and sleep are dialled in. Green light for quality work today.`
          : score >= 0.6
            ? `Recovery ${score.toFixed(2)} — readiness is workable. The engine kept the stimulus and eased the dose.`
            : `Recovery ${score.toFixed(2)} — your body's asking for less today. Listening now is what keeps the block compounding.`;

  // Calendar load — confident when there's room, practical when the
  // window is tight. Always frame the trade-off, never apologise for it.
  const minutes = decision.available_minutes ?? 0;
  const calendarTone: ReasoningTone = scheduledRest
    ? "neutral"
    : minutes >= 60
      ? "positive"
      : minutes >= 30
        ? "neutral"
        : "caution";
  const calendarExplanation = scheduledRest
    ? minutes > 0
      ? `${minutes} minutes free, but today's a rest day — spend it recovering, not adding load.`
      : "Today's a rest day — no session to fit. Let the recovery do the work."
    : minutes <= 0
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
      : scheduledRest
        ? "A scheduled recovery day — planned rest is part of how the block builds. Nothing to chase today."
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
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
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
                  className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50"
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
                  className="text-2xl font-semibold text-neutral-300 dark:text-neutral-600"
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
          <h2 className="mt-2 text-xl font-semibold">
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

