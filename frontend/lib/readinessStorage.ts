// localStorage helpers for manually-entered readiness signals.
//
// Until Apple Health / Oura / Garmin / Google Fit integrations land, this
// is the only source of truth for how the athlete is feeling on a given
// day. The recovery page lets users record sleep / HRV / RHR / fatigue /
// soreness, and the dashboard reads the most recent entry to override
// the demo-scenario biometrics on the `/decision` request.
//
// Storage shape: { entries: Record<YYYY-MM-DD, ManualReadiness> }
// Keying by date gives us a per-day history "for free" so the line
// charts on /recovery can eventually graph real entries.
//
// All helpers are SSR-safe — they no-op when window is undefined.

export const READINESS_STORAGE_KEY = "kinetic_readiness";

/** 1 = fresh, 5 = wiped. */
export type FatigueLevel = 1 | 2 | 3 | 4 | 5;
/** 1 = none, 5 = very sore. */
export type SorenessLevel = 1 | 2 | 3 | 4 | 5;

/**
 * One day's manually-entered readiness. All metric fields are optional
 * — users can record only what they have without filling in the rest.
 */
export type ManualReadiness = {
  /** Local-day key in YYYY-MM-DD form. */
  date: string;
  sleep_hours?: number;
  hrv?: number;
  resting_hr?: number;
  fatigue_level?: FatigueLevel;
  soreness_level?: SorenessLevel;
  /** ISO timestamp of the most recent edit. */
  updated_at: string;
};

export type ReadinessLog = {
  entries: Record<string, ManualReadiness>;
};

/**
 * Format a Date as a stable local-day key. Using local-time so the entry
 * the user types after midnight in their timezone is recorded against
 * "today" rather than skipping a day.
 */
export function isoDateKey(d: Date = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function emptyLog(): ReadinessLog {
  return { entries: {} };
}

/** Read the full readiness log, or an empty one if storage is empty/invalid. */
export function getReadinessLog(): ReadinessLog {
  if (typeof window === "undefined") return emptyLog();
  try {
    const raw = window.localStorage.getItem(READINESS_STORAGE_KEY);
    if (!raw) return emptyLog();
    const parsed: unknown = JSON.parse(raw);
    if (!isReadinessLog(parsed)) return emptyLog();
    return parsed;
  } catch {
    return emptyLog();
  }
}

/** Persist the full readiness log. */
function saveReadinessLog(log: ReadinessLog): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(READINESS_STORAGE_KEY, JSON.stringify(log));
  } catch {
    // Storage unavailable — silently ignore.
  }
}

/** Get the entry for a specific local-day key, or null if none. */
export function getReadinessForDate(date: string): ManualReadiness | null {
  const log = getReadinessLog();
  return log.entries[date] ?? null;
}

/** Get today's entry, or null if none has been recorded yet. */
export function getTodayReadiness(): ManualReadiness | null {
  return getReadinessForDate(isoDateKey());
}

/**
 * Rolling N-day average of each readiness metric, computed from the
 * user's actual entries. Acts as the "your normal" reference against
 * which today's values are compared on the dashboard insights.
 *
 * Until per-metric baselines are surfaced from a biometrics
 * integration, this stays the single source of truth: HRV / sleep /
 * resting HR all anchor against the runner's own recent history.
 */
export type ReadinessBaselines = {
  hrv?: number;
  sleep_hours?: number;
  resting_hr?: number;
};

/**
 * Compute the rolling N-day average for each readiness metric from the
 * supplied (or stored) readiness log. The window is inclusive of today,
 * so a single entry trivially produces a baseline equal to that entry —
 * meaning today's deviation reads as zero until the runner has built up
 * a few more days of history. Metrics with no entries in the window
 * return `undefined` so the caller can hide the corresponding insight.
 */
