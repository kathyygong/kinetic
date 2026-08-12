// localStorage helpers for Kinetic.
//
// Two top-level keys:
//   - "kinetic_goal" : the user's training goal
//   - "kinetic_plan" : the calendar-aware plan we built for that goal
//                      (shared between the dashboard and the plan page)
//
// All helpers are SSR-safe — they no-op when window is undefined.

import type { DayLabel } from "./planAdjuster";
import type { PlanWeek } from "./planGenerator";
import type { Goal, UserProfile } from "./types";
import { mirrorLocalStorageKey } from "./persistence/mirror";

export const GOAL_STORAGE_KEY = "kinetic_goal";
export const PLAN_STORAGE_KEY = "kinetic_plan";

/**
 * Bumped any time the shared deterministic plan contract changes shape so cached plans built
 * by a prior version are treated as stale and regenerated on next render.
 * Both `goalSignature` and `planSignature` fold this in.
 */
const PLAN_GENERATOR_VERSION = 4;

/** Persist the user's goal to localStorage. */
export function saveGoal(goal: Goal): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GOAL_STORAGE_KEY, JSON.stringify(goal));
    mirrorLocalStorageKey(GOAL_STORAGE_KEY);
  } catch {
    // Storage might be unavailable (private mode, quota). Ignore.
  }
}

/** Read the saved goal from localStorage, or null if none / invalid. */
export function getGoal(): Goal | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(GOAL_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Goal;
  } catch {
    return null;
  }
}

// --- Saved plan -------------------------------------------------------------

/** A single travel-flagged day stored alongside the plan. */
export type SavedEasyOnlyDay = {
  weekIndex: number;
  day: DayLabel;
  reason: string;
};

/**
 * The user's calendar-aware training plan. Both the dashboard and the
 * plan page render from this. Regenerated when:
 *   - The goal changes (different `goalSig`)
 *   - The week rolls over (different `planStart`)
 *   - The user accepts a calendar-aware suggestion
 */
export type SavedPlan = {
  /** ISO Monday of week 0. */
  planStart: string;
  /** Stable signature of the goal that produced this plan. */
  goalSig: string;
  /** Calendar-adjusted weeks, in order (week 0 = current week). */
  weeks: PlanWeek[];
  /** Bullet text describing how this plan diverges from the deterministic base. */
  reasoning: string[];
  /** Days flagged as easy-only because of travel. */
  easyOnlyDays: SavedEasyOnlyDay[];
  /** ISO timestamp the plan was last persisted. */
  savedAt: string;
};

/**
 * Build a stable signature for a goal. Used to detect when the saved plan
 * is stale because the user changed their target / PRs / experience level.
 */
export function goalSignature(goal: Goal): string {
  return JSON.stringify({
    v: PLAN_GENERATOR_VERSION,
    g: goal.goal_type,
    rd: goal.race_distance,
    td: goal.target_date,
    el: goal.experience_level,
    pr: goal.current_prs,
    wm: goal.weekly_mileage ?? null,
  });
}

/**
 * Build a stable signature for the *full* plan inputs — goal plus the
 * profile fields that influence schedule shape (preferred training days,
 * experience level, weekly mileage, PRs). Use this for storing and
 * matching `SavedPlan.goalSig`; use `goalSignature` for goal-only
 * comparisons (workout-log scoping, goal-edit invalidation triggers).
 */
export function planSignature(
  goal: Goal,
  profile?: UserProfile | null,
): string {
  // Sort preferred days so storage is order-independent — the user can
  // toggle Sun off + Sat on in either order and produce the same sig.
  const days = profile?.preferred_training_days
    ? [...profile.preferred_training_days].sort()
    : null;
  return JSON.stringify({
    v: PLAN_GENERATOR_VERSION,
    g: goal.goal_type,
    rd: goal.race_distance,
    td: goal.target_date,
    el: profile?.experience_level ?? goal.experience_level,
    pr: profile?.personal_bests ?? goal.current_prs,
    wm: profile?.weekly_mileage ?? goal.weekly_mileage ?? null,
    pd: days,
    wa: [...(profile?.weekly_availability ?? [])].sort((a, b) => a.day.localeCompare(b.day)),
  });
}

/** Persist the saved plan. */
export function savePlan(plan: SavedPlan): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(plan));
    mirrorLocalStorageKey(PLAN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Read the saved plan, or null if none / invalid. */
export function getSavedPlan(): SavedPlan | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PLAN_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedPlan;
  } catch {
    return null;
  }
}

/** Remove the saved plan (used when the goal changes). */
export function clearSavedPlan(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PLAN_STORAGE_KEY);
    mirrorLocalStorageKey(PLAN_STORAGE_KEY);
  } catch {
    // ignore
  }
}
