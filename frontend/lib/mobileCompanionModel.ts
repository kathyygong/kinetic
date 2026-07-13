import type { LearnedPreference } from "./behaviorTypes";
import type { HealthSyncPayload } from "./mobileReadinessContract";
import type { ReadinessLog, ManualReadiness } from "./readinessStorage";
import type { SavedPlan } from "./storage";
import type { Goal, UserProfile } from "./types";
import type { WorkoutLogEntry } from "./workoutLog";

export type SyncState = "synced" | "stale" | "denied";
export type CalendarState = "clear" | "conflict" | "stale";
export type WorkoutStatus = "pending" | "accepted" | "checked_in" | "completed" | "skipped";
export type IntakeStatus = "idle" | "drafted" | "applied";

export type Scenario = {
  label: string;
  syncPill: string;
  readinessLabel: string;
  confidenceLabel: string;
  confidenceValue: number;
  recoveryValue: number;
  recoveryTone: "emerald" | "amber" | "rose";
  workoutTitle: string;
  workoutMeta: string;
  primaryCopy: string;
  reasoning: string[];
  metrics: Array<{
    label: string;
    value: string;
    state: "good" | "warn" | "muted";
  }>;
  privacy: string;
};

export type CalendarContext = {
  label: string;
  pill: string;
  title: string;
  detail: string;
  state: "good" | "warn" | "muted";
};

export type MobileDecision = {
  title: string;
  meta: string;
  primary: string;
  reasons: string[];
};

export type MobileTodayDomainContext = {
  profile?: UserProfile | null;
  goal?: Goal | null;
  savedPlan?: SavedPlan | null;
  readinessLog?: ReadinessLog | null;
  healthSync?: HealthSyncPayload | null;
  calendar?: {
    ageHours: number | null;
    availableMinutesToday?: number | null;
    unhealthy?: boolean;
  };
  learnedPreferences?: LearnedPreference[];
  workoutLog?: WorkoutLogEntry[];
  now?: Date | string;
};

export type MobileTodayDataSnapshot = {
  syncState: SyncState;
  calendarState: CalendarState;
  decision: MobileDecision;
  sourceSummary: {
    hasProfile: boolean;
    hasGoal: boolean;
    hasSavedPlan: boolean;
    healthPermissionState: HealthSyncPayload["permission_state"] | "missing";
    latestReadinessDate: string | null;
    readinessSource: ManualReadiness["source"] | "missing";
    learnedPreferenceCount: number;
    workoutHistoryCount: number;
  };
};

export const SCENARIOS: Record<SyncState, Scenario> = {
  synced: {
    label: "Synced",
    syncPill: "Health synced 8:12 AM",
    readinessLabel: "Ready",
    confidenceLabel: "High confidence",
    confidenceValue: 0.78,
    recoveryValue: 0.84,
    recoveryTone: "emerald",
    workoutTitle: "Tempo intervals",
    workoutMeta: "42 min · 5.1 mi · quality day",
    primaryCopy: "Run the planned session",
    reasoning: [
      "Sleep and HRV are inside your recent baseline.",
      "No stale data warnings are active.",
      "The quality session still fits the block.",
    ],
    metrics: [
      { label: "Sleep", value: "7h 28m", state: "good" },
      { label: "HRV", value: "54 ms", state: "good" },
      { label: "Resting HR", value: "49 bpm", state: "good" },
    ],
    privacy: "Daily summary only. Raw HealthKit samples stay on device.",
  },
  stale: {
    label: "Stale",
    syncPill: "Health last synced yesterday",
    readinessLabel: "Caution",
    confidenceLabel: "Moderate confidence",
    confidenceValue: 0.54,
    recoveryValue: 0.66,
    recoveryTone: "amber",
    workoutTitle: "Short aerobic run",
    workoutMeta: "30 min · easy effort",
    primaryCopy: "Use the scaled option",
    reasoning: [
      "Readiness is more than a day old.",
      "Kinetic reduces certainty instead of guessing.",
      "The aerobic option protects the training rhythm.",
    ],
    metrics: [
      { label: "Sleep", value: "stale", state: "warn" },
      { label: "HRV", value: "stale", state: "warn" },
      { label: "Resting HR", value: "51 bpm", state: "muted" },
    ],
    privacy: "Open the app to refresh HealthKit before trusting harder work.",
  },
  denied: {
    label: "Denied",
    syncPill: "Health permission needed",
    readinessLabel: "Unknown",
    confidenceLabel: "Low confidence",
    confidenceValue: 0.38,
    recoveryValue: 0.5,
    recoveryTone: "rose",
    workoutTitle: "Manual check-in first",
    workoutMeta: "2 min · sleep, fatigue, soreness",
    primaryCopy: "Log readiness",
    reasoning: [
      "Kinetic has no fresh HealthKit signal.",
      "Manual readiness is the safest next input.",
      "The plan will not change until deterministic validation runs.",
    ],
    metrics: [
      { label: "Sleep", value: "not shared", state: "muted" },
      { label: "HRV", value: "not shared", state: "muted" },
      { label: "Resting HR", value: "not shared", state: "muted" },
    ],
    privacy: "Granting access reads summaries locally; raw samples are not uploaded.",
  },
};

