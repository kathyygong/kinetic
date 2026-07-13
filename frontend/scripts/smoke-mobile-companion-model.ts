import {
  buildMobileTodayDataSnapshot,
  buildMobileDecision,
  CALENDAR_CONTEXTS,
  confidenceBucketFor,
  INTAKE_COPY,
  readinessStateFor,
  SCENARIOS,
  selectedActionFor,
  STATUS_COPY,
  type CalendarState,
  type SyncState,
} from "../lib/mobileCompanionModel";
import type { HealthSyncPayload } from "../lib/mobileReadinessContract";

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function expectDecision(
  syncState: SyncState,
  calendarState: CalendarState,
  expected: {
    action: ReturnType<typeof selectedActionFor>;
    confidence: ReturnType<typeof confidenceBucketFor>;
    primary: string;
    readiness: ReturnType<typeof readinessStateFor>;
    title: string;
  },
) {
  const decision = buildMobileDecision(syncState, calendarState);
  expect(decision.title === expected.title, `${syncState}/${calendarState} title mismatch`);
  expect(decision.primary === expected.primary, `${syncState}/${calendarState} primary mismatch`);
  expect(
    selectedActionFor(syncState, calendarState) === expected.action,
    `${syncState}/${calendarState} action mismatch`,
  );
  expect(
    confidenceBucketFor(syncState) === expected.confidence,
    `${syncState}/${calendarState} confidence mismatch`,
  );
  expect(
    readinessStateFor(syncState) === expected.readiness,
    `${syncState}/${calendarState} readiness mismatch`,
  );
  expect(
    decision.reasons.length >= 3,
    `${syncState}/${calendarState} should explain the recommendation`,
  );
}

