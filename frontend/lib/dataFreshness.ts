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
import { mirrorLocalStorageKey } from "./persistence/mirror";

export const CALENDAR_SYNC_STORAGE_KEY = "kinetic_calendar_last_sync";
/**
 * ISO timestamp of the most recent failed calendar fetch (e.g.
 * `/availability/week` returning 503 because the backend's Google
 * OAuth token expired). Tracked separately from the success
 * timestamp so the UI can show a "Calendar offline" sub-state on
 * the Profile page while still remembering when the last good sync
 * happened.
 */
export const CALENDAR_FAILURE_STORAGE_KEY = "kinetic_calendar_last_failure";

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
 *
 * Also clears any previously-recorded failure so the UI returns to a
 * healthy state the instant the integration recovers.
 */
export function recordCalendarSync(at: Date = new Date()): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      CALENDAR_SYNC_STORAGE_KEY,
      at.toISOString(),
    );
    window.localStorage.removeItem(CALENDAR_FAILURE_STORAGE_KEY);
    mirrorLocalStorageKey(CALENDAR_SYNC_STORAGE_KEY);
    mirrorLocalStorageKey(CALENDAR_FAILURE_STORAGE_KEY);
  } catch {
    // Best-effort; storage may be disabled. We'll just not flag staleness.
  }
}

/**
 * Stamp "now" as the time the calendar layer failed to talk back
 * (e.g. the dashboard's `/availability/week` returned 503 because the
 * backend's Google OAuth token expired). The Profile page reads this
 * to swap the misleading "Last synced" subtitle for a "Couldn't reach
 * Google · Reconnect" affordance so the user can actually fix it
 * instead of trusting silently-broken state.
 *
 * Best-effort: storage may be disabled. In that case the UI just
 * stays in its previous state.
 */
export function recordCalendarFailure(at: Date = new Date()): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      CALENDAR_FAILURE_STORAGE_KEY,
      at.toISOString(),
    );
    mirrorLocalStorageKey(CALENDAR_FAILURE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Clear the last-failure stamp WITHOUT also stamping a fake success.
 * Used when the user clicks Reconnect on the Profile page: their
 * action invalidates the stale "calendar offline" signal, but it
 * doesn't prove the backend can actually reach Google again — the
 * next real `/availability/week` call will do that. Until then we
 * defer to the backend health probe.
 *
 * Best-effort: storage may be disabled.
 */
export function clearCalendarFailure(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CALENDAR_FAILURE_STORAGE_KEY);
    mirrorLocalStorageKey(CALENDAR_FAILURE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Clear both success and failure calendar freshness markers. */
export function clearCalendarFreshness(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CALENDAR_SYNC_STORAGE_KEY);
    window.localStorage.removeItem(CALENDAR_FAILURE_STORAGE_KEY);
    mirrorLocalStorageKey(CALENDAR_SYNC_STORAGE_KEY);
    mirrorLocalStorageKey(CALENDAR_FAILURE_STORAGE_KEY);
  } catch {
    // ignore
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

/** ISO timestamp of the last calendar fetch failure, or null. */
export function getCalendarLastFailure(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CALENDAR_FAILURE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Hours since the last successful calendar sync, or null when never synced. */
export function getCalendarAgeHours(): number | null {
  return hoursSince(getCalendarLastSync());
}

/**
 * True when the most recent calendar fetch failed and we haven't
 * recovered since. `recordCalendarSync` clears the failure stamp on
 * success, so the only way this returns true is if the last attempt
 * actually failed — perfect signal for showing a "Reconnect needed"
 * pill on the Profile without false positives from old timestamps.
 *
 * SSR-safe: returns false on the server (no storage).
 */
export function isCalendarUnhealthy(): boolean {
  const failure = getCalendarLastFailure();
  if (!failure) return false;
  const success = getCalendarLastSync();
  if (!success) return true;
  // String compare works because both values are ISO 8601 in the same
  // timezone format. If the failure happened after the most recent
  // success, the calendar is currently considered unhealthy.
  return failure > success;
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