export function getReadinessBaselines(
  days = 30,
  log?: ReadinessLog,
): ReadinessBaselines {
  const source = log ?? getReadinessLog();
  // Local-day cutoff key — entries stamped on or after this date count.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cutoffKey = isoDateKey(cutoff);

  const hrv: number[] = [];
  const sleep: number[] = [];
  const rhr: number[] = [];

  for (const [date, entry] of Object.entries(source.entries)) {
    if (date < cutoffKey) continue;
    if (typeof entry.hrv === "number") hrv.push(entry.hrv);
    if (typeof entry.sleep_hours === "number") sleep.push(entry.sleep_hours);
    if (typeof entry.resting_hr === "number") rhr.push(entry.resting_hr);
  }

  return {
    hrv: hrv.length > 0 ? avg(hrv) : undefined,
    sleep_hours: sleep.length > 0 ? avg(sleep) : undefined,
    resting_hr: rhr.length > 0 ? avg(rhr) : undefined,
  };
}

function avg(arr: number[]): number {
  let sum = 0;
  for (const n of arr) sum += n;
  return sum / arr.length;
}

/**
 * Merge `patch` into the entry for `date`, creating it if missing.
 * Returns the merged entry. Caller-provided `updated_at` is overwritten
 * so the timestamp always reflects the actual save.
 */
export function saveReadinessForDate(
  date: string,
  patch: Omit<Partial<ManualReadiness>, "date" | "updated_at">,
): ManualReadiness {
  const log = getReadinessLog();
  const existing = log.entries[date];
  const merged: ManualReadiness = {
    date,
    ...existing,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  log.entries[date] = merged;
  saveReadinessLog(log);
  return merged;
}

/**
 * Replace the entry for `date` with exactly the fields supplied —
 * any prior entry for the same day is discarded so the most recent
 * explicit save wins. Use this for the "Save" affordance on the
 * Recovery page; use `saveReadinessForDate` for partial / merge-style
 * persistence.
 */
export function replaceReadinessForDate(
  date: string,
  fields: Omit<Partial<ManualReadiness>, "date" | "updated_at">,
): ManualReadiness {
  const log = getReadinessLog();
  // Strip any explicitly-undefined keys so the saved entry only carries
  // metrics the user actually filled in.
  const cleaned: Partial<ManualReadiness> = {};
  for (const [k, v] of Object.entries(fields) as Array<
    [keyof typeof fields, unknown]
  >) {
    if (v !== undefined) {
      (cleaned as Record<string, unknown>)[k] = v;
    }
  }
  const replaced: ManualReadiness = {
    date,
    ...cleaned,
    updated_at: new Date().toISOString(),
  };
  log.entries[date] = replaced;
  saveReadinessLog(log);
  return replaced;
}

/** Remove the entry for `date`. No-op when none exists. */
export function clearReadinessForDate(date: string): void {
  const log = getReadinessLog();
  if (!log.entries[date]) return;
  delete log.entries[date];
  saveReadinessLog(log);
}

// --- Validation ------------------------------------------------------------

function isReadinessLog(value: unknown): value is ReadinessLog {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.entries !== "object" || v.entries === null) return false;
  for (const [k, e] of Object.entries(v.entries as Record<string, unknown>)) {
    if (typeof k !== "string") return false;
    if (!isManualReadiness(e)) return false;
  }
  return true;
}

function isManualReadiness(value: unknown): value is ManualReadiness {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.date !== "string") return false;
  if (typeof v.updated_at !== "string") return false;
  if (v.sleep_hours !== undefined && !isNonNegFinite(v.sleep_hours)) return false;
  if (v.hrv !== undefined && !isNonNegFinite(v.hrv)) return false;
  if (v.resting_hr !== undefined && !isNonNegFinite(v.resting_hr)) return false;
  if (v.fatigue_level !== undefined && !isLevel1to5(v.fatigue_level)) return false;
  if (v.soreness_level !== undefined && !isLevel1to5(v.soreness_level)) return false;
  return true;
}

function isNonNegFinite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

function isLevel1to5(n: unknown): n is FatigueLevel {
  return (
    typeof n === "number" &&
    Number.isInteger(n) &&
    n >= 1 &&
    n <= 5
  );
}
