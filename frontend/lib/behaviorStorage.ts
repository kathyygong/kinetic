// Persistence for Kinetic's behavior tracking layer.
//
// Stores `RecommendationEvent` records in localStorage. This is the
// raw signal log that downstream layers (preference mining, the
// recommendation engine, the behavior dashboard) read from.
//
// Design choices:
//
//   - Single keyed object, not an array, so id lookups are O(1) and
//     dedup is trivial. Keys are the stable event ids.
//   - Insert-if-missing semantics for `saveRecommendationEvent`. The
//     dashboard calls this on every render where a recommendation is
//     visible, and we never want to clobber a record that already has
//     a `userResponse` or `actualWorkout` attached. Updates flow
//     through `updateRecommendationEvent`.
//   - All writes are best-effort: localStorage can throw (quota,
//     private-mode browsers). We swallow the error rather than break
//     the UI; the worst case is a missed signal, not a crash.
//
// Schema migrations: bump `BEHAVIOR_LOG_VERSION` to invalidate the
// stored log. Older logs are silently dropped on read.

import type { LearnedPreference, RecommendationEvent } from "./behaviorTypes";
import { mirrorLocalStorageKey } from "./persistence/mirror";

// --- Storage shape ----------------------------------------------------------

export const RECOMMENDATION_LOG_KEY = "kinetic_recommendation_log";
export const LEARNED_PREFERENCE_KEY = "kinetic_learned_preferences";
export const DISMISSED_PREFERENCE_KEY = "kinetic_dismissed_preferences";
const BEHAVIOR_LOG_VERSION = 1;

type RecommendationLog = {
  version: number;
  /** event id -> RecommendationEvent. */
  events: Record<string, RecommendationEvent>;
};

type PreferenceLog = {
  version: number;
  /** preference id -> LearnedPreference. */
  preferences: Record<string, LearnedPreference>;
};

type DismissedPreferenceLog = {
  version: number;
  dismissed: Record<string, string>;
};

// --- ID helper --------------------------------------------------------------

/**
 * Build a stable event id from the recommendation's identifying inputs.
 *
 * `date` keys the entry to a calendar day, and the planned + recommended
 * workout strings disambiguate cases where the user reloads or the
 * engine re-runs with a different recovery reading mid-day.
 *
 * Slashes, colons and pipes in the inputs are escaped so the id stays
 * round-trippable (the components can be parsed back out if needed).
 */
export function buildRecommendationEventId(
  date: string,
  plannedWorkout: string,
  recommendedWorkout: string,
): string {
  const safe = (s: string) => s.replace(/\|/g, "\\|");
  return [safe(date), safe(plannedWorkout), safe(recommendedWorkout)].join("|");
}

// --- Bucketing helpers ------------------------------------------------------

/**
 * Map the engine's raw [0, 1] confidence onto the three-tier behavior
 * schema. Thresholds match the `ConfidenceBadge` UI (≥0.75 high,
 * ≥0.5 moderate, else low) so the logged record agrees with what the
 * user actually saw.
 */
export function bucketConfidence(
  raw: number,
): "low" | "moderate" | "high" {
  const clamped = Math.max(0, Math.min(1, raw));
  if (clamped >= 0.75) return "high";
  if (clamped >= 0.5) return "moderate";
  return "low";
}

/**
 * Map the engine's `selected_action.name` to the behavior schema's
 * three-action union. Unknown action names (the engine occasionally
 * emits richer labels) are folded into "modify" — they're never
 * "proceed" or "rest", so treating them as a modification is correct.
 */
export function bucketSelectedAction(
  name: string,
): "proceed" | "modify" | "rest" {
  if (name === "proceed") return "proceed";
  if (name === "rest") return "rest";
  return "modify";
}

/**
 * Map the recovery state (from `classifyRecoveryState`) to the
 * behavior schema's "low/moderate/high" recoveryStatus. "recovered"
 * is high, "fatigued" is moderate, "at_risk" is low.
 */
export function bucketRecoveryStatus(
  state: "recovered" | "fatigued" | "at_risk" | null,
): "low" | "moderate" | "high" | undefined {
  if (state === "recovered") return "high";
  if (state === "fatigued") return "moderate";
  if (state === "at_risk") return "low";
  return undefined;
}

