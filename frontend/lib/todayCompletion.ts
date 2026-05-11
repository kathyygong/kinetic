// Date-keyed "did I respond / complete today?" state.
//
// The workout log in `workoutLog.ts` is intentionally keyed by
// `(week, day)` within the saved plan so it can power cross-plan stats
// ("you completed 5 of 6 long runs"). But the dashboard's CTA state
// — "did the runner already pick accept/reject and mark
// completed/skipped today?" — is a date-keyed fact that needs to
// survive navigation even when:
//   - today is a planned rest day (no slot to log against)
//   - the plan was regenerated and the old (week, day) key no longer
//     matches
//   - today falls outside the saved plan's week window
//
// Keeping this in its own tiny store makes the dashboard hydration
// deterministic without coupling it to the plan's shape.

const STORAGE_KEY = "kinetic_today_completion";

export type ResponseStatus = "pending" | "accepted" | "rejected";
export type CompletionStatus = "pending" | "completed" | "skipped";

export type TodayCompletion = {
  /** Local-time ISO date the entry was written for (yyyy-mm-dd). */
  date: string;
  /** Whether the runner accepted or rejected the engine's adjustment. */
  responseStatus: ResponseStatus;
  /** Whether the runner marked the workout completed or skipped. */
  completionStatus: CompletionStatus;
};

function isoDate(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Read today's completion entry. Returns null when nothing is stored
 * or when the stored entry is for a different calendar day — so
 * yesterday's "completed" never leaks into today's empty dashboard.
 */
export function getTodayCompletion(
  now: Date = new Date(),
): TodayCompletion | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TodayCompletion;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.date !== isoDate(now)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Merge a patch into today's completion entry, creating it if missing.
 * Unspecified fields keep their prior value, or default to "pending"
 * on first write. Stamped with today's date so a stale entry from
 * yesterday is always overwritten rather than appended to.
 */
export function setTodayCompletion(
  patch: Partial<Omit<TodayCompletion, "date">>,
  now: Date = new Date(),
): void {
  if (typeof window === "undefined") return;
  try {
    const existing = getTodayCompletion(now);
    const next: TodayCompletion = {
      date: isoDate(now),
      responseStatus: existing?.responseStatus ?? "pending",
      completionStatus: existing?.completionStatus ?? "pending",
      ...patch,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore — non-fatal, the in-memory state still reflects the click
  }
}

/** Discard today's entry. Used when the runner hits "Change" on the
 *  dashboard CTA to start the choose-and-confirm flow over. */
export function clearTodayCompletion(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