export const CALENDAR_CONTEXTS: Record<CalendarState, CalendarContext> = {
  clear: {
    label: "Clear",
    pill: "Calendar clear until 11:30 AM",
    title: "Planned slot available",
    detail: "Tempo still fits before the first meeting.",
    state: "good",
  },
  conflict: {
    label: "Conflict",
    pill: "Calendar conflict at 8:45 AM",
    title: "30 min window today",
    detail: "Kinetic should scale the session before it asks for effort.",
    state: "warn",
  },
  stale: {
    label: "Stale",
    pill: "Calendar not refreshed",
    title: "Schedule confidence low",
    detail: "Review the schedule before accepting a harder workout.",
    state: "muted",
  },
};

export const STATUS_COPY: Record<WorkoutStatus, string> = {
  pending: "No action saved yet",
  accepted: "Workout accepted for today",
  checked_in: "Manual readiness captured for today",
  completed: "Completed and ready for review",
  skipped: "Skipped without changing the plan",
};

export const INTAKE_COPY: Record<IntakeStatus, string> = {
  idle: "No schedule update drafted",
  drafted: "AI parsed a review-only schedule draft",
  applied: "Draft applied after deterministic validation",
};

export function buildMobileDecision(
  syncState: SyncState,
  calendarState: CalendarState,
): MobileDecision {
  const scenario = SCENARIOS[syncState];

  if (calendarState === "conflict") {
    return {
      title: syncState === "denied" ? "Manual check-in first" : "Scale to 30 min easy",
      meta: syncState === "denied" ? "2 min · then adapt safely" : "30 min · aerobic · preserves load cap",
      primary: syncState === "denied" ? "Log readiness" : "Apply safe adjustment",
      reasons: [
        "Calendar leaves only a 30 min training window.",
        "The deterministic engine keeps weekly load inside bounds.",
        ...scenario.reasoning,
      ],
    };
  }

  if (calendarState === "stale") {
    return {
      title: syncState === "denied" ? "Manual check-in first" : "Confirm schedule first",
      meta: syncState === "denied" ? "2 min · readiness fallback" : "Calendar stale · no unsafe mutation",
      primary: syncState === "denied" ? "Log readiness" : "Review schedule",
      reasons: [
        "Calendar freshness is low, so Kinetic does not invent availability.",
        "The current plan stays unchanged until the schedule is confirmed.",
        ...scenario.reasoning,
      ],
    };
  }

  return {
    title: scenario.workoutTitle,
    meta: scenario.workoutMeta,
    primary: scenario.primaryCopy,
    reasons: scenario.reasoning,
  };
}