function main() {
  expect(Object.keys(SCENARIOS).length === 3, "expected three HealthKit states");
  expect(Object.keys(CALENDAR_CONTEXTS).length === 3, "expected three calendar states");
  expect(STATUS_COPY.skipped === "Skipped without changing the plan", "skip copy must stay safe");
  expect(
    INTAKE_COPY.applied === "Draft applied after deterministic validation",
    "intake confirmation must name deterministic validation",
  );

  expectDecision("synced", "clear", {
    action: "proceed",
    confidence: "high",
    primary: "Run the planned session",
    readiness: "ready",
    title: "Tempo intervals",
  });
  expectDecision("stale", "clear", {
    action: "modify",
    confidence: "moderate",
    primary: "Use the scaled option",
    readiness: "stale",
    title: "Short aerobic run",
  });
  expectDecision("denied", "clear", {
    action: "unknown",
    confidence: "low",
    primary: "Log readiness",
    readiness: "unknown",
    title: "Manual check-in first",
  });
  expectDecision("denied", "conflict", {
    action: "unknown",
    confidence: "low",
    primary: "Log readiness",
    readiness: "unknown",
    title: "Manual check-in first",
  });
  expectDecision("synced", "conflict", {
    action: "modify",
    confidence: "high",
    primary: "Apply safe adjustment",
    readiness: "ready",
    title: "Scale to 30 min easy",
  });
  expectDecision("synced", "stale", {
    action: "modify",
    confidence: "high",
    primary: "Review schedule",
    readiness: "ready",
    title: "Confirm schedule first",
  });

  const now = new Date("2026-07-13T12:00:00.000Z");
  const freshHealthSync: HealthSyncPayload = {
    provider: "apple_health",
    schema: "health-sync.v1",
    permission_state: "granted",
    metric_permissions: {
      sleep: "granted",
      hrv: "granted",
      resting_hr: "granted",
    },
    last_attempted_sync_at: "2026-07-13T11:45:00.000Z",
    last_successful_sync_at: "2026-07-13T11:45:00.000Z",
    latest_readiness_date: "2026-07-13",
    background_delivery: "enabled",
    daily_status: {
      "2026-07-13": {
        status: "synced",
        confidence: "high",
        coverage: {
          sleep: "complete",
          hrv: "complete",
          resting_hr: "complete",
        },
        conflict: "none",
      },
    },
    last_error_code: null,
  };
  const readinessLog = {
    entries: {
      "2026-07-13": {
        date: "2026-07-13",
        sleep_hours: 7.4,
        hrv: 54,
        resting_hr: 49,
        source: "healthkit" as const,
        updated_at: "2026-07-13T11:45:00.000Z",
      },
    },
  };

  const syncedClear = buildMobileTodayDataSnapshot({
    profile: {
      full_name: "Kinetic Runner",
      email: "runner@example.com",
      experience_level: "intermediate",
      weekly_mileage: 25,
      preferred_training_days: ["mon", "wed", "fri", "sun"],
      personal_bests: { "5k": 1500 },
      connected_services: {
        google_calendar: { connected: true, last_synced_at: "2026-07-13T10:00:00.000Z" },
        apple_health: { connected: true, last_synced_at: "2026-07-13T11:45:00.000Z" },
        garmin: { connected: false },
        oura: { connected: false },
      },
      onboarding_completed: true,
    },
    goal: {
      goal_type: "race",
      race_distance: "10k",
      target_date: "2026-09-20",
      experience_level: "intermediate",
      current_prs: { "5k": 1500 },
      weekly_mileage: 25,
    },
    savedPlan: {
      planStart: "2026-07-13",
      goalSig: "mobile-smoke-goal",
      weeks: [
        {
          weekNumber: 1,
          phase: "build",
          workouts: [
            {
              day: "Mon",
              type: "tempo",
              distance: 5,
              pace: 7.5,
              duration: 40,
            },
          ],
        },
      ],
      reasoning: [],
      easyOnlyDays: [],
      savedAt: "2026-07-13T09:00:00.000Z",
    },
    healthSync: freshHealthSync,
    readinessLog,
    calendar: { ageHours: 2, availableMinutesToday: 90 },
    learnedPreferences: [
      {
        id: "pref-1",
        type: "schedule_preference",
        description: "Prefers morning long runs",
        confidence: "moderate",
        userConfirmed: true,
        createdAt: "2026-07-01T10:00:00.000Z",
      },
    ],
    workoutLog: [
      {
        weekNumber: 1,
        day: "Mon",
        status: "completed",
        scheduledDate: "2026-07-13",
        loggedAt: "2026-07-13T14:00:00.000Z",
      },
    ],
    now,
  });
  expect(syncedClear.syncState === "synced", "fresh HealthKit summary should be synced");
  expect(syncedClear.calendarState === "clear", "fresh open calendar should be clear");
  expect(syncedClear.decision.title === "Tempo intervals", "synced/open Today title mismatch");
  expect(
    syncedClear.sourceSummary.learnedPreferenceCount === 1 &&
      syncedClear.sourceSummary.workoutHistoryCount === 1,
    "mobile context should carry preference and workout history counts",
  );
  expect(
    syncedClear.sourceSummary.hasProfile &&
      syncedClear.sourceSummary.hasGoal &&
      syncedClear.sourceSummary.hasSavedPlan,
    "mobile context should carry authenticated profile, goal, and saved plan state",
  );

  const syncedConflict = buildMobileTodayDataSnapshot({
    healthSync: freshHealthSync,
    readinessLog,
    calendar: { ageHours: 2, availableMinutesToday: 30 },
    now,
  });
  expect(
    syncedConflict.calendarState === "conflict" &&
      syncedConflict.decision.primary === "Apply safe adjustment",
    "tight calendar should require a safe deterministic adjustment",
  );

  const denied = buildMobileTodayDataSnapshot({
    healthSync: { ...freshHealthSync, permission_state: "denied" },
    readinessLog,
    calendar: { ageHours: 2, availableMinutesToday: 90 },
    now,
  });
  expect(
    denied.syncState === "denied" &&
      denied.decision.title === "Manual check-in first" &&
      denied.sourceSummary.healthPermissionState === "denied",
    "denied HealthKit permission should route to manual check-in",
  );

  const staleHealth = buildMobileTodayDataSnapshot({
    healthSync: {
      ...freshHealthSync,
      last_successful_sync_at: "2026-07-11T11:45:00.000Z",
      background_delivery: "stale",
    },
    readinessLog,
    calendar: { ageHours: 2, availableMinutesToday: 90 },
    now,
  });
  expect(
    staleHealth.syncState === "stale" &&
      staleHealth.decision.title === "Short aerobic run",
    "stale HealthKit background sync should lower certainty",
  );

  const staleCalendar = buildMobileTodayDataSnapshot({
    healthSync: freshHealthSync,
    readinessLog,
    calendar: { ageHours: 30, availableMinutesToday: 90 },
    now,
  });
  expect(
    staleCalendar.calendarState === "stale" &&
      staleCalendar.decision.primary === "Review schedule",
    "stale calendar should require schedule review",
  );

  const manualOnly = buildMobileTodayDataSnapshot({
    readinessLog: {
      entries: {
        "2026-07-13": {
          date: "2026-07-13",
          fatigue_level: 3,
          source: "manual",
          updated_at: "2026-07-13T11:30:00.000Z",
        },
      },
    },
    calendar: { ageHours: 2, availableMinutesToday: 90 },
    now,
  });
  expect(
    manualOnly.syncState === "denied" &&
      manualOnly.sourceSummary.readinessSource === "manual",
    "manual-only readiness should not masquerade as HealthKit sync",
  );

  console.log("OK - mobile companion state model preserves safety-first Today decisions");
}

void main();