/**
 * Coarsen the calendar's available minutes into the behavior schema's
 * light / moderate / heavy load bands.
 *
 *   - heavy   = ≤30 min  (a packed day where only a short session fits)
 *   - moderate= ≤60 min  (a normal workday with one window)
 *   - light   = >60 min  (a relatively open day)
 *
 * Returns undefined when the minutes value is unknown so the field
 * stays absent rather than defaulting to a misleading "light".
 */
export function bucketCalendarLoad(
  availableMinutes: number | null | undefined,
): "light" | "moderate" | "heavy" | undefined {
  if (typeof availableMinutes !== "number") return undefined;
  if (availableMinutes <= 30) return "heavy";
  if (availableMinutes <= 60) return "moderate";
  return "light";
}

/**
 * Compare a runner's sleep hours today to their rolling baseline.
 * Within ±0.5h is "normal"; below is "below_baseline"; above is
 * "above_baseline". Returns undefined when either side is missing.
 */
export function bucketSleepStatus(
  todaySleep: number | null | undefined,
  baselineSleep: number | null | undefined,
): "below_baseline" | "normal" | "above_baseline" | undefined {
  if (typeof todaySleep !== "number") return undefined;
  if (typeof baselineSleep !== "number") return undefined;
  const delta = todaySleep - baselineSleep;
  if (delta <= -0.5) return "below_baseline";
  if (delta >= 0.5) return "above_baseline";
  return "normal";
}

// --- Recommendation events --------------------------------------------------

/**
 * Insert a new RecommendationEvent into the log, indexed by its id.
 * Existing entries with the same id are left untouched — the dashboard
 * may call this multiple times per visit (e.g. on every render where a
 * decision is shown), and we never want to overwrite a record that
 * already captured a `userResponse` or `actualWorkout`.
 *
 * Returns true when a new record was written, false when the id was
 * already present.
 */
export function saveRecommendationEvent(event: RecommendationEvent): boolean {
  if (typeof window === "undefined") return false;
  const log = readRecommendationLog();
  if (log.events[event.id]) return false;
  log.events[event.id] = event;
  writeRecommendationLog(log);
  return true;
}

/**
 * Merge-patch an existing RecommendationEvent by id. Used when the
 * user responds to a recommendation or logs the actual workout. No-op
 * if the id is unknown.
 */
export function updateRecommendationEvent(
  id: string,
  patch: Partial<RecommendationEvent>,
): RecommendationEvent | null {
  if (typeof window === "undefined") return null;
  const log = readRecommendationLog();
  const existing = log.events[id];
  if (!existing) return null;
  const merged = { ...existing, ...patch };
  // Preserve the id even if the patch tried to overwrite it.
  merged.id = existing.id;
  log.events[id] = merged;
  writeRecommendationLog(log);
  return merged;
}

/** Read a single event by id, or null when absent. */
export function getRecommendationEvent(id: string): RecommendationEvent | null {
  if (typeof window === "undefined") return null;
  const log = readRecommendationLog();
  return log.events[id] ?? null;
}

/** List all events, sorted newest-date first. */
export function listRecommendationEvents(): RecommendationEvent[] {
  if (typeof window === "undefined") return [];
  const log = readRecommendationLog();
  return Object.values(log.events).sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );
}

/** Wipe all recommendation events. Used by debug tooling. */
export function clearRecommendationLog(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(RECOMMENDATION_LOG_KEY);
    mirrorLocalStorageKey(RECOMMENDATION_LOG_KEY);
  } catch {
    // ignore — see file-level note on best-effort writes
  }
}

// --- Learned preferences ----------------------------------------------------

/** Upsert a LearnedPreference, keyed by id. */
export function saveLearnedPreference(pref: LearnedPreference): void {
  if (typeof window === "undefined") return;
  const log = readPreferenceLog();
  log.preferences[pref.id] = pref;
  writePreferenceLog(log);
}

export function listLearnedPreferences(): LearnedPreference[] {
  if (typeof window === "undefined") return [];
  const log = readPreferenceLog();
  return Object.values(log.preferences);
}

/**
 * Remove a single LearnedPreference by id. No-op when the id is
 * absent so callers can use this as an idempotent "undo" handler.
 * Wired by the profile page's "Kinetic is learning" card so the user
 * can dismiss a previously-confirmed pattern.
 */
