// Timing helpers for Kinetic's scheduled calendar checks.
//
// Three cadences are supported, all client-side (the dashboard runs them
// on load; a real deployment would want a service-worker or push):
//
//   1. Weekly  — every Sunday, refresh the next week's plan against the
//                user's calendar.
//   2. Nightly — each evening (after 8pm), recheck the next day's
//                workout against tomorrow's calendar.
//   3. Morning — each morning (after 5am), recheck biometrics for
//                today's recovery / readiness score.
//
// We don't fire timers in the background; instead each helper returns
// whether it's "due" relative to the last completed run (stored in
// localStorage). Callers run the check on mount and persist the
// timestamp via `markRanAt`.

import { mirrorLocalStorageKey } from "./persistence/mirror";

export const STORAGE_KEY = "kinetic_schedule";

type ScheduleState = {
  /** ISO date (YYYY-MM-DD) of the last weekly refresh. */
  lastWeeklyRefresh?: string;
  /** ISO date of the last nightly check. */
  lastNightlyCheck?: string;
  /** ISO date of the last morning check. */
  lastMorningCheck?: string;
};

export type ScheduleCheck =
  | "weekly-refresh"
  | "nightly-check"
  | "morning-check";

const NIGHTLY_HOUR = 20; // 8pm or later
const MORNING_HOUR = 5; // 5am or later

// --- Public API -------------------------------------------------------------

/** Get all checks that are due now. */
export function dueChecks(now: Date = new Date()): ScheduleCheck[] {
  const due: ScheduleCheck[] = [];
  if (isWeeklyRefreshDue(now)) due.push("weekly-refresh");
  if (isNightlyCheckDue(now)) due.push("nightly-check");
  if (isMorningCheckDue(now)) due.push("morning-check");
  return due;
}

/** True when today is Sunday and we haven't refreshed this Sunday yet. */
export function isWeeklyRefreshDue(now: Date = new Date()): boolean {
  if (now.getDay() !== 0) return false; // 0 = Sunday
  const state = readState();
  return state.lastWeeklyRefresh !== isoDate(now);
}

/** True when it's after 8pm and we haven't run tonight's check yet. */
export function isNightlyCheckDue(now: Date = new Date()): boolean {
  if (now.getHours() < NIGHTLY_HOUR) return false;
  const state = readState();
  return state.lastNightlyCheck !== isoDate(now);
}

/** True when it's after 5am and we haven't run today's morning check yet. */
export function isMorningCheckDue(now: Date = new Date()): boolean {
  if (now.getHours() < MORNING_HOUR) return false;
  const state = readState();
  return state.lastMorningCheck !== isoDate(now);
}

/** Mark a check as completed at `now`. */
export function markRanAt(check: ScheduleCheck, now: Date = new Date()): void {
  const state = readState();
  const iso = isoDate(now);
  if (check === "weekly-refresh") state.lastWeeklyRefresh = iso;
  if (check === "nightly-check") state.lastNightlyCheck = iso;
  if (check === "morning-check") state.lastMorningCheck = iso;
  writeState(state);
}

/** Clear all remembered scheduled-check timestamps. Used by demo reset. */
export function clearScheduleState(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    mirrorLocalStorageKey(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Human-friendly reason text for a due check (for the suggestion card). */
export function checkReason(check: ScheduleCheck): string {
  switch (check) {
    case "weekly-refresh":
      return "Sunday refresh: aligning next week's plan with your calendar";
    case "nightly-check":
      return "Nightly check: making sure tomorrow's workout fits your schedule";
    case "morning-check":
      return "Morning check: updating today's plan with your latest readiness";
  }
}

// --- Day-of-week + travel helpers ------------------------------------------

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function dayLabel(d: Date): "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun" {
  return DAY_LABELS[d.getDay()] as
    | "Mon"
    | "Tue"
    | "Wed"
    | "Thu"
    | "Fri"
    | "Sat"
    | "Sun";
}

/** Return the Monday of `now`'s week (start of training week). */
export function startOfWeek(now: Date = new Date()): Date {
  const d = new Date(now);
  const dow = d.getDay();
  // 0 (Sun) -> -6 days; 1 (Mon) -> 0; 2 (Tue) -> -1; ...
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

// --- Internals --------------------------------------------------------------

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function readState(): ScheduleState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ScheduleState;
  } catch {
    return {};
  }
}

function writeState(state: ScheduleState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    mirrorLocalStorageKey(STORAGE_KEY);
  } catch {
    // ignore (private mode, quota)
  }
}
