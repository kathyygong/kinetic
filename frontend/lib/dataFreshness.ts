// Data freshness helpers used by the dashboard to decide how much to
// trust today's recommendation.
//
// Two sources today:
//   - Recovery: derived from the most recent ManualReadiness entry's
//     `updated_at`. Reflects when the user last manually logged how
//     they're feeling.
//   - Calendar: the time we last successfully fetched the live calendar
//     availability from the backend. Persisted in localStorage so we
//     can flag a long gap even after a reload.
//
// The numbers are forwarded to the backend on every `/decision` call;
// the backend folds them into the confidence score and emits matching
// human-readable warnings on `staleness_warnings` for the UI to render.
//
// All helpers are SSR-safe — they no-op when window is undefined.

import { getReadinessLog } from "./readinessStorage";

export const CALENDAR_SYNC_STORAGE_KEY = "kinetic_calendar_last_sync";

/** Hours since `iso`, or null when the timestamp can't be parsed. */
function hoursSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const ageMs = Date.now() - t;
  if (ageMs < 0) return 0;
  return ageMs / (1000 * 60 * 60);
}

/**
 * Hours since the most recent readiness entry across the whole log,
 * or null when nothing has ever been logged on this device.
 *
 * We deliberately scan the log instead of just looking at "today" —
 * yesterday's reading is still useful (mildly stale), but no reading
 * at all is a stronger signal that the engine is flying blind.
 */
export function getRecoveryAgeHours(): number | null {
  const log = getReadinessLog();
  let latest: string | null = null;
  for (const entry of Object.values(log.entries)) {
    if (!entry?.updated_at) continue;
    if (!latest || entry.updated_at > latest) {
      latest = entry.updated_at;
    }
  }
  return hoursSince(latest);
}

/**
 * Stamp "now" as the last successful calendar sync. Called after the
 * dashboard's `/availability/week` fetch resolves with a 2xx — that's
 * the only source of truth we have for "the calendar talked back".
 */
export function recordCalendarSync(at: Date = new Date()): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      CALENDAR_SYNC_STORAGE_KEY,
      at.toISOString(),
    );
  } catch {
    // Best-effort; storage may be disabled. We'll just not flag staleness.
  }
}

/** ISO timestamp of the last successful calendar sync, or null. */
export function getCalendarLastSync(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CALENDAR_SYNC_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Hours since the last successful calendar sync, or null when never synced. */
export function getCalendarAgeHours(): number | null {
  return hoursSince(getCalendarLastSync());
}

export type DataFreshness = {
  recovery_age_hours: number | null;
  calendar_age_hours: number | null;
};

/** Snapshot both freshness signals for the next `/decision` request. */
export function computeDataFreshness(): DataFreshness {
  return {
    recovery_age_hours: getRecoveryAgeHours(),
    calendar_age_hours: getCalendarAgeHours(),
  };
}