export function buildMobileTodayDataSnapshot(
  context: MobileTodayDomainContext,
): MobileTodayDataSnapshot {
  const syncState = resolveSyncState(context);
  const calendarState = resolveCalendarState(context);
  const latestReadiness = latestReadinessEntry(context.readinessLog);

  return {
    syncState,
    calendarState,
    decision: buildMobileDecision(syncState, calendarState),
    sourceSummary: {
      hasProfile: Boolean(context.profile),
      hasGoal: Boolean(context.goal),
      hasSavedPlan: Boolean(context.savedPlan?.weeks?.length),
      healthPermissionState: context.healthSync?.permission_state ?? "missing",
      latestReadinessDate: latestReadiness?.date ?? null,
      readinessSource: latestReadiness?.source ?? "missing",
      learnedPreferenceCount: context.learnedPreferences?.length ?? 0,
      workoutHistoryCount: context.workoutLog?.length ?? 0,
    },
  };
}

export function resolveSyncState(context: MobileTodayDomainContext): SyncState {
  const healthSync = context.healthSync;
  if (
    !healthSync ||
    healthSync.permission_state === "denied" ||
    healthSync.permission_state === "not_determined"
  ) {
    return "denied";
  }

  const latestDate = healthSync.latest_readiness_date;
  const status = latestDate ? healthSync.daily_status[latestDate] : undefined;
  const successAge = hoursSince(healthSync.last_successful_sync_at, context.now);
  const latestReadiness = latestReadinessEntry(context.readinessLog);
  const latestReadinessAge = hoursSince(latestReadiness?.updated_at, context.now);
  const hasFreshHealthKitReadiness =
    latestReadiness?.source === "healthkit" &&
    latestReadinessAge !== null &&
    latestReadinessAge <= 24;

  if (
    hasFreshHealthKitReadiness &&
    successAge !== null &&
    successAge <= 24 &&
    status &&
    (status.status === "synced" || status.status === "partial")
  ) {
    return "synced";
  }

  return "stale";
}

export function resolveCalendarState(
  context: MobileTodayDomainContext,
): CalendarState {
  const calendar = context.calendar;
  if (!calendar || calendar.unhealthy || calendar.ageHours === null || calendar.ageHours > 24) {
    return "stale";
  }

  if (
    typeof calendar.availableMinutesToday === "number" &&
    calendar.availableMinutesToday <= 30
  ) {
    return "conflict";
  }

  return "clear";
}

export function confidenceBucketFor(state: SyncState): "low" | "moderate" | "high" {
  if (state === "synced") return "high";
  if (state === "stale") return "moderate";
  return "low";
}

export function readinessStateFor(
  state: SyncState,
): "ready" | "caution" | "unknown" | "stale" {
  if (state === "synced") return "ready";
  if (state === "stale") return "stale";
  return "unknown";
}

export function selectedActionFor(
  syncState: SyncState,
  calendarState: CalendarState,
): "proceed" | "modify" | "rest" | "unknown" {
  if (syncState === "denied") return "unknown";
  if (calendarState !== "clear" || syncState === "stale") return "modify";
  return "proceed";
}

function latestReadinessEntry(log: ReadinessLog | null | undefined): ManualReadiness | null {
  if (!log) return null;
  let latest: ManualReadiness | null = null;
  for (const entry of Object.values(log.entries)) {
    if (!latest || entry.updated_at > latest.updated_at) latest = entry;
  }
  return latest;
}

function hoursSince(
  iso: string | null | undefined,
  now: Date | string | undefined,
): number | null {
  if (!iso) return null;
  const thenMs = Date.parse(iso);
  const nowMs = now ? new Date(now).getTime() : Date.now();
  if (!Number.isFinite(thenMs) || !Number.isFinite(nowMs)) return null;
  return Math.max(0, (nowMs - thenMs) / (1000 * 60 * 60));
}