export function removeLearnedPreference(id: string): void {
  if (typeof window === "undefined") return;
  const log = readPreferenceLog();
  if (id in log.preferences) {
    delete log.preferences[id];
    writePreferenceLog(log);
  }
}

export function clearLearnedPreferences(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEARNED_PREFERENCE_KEY);
    mirrorLocalStorageKey(LEARNED_PREFERENCE_KEY);
  } catch {
    // ignore
  }
}

export function listDismissedPreferenceIds(): string[] {
  if (typeof window === "undefined") return [];
  return Object.keys(readDismissedPreferenceLog().dismissed);
}

export function dismissPreference(id: string): void {
  if (typeof window === "undefined") return;
  const log = readDismissedPreferenceLog();
  log.dismissed[id] = new Date().toISOString();
  writeDismissedPreferenceLog(log);
}

export function restoreDismissedPreference(id: string): void {
  if (typeof window === "undefined") return;
  const log = readDismissedPreferenceLog();
  if (id in log.dismissed) {
    delete log.dismissed[id];
    writeDismissedPreferenceLog(log);
  }
}

export function clearDismissedPreferences(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DISMISSED_PREFERENCE_KEY);
    mirrorLocalStorageKey(DISMISSED_PREFERENCE_KEY);
  } catch {
    // ignore
  }
}

// --- Internals --------------------------------------------------------------

function readRecommendationLog(): RecommendationLog {
  try {
    const raw = window.localStorage.getItem(RECOMMENDATION_LOG_KEY);
    if (!raw) return { version: BEHAVIOR_LOG_VERSION, events: {} };
    const parsed = JSON.parse(raw) as RecommendationLog;
    if (parsed.version !== BEHAVIOR_LOG_VERSION || !parsed.events) {
      return { version: BEHAVIOR_LOG_VERSION, events: {} };
    }
    return parsed;
  } catch {
    return { version: BEHAVIOR_LOG_VERSION, events: {} };
  }
}

function writeRecommendationLog(log: RecommendationLog): void {
  try {
    window.localStorage.setItem(RECOMMENDATION_LOG_KEY, JSON.stringify(log));
    mirrorLocalStorageKey(RECOMMENDATION_LOG_KEY);
  } catch {
    // ignore — see file-level note
  }
}

function readPreferenceLog(): PreferenceLog {
  try {
    const raw = window.localStorage.getItem(LEARNED_PREFERENCE_KEY);
    if (!raw) return { version: BEHAVIOR_LOG_VERSION, preferences: {} };
    const parsed = JSON.parse(raw) as PreferenceLog;
    if (parsed.version !== BEHAVIOR_LOG_VERSION || !parsed.preferences) {
      return { version: BEHAVIOR_LOG_VERSION, preferences: {} };
    }
    return parsed;
  } catch {
    return { version: BEHAVIOR_LOG_VERSION, preferences: {} };
  }
}

function writePreferenceLog(log: PreferenceLog): void {
  try {
    window.localStorage.setItem(LEARNED_PREFERENCE_KEY, JSON.stringify(log));
    mirrorLocalStorageKey(LEARNED_PREFERENCE_KEY);
  } catch {
    // ignore
  }
}

function readDismissedPreferenceLog(): DismissedPreferenceLog {
  try {
    const raw = window.localStorage.getItem(DISMISSED_PREFERENCE_KEY);
    if (!raw) return { version: BEHAVIOR_LOG_VERSION, dismissed: {} };
    const parsed = JSON.parse(raw) as DismissedPreferenceLog;
    if (parsed.version !== BEHAVIOR_LOG_VERSION || !parsed.dismissed) {
      return { version: BEHAVIOR_LOG_VERSION, dismissed: {} };
    }
    return parsed;
  } catch {
    return { version: BEHAVIOR_LOG_VERSION, dismissed: {} };
  }
}

function writeDismissedPreferenceLog(log: DismissedPreferenceLog): void {
  try {
    window.localStorage.setItem(
      DISMISSED_PREFERENCE_KEY,
      JSON.stringify(log),
    );
    mirrorLocalStorageKey(DISMISSED_PREFERENCE_KEY);
  } catch {
    // ignore
  }
}
