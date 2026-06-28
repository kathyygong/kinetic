"use client";

import {
  clearDismissedPreferences,
  clearRecommendationLog,
  clearLearnedPreferences,
  saveRecommendationEvent,
  buildRecommendationEventId,
} from "./behaviorStorage";
import type { RecommendationEvent } from "./behaviorTypes";
import { clearCalendarFreshness } from "./dataFreshness";
import {
  clearReadinessLog,
  isoDateKey,
  replaceReadinessForDate,
} from "./readinessStorage";
import {
  applyPreferredDays,
  generateTrainingPlan,
} from "./planGenerator";
import { saveUserProfile } from "./profileStorage";
import { clearScheduleState, startOfWeek } from "./scheduling";
import {
  clearSavedPlan,
  planSignature,
  saveGoal,
  savePlan,
  type SavedPlan,
} from "./storage";
import { clearTodayCompletion } from "./todayCompletion";
import type { Goal, UserProfile } from "./types";
import { clearWorkoutLog } from "./workoutLog";

export type DemoSeedResult = {
  goalTargetDate: string;
  planWeeks: number;
  readinessEntries: number;
  recommendationEvents: number;
};

const DEMO_PRS = {
  "5k": 23 * 60 + 20,
  "10k": 48 * 60 + 30,
  half: 1 * 3600 + 45 * 60,
  marathon: 3 * 3600 + 45 * 60,
};

export function seedDemoData(now: Date = new Date()): DemoSeedResult {
  clearDemoData();

  const goal = buildDemoGoal(now);
  const profile = buildDemoProfile();
  const basePlan = generateTrainingPlan(goal);
  const weeks = applyPreferredDays(basePlan, profile.preferred_training_days);
  const savedPlan: SavedPlan = {
    planStart: isoDateKey(startOfWeek(now)),
    goalSig: planSignature(goal, profile),
    weeks,
    reasoning: [
      "Demo seed starts from the deterministic plan and leaves live calendar adaptation optional.",
    ],
    easyOnlyDays: [],
    savedAt: now.toISOString(),
  };

  saveUserProfile(profile);
  saveGoal(goal);
  savePlan(savedPlan);

  const readinessEntries = seedReadiness(now);
  const recommendationEvents = seedRecommendationHistory(now);

  return {
    goalTargetDate: goal.target_date,
    planWeeks: weeks.length,
    readinessEntries,
    recommendationEvents,
  };
}

export function resetDemoData(now: Date = new Date()): DemoSeedResult {
  return seedDemoData(now);
}

export function clearDemoLearning(): void {
  clearLearnedPreferences();
  clearDismissedPreferences();
}

function clearDemoData(): void {
  clearSavedPlan();
  clearWorkoutLog();
  clearTodayCompletion();
  clearReadinessLog();
  clearRecommendationLog();
  clearLearnedPreferences();
  clearDismissedPreferences();
  clearCalendarFreshness();
  clearScheduleState();
}

function buildDemoGoal(now: Date): Goal {
  const raceDate = addDays(now, 7 * 16);
  return {
    goal_type: "race",
    race_distance: "half",
    target_date: isoDateKey(raceDate),
    experience_level: "intermediate",
    current_prs: DEMO_PRS,
    weekly_mileage: 25,
  };
}

function buildDemoProfile(): UserProfile {
  return {
    full_name: "Alex Rivera",
    email: "alex.demo@example.com",
    experience_level: "intermediate",
    weekly_mileage: 25,
    preferred_training_days: ["mon", "wed", "fri", "sun"],
    personal_bests: DEMO_PRS,
    connected_services: {
      google_calendar: { connected: false },
      apple_health: { connected: false },
      garmin: { connected: false },
      oura: { connected: false },
    },
    onboarding_completed: true,
  };
}

function seedReadiness(now: Date): number {
  const entries = [
    { daysAgo: 4, sleep_hours: 7.6, hrv: 56, resting_hr: 48, fatigue_level: 2, soreness_level: 1 },
    { daysAgo: 3, sleep_hours: 7.2, hrv: 54, resting_hr: 49, fatigue_level: 2, soreness_level: 2 },
    { daysAgo: 2, sleep_hours: 6.9, hrv: 52, resting_hr: 50, fatigue_level: 3, soreness_level: 2 },
    { daysAgo: 1, sleep_hours: 7.4, hrv: 55, resting_hr: 48, fatigue_level: 2, soreness_level: 1 },
    { daysAgo: 0, sleep_hours: 6.8, hrv: 51, resting_hr: 51, fatigue_level: 3, soreness_level: 2 },
  ] as const;

  for (const entry of entries) {
    const date = isoDateKey(addDays(now, -entry.daysAgo));
    replaceReadinessForDate(date, {
      sleep_hours: entry.sleep_hours,
      hrv: entry.hrv,
      resting_hr: entry.resting_hr,
      fatigue_level: entry.fatigue_level,
      soreness_level: entry.soreness_level,
    });
  }

  return entries.length;
}

function seedRecommendationHistory(now: Date): number {
  const events = [
    makeEvent(now, -14, "4 mi easy", "30 min easy run", "modify", "rejected", "not_enough_time", "heavy", false, 28),
    makeEvent(now, -12, "5 mi tempo", "Rest day", "rest", "skipped", "not_enough_time", "heavy", false, 20),
    makeEvent(now, -9, "4 mi easy", "4 mi easy", "proceed", "accepted", undefined, "light", true, 90),
    makeEvent(now, -7, "6 mi intervals", "35 min easy run", "modify", "rejected", "not_enough_time", "heavy", false, 25),
    makeEvent(now, -4, "5 mi easy", "5 mi easy", "proceed", "accepted", undefined, "moderate", true, 55),
    makeEvent(now, -2, "8 mi long run", "45 min easy run", "modify", "skipped", "not_enough_time", "heavy", false, 30),
  ];

  let saved = 0;
  for (const event of events) {
    if (saveRecommendationEvent(event)) saved += 1;
  }
  return saved;
}

function makeEvent(
  now: Date,
  daysOffset: number,
  plannedWorkout: string,
  recommendedWorkout: string,
  selectedAction: RecommendationEvent["selectedAction"],
  userResponse: NonNullable<RecommendationEvent["userResponse"]>,
  rejectionReason: string | undefined,
  calendarLoad: NonNullable<RecommendationEvent["context"]["calendarLoad"]>,
  completed: boolean,
  availableMinutes: number,
): RecommendationEvent {
  const date = isoDateKey(addDays(now, daysOffset));
  return {
    id: buildRecommendationEventId(date, plannedWorkout, recommendedWorkout),
    date,
    plannedWorkout,
    recommendedWorkout,
    selectedAction,
    confidence: calendarLoad === "heavy" ? "moderate" : "high",
    recoveryScore: completed ? 0.78 : 0.54,
    availableMinutes,
    userResponse,
    ...(rejectionReason ? { rejectionReason } : {}),
    actualWorkout: {
      completed,
      ...(completed ? { distanceMiles: 4.2, durationMinutes: 38, perceivedEffort: 5 } : {}),
    },
    context: {
      calendarLoad,
      sleepStatus: completed ? "normal" : "below_baseline",
      recoveryStatus: completed ? "high" : "moderate",
    },
  };
}

function addDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setDate(out.getDate() + days);
  return out;
}
