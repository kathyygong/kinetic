"use client";

// "Kinetic is learning" card — premium, transparent surface that reads
// the runner's recommendation history out of localStorage, posts it to
// the backend's advisory `/behavior-insights` endpoint, and renders the
// returned patterns + warnings.
//
// Design intent:
//   - Premium: matches the profile page's GlassCard treatment, with a
//     soft indigo/blue corner highlight to mark this surface as a
//     thoughtful, "what we noticed" zone distinct from the static
//     profile facts above it.
//   - Transparent: every row carries an explicit confidence label, a
//     human-readable description, and a verbatim suggested adjustment.
//     A persistent helper line in the header makes it clear that none
//     of these observations modify the runner's plan automatically.
//   - Calm + not creepy: tones are muted (no harsh red/green), and the
//     copy frames findings as "things we noticed" rather than claims
//     about the runner.
//   - User in control: the only side effect is a per-pattern button
//     that confirms or dismisses a preference. Confirmation persists
//     a LearnedPreference locally; dismissing removes it.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, type HTMLMotionProps } from "framer-motion";

import GlassCard from "@/components/GlassCard";
import {
  fetchBehaviorInsights,
  type BehaviorInsightsResponse,
  type BehaviorPattern,
} from "@/lib/api";
import {
  behaviorRepository,
} from "@/lib/persistence/behaviorRepository";
import type { LearnedPreference } from "@/lib/behaviorTypes";
import { auth } from "@/lib/firebase";
import { trackProductEvent } from "@/lib/instrumentation";
import { tokens } from "@/lib/tokens";

// --- Helpers ---------------------------------------------------------------

/**
 * Deterministic preference id derived from the pattern's type + title.
 * Re-fetching the same pattern (whether from the LLM or the deterministic
 * fallback) yields the same id, so toggling "Use this preference" is
 * idempotent across reloads and across server-side code paths.
 */
function buildPreferenceId(p: BehaviorPattern): string {
  const slug = p.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `learned_${p.preference_type}_${slug}`;
}

// Human labels for each `preference_type`. Kept short — they sit
// inside a small pill next to the pattern title.
const PREFERENCE_LABELS: Record<BehaviorPattern["preference_type"], string> = {
  intensity_tolerance: "Intensity",
  rest_day_preference: "Rest days",
  busy_day_preference: "Busy days",
  schedule_preference: "Schedule",
};

// Confidence pill styling. Intentionally muted — we don't want "high"
// to read as urgent or "low" to read as a warning. Each shade nudges
// upward in saturation without ever becoming alarming.
const CONFIDENCE_STYLES: Record<
  BehaviorPattern["confidence"],
  { label: string; className: string }
> = {
  low: {
    label: "Low confidence",
    className:
      "border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-white/10 dark:bg-white/5 dark:text-neutral-300",
  },
  moderate: {
    label: "Moderate",
    className:
      "border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200",
  },
  high: {
    label: "High",
    className:
      "border-indigo-100 bg-indigo-50 text-indigo-700 dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-indigo-200",
  },
};

// How long the inline "Preference saved…" confirmation stays visible
// after the user clicks "Use this preference". Long enough to read the
// reassurance copy, short enough that the card returns to its quiet,
// non-distracting resting state on its own.
const SAVED_NOTICE_MS = 4500;

// --- State machine ---------------------------------------------------------

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: BehaviorInsightsResponse }
  | { kind: "error"; message: string };

// --- Card ------------------------------------------------------------------

export default function MemoryCenter({
  motionProps,
}: {
  motionProps?: HTMLMotionProps<"div">;
}) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [confirmedPreferences, setConfirmedPreferences] = useState<
    LearnedPreference[]
  >([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [historyCount, setHistoryCount] = useState(0);
  // Id of the pattern that was *just* confirmed — used to render the
  // transient "Preference saved…" success note inside its row. Cleared
  // by a timer below so the card returns to its quiet resting state.
  const [justSavedId, setJustSavedId] = useState<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read events out of localStorage, POST them to /behavior-insights,
  // and stash the response. Errors bubble into the error state so the
  // user can retry. We never throw — the card always renders something.
  //
  // We `await auth.authStateReady()` before firing because Firebase
  // hydrates the cached user asynchronously on first paint. Without
  // this, the very first request on a hard refresh fires before
  // `auth.currentUser` is populated and the server returns 401 even
  // when the user has a valid session.
  const refresh = useCallback(async () => {
    setState({ kind: "loading" });
    const startedAt = performance.now();
    try {
      await auth.authStateReady();
      const events = behaviorRepository.listEvents();
      setHistoryCount(events.length);
      const data = await fetchBehaviorInsights(events);
      setState({ kind: "ready", data });
      trackProductEvent("ai_reasoning_completed", {
        surface: "behavior_insights",
        outcome: "success",
        ui_fallback_used: false,
        latency_ms: Math.round(performance.now() - startedAt),
        recommendation_event_count: events.length,
        pattern_count: data.patterns.length,
        warning_count: data.warnings.length,
      });
    } catch (err) {
      setState({
        kind: "error",
        message:
          err instanceof Error ? err.message : "Couldn't reach the server.",
      });
      trackProductEvent("ai_reasoning_completed", {
        surface: "behavior_insights",
        outcome: "failed",
        ui_fallback_used: false,
        latency_ms: Math.round(performance.now() - startedAt),
      });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Hydrate the set of previously-confirmed preference ids so the
  // "Using this preference" affordance reflects state from prior
  // sessions. Runs once on mount; subsequent updates flow through
  // `togglePattern` which keeps `savedIds` in sync with storage.
  useEffect(() => {
    const preferences = behaviorRepository.listConfirmedPreferences();
    const ids = new Set(preferences.map((p) => p.id));
    setSavedIds(ids);
    setConfirmedPreferences(preferences);
    setDismissedIds(new Set(behaviorRepository.listDismissedPatternIds()));
  }, []);

  const togglePattern = useCallback((p: BehaviorPattern) => {
    const id = buildPreferenceId(p);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        // Undo: silently remove the preference and dismiss the notice
        // if it happens to be showing for this row. Removing is purely
        // local — it never touches plan storage, which is the contract
        // documented at the top of this file.
        behaviorRepository.removeConfirmedPreference(id);
        trackProductEvent("learned_preference_updated", {
          action: "dismissed",
          preference_type: p.preference_type,
          confidence: p.confidence,
        });
        next.delete(id);
        setConfirmedPreferences(
          behaviorRepository.listConfirmedPreferences(),
        );
        setJustSavedId((current) => (current === id ? null : current));
      } else {
        // Confirm: persist the LearnedPreference with userConfirmed:true
        // and surface the success note for this row. The recommendation
        // engine consults learned preferences as a soft input — it never
        // rewrites the existing plan on its own, which is what the
        // success copy promises the user.
        behaviorRepository.confirmPreference({
          id,
          type: p.preference_type,
          description: p.description,
          confidence: p.confidence,
          userConfirmed: true,
          createdAt: new Date().toISOString(),
        });
        trackProductEvent("learned_preference_updated", {
          action: "confirmed",
          preference_type: p.preference_type,
          confidence: p.confidence,
        });
        next.add(id);
        setConfirmedPreferences(
          behaviorRepository.listConfirmedPreferences(),
        );
        setJustSavedId(id);
        if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
        noticeTimerRef.current = setTimeout(() => {
          setJustSavedId((current) => (current === id ? null : current));
          noticeTimerRef.current = null;
        }, SAVED_NOTICE_MS);
      }
      return next;
    });
  }, []);

  const dismissPattern = useCallback((p: BehaviorPattern) => {
    const id = buildPreferenceId(p);
    behaviorRepository.dismissPattern(id);
    setDismissedIds((current) => new Set(current).add(id));
    trackProductEvent("learned_preference_updated", {
      action: "dismissed",
      preference_type: p.preference_type,
      confidence: p.confidence,
    });
  }, []);

  const clearMemory = useCallback(() => {
    if (
      !window.confirm(
        "Clear all confirmed and dismissed training preferences? Recommendation history will be kept.",
      )
    ) {
      return;
    }
    behaviorRepository.clearMemory();
    setSavedIds(new Set());
    setConfirmedPreferences([]);
    setDismissedIds(new Set());
  }, []);

  // Clear any pending notice timer on unmount so we don't call
  // `setJustSavedId` on a stale component after navigation.
  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
        noticeTimerRef.current = null;
      }
    };
  }, []);

  // Memoise the patterns/warnings extraction so PatternRow's `saved`
  // prop closes over a stable reference on re-renders that don't
  // change the underlying response.
  const view = useMemo(() => {
    if (state.kind !== "ready") return null;
    return state.data;
  }, [state]);
  const visiblePatterns = useMemo(
    () =>
      view?.patterns.filter(
        (pattern) => !dismissedIds.has(buildPreferenceId(pattern)),
      ) ?? [],
    [dismissedIds, view],
  );

  return (
    <GlassCard
      motionProps={motionProps}
      className="relative overflow-hidden p-6 sm:p-8"
    >
      {/* Soft indigo/blue corner highlight — visually distinct from the
          identity card's sky-blue wash so the page reads as having a
          deliberate hierarchy of premium surfaces. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-gradient-to-br from-indigo-400/15 via-blue-400/10 to-transparent blur-2xl"
      />

      <header className="mb-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
              Training memory
            </h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Review what Kinetic has noticed and what it may use.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <span className="rounded-full border border-black/5 bg-white/60 px-2.5 py-1 text-[11px] font-medium text-neutral-500 dark:border-white/10 dark:bg-white/5 dark:text-neutral-400">
              {historyCount} history {historyCount === 1 ? "record" : "records"}
            </span>
            <button
              type="button"
              onClick={refresh}
              disabled={state.kind === "loading"}
              className={`text-xs font-medium text-neutral-500 underline-offset-4 hover:text-neutral-800 hover:underline disabled:opacity-40 dark:text-neutral-400 dark:hover:text-neutral-200 ${tokens.motion}`}
              aria-label="Refresh behavior insights"
            >
              {state.kind === "loading" ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
          These observations never change your plan unless you confirm them.
        </p>
      </header>

      {confirmedPreferences.length > 0 ? (
        <section className="mb-5 rounded-2xl border border-emerald-200/70 bg-emerald-50/55 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">
                Confirmed preferences
              </h3>
              <p className="mt-0.5 text-xs text-emerald-800/70 dark:text-emerald-200/65">
                Used only as bounded scoring nudges.
              </p>
            </div>
            <button
              type="button"
              onClick={clearMemory}
              className="text-xs font-medium text-emerald-800 underline-offset-4 hover:underline dark:text-emerald-200"
            >
              Clear all
            </button>
          </div>
          <ul className="mt-3 space-y-2">
            {confirmedPreferences.map((preference) => (
              <li
                key={preference.id}
                className="flex items-start justify-between gap-3 rounded-xl bg-white/65 px-3 py-2.5 dark:bg-white/5"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-emerald-950 dark:text-emerald-100">
                    {PREFERENCE_LABELS[preference.type]}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-emerald-900/75 dark:text-emerald-100/70">
                    {preference.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    behaviorRepository.removeConfirmedPreference(preference.id);
                    const preferences =
                      behaviorRepository.listConfirmedPreferences();
                    setConfirmedPreferences(preferences);
                    setSavedIds(new Set(preferences.map((item) => item.id)));
                  }}
                  className="shrink-0 text-xs font-medium text-emerald-800 underline-offset-4 hover:underline dark:text-emerald-200"
                  aria-label={`Remove ${PREFERENCE_LABELS[preference.type]} preference`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {state.kind === "loading" ? (
        <LoadingState />
      ) : state.kind === "error" ? (
        <ErrorState message={state.message} onRetry={refresh} />
      ) : view && visiblePatterns.length === 0 ? (
        <EmptyState warnings={view.warnings} />
      ) : view ? (
        <div className="space-y-3">
          {view.warnings.length > 0 && (
            <WarningNote warnings={view.warnings} />
          )}
          {visiblePatterns.map((p) => (
            <PatternRow
              key={buildPreferenceId(p)}
              pattern={p}
              saved={savedIds.has(buildPreferenceId(p))}
              justSaved={justSavedId === buildPreferenceId(p)}
              onToggle={() => togglePattern(p)}
              onDismiss={() => dismissPattern(p)}
              historyCount={historyCount}
            />
          ))}
        </div>
      ) : null}
    </GlassCard>
  );
}

// --- Subcomponents ---------------------------------------------------------

function PatternRow({
  pattern,
  saved,
  justSaved,
  onToggle,
  onDismiss,
  historyCount,
}: {
  pattern: BehaviorPattern;
  saved: boolean;
  justSaved: boolean;
  onToggle: () => void;
  onDismiss: () => void;
  historyCount: number;
}) {
  const conf = CONFIDENCE_STYLES[pattern.confidence];
  const typeLabel = PREFERENCE_LABELS[pattern.preference_type];

  return (
    <motion.div
      layout
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-xl border border-black/5 bg-white/40 p-4 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.03]"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {pattern.title}
            </h3>
            <span className="inline-flex items-center rounded-full border border-neutral-200 bg-white/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-neutral-500 dark:border-white/10 dark:bg-white/5 dark:text-neutral-400">
              {typeLabel}
            </span>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
            {pattern.description}
          </p>
          <p className="mt-2 text-xs italic leading-relaxed text-neutral-500 dark:text-neutral-400">
            <span className="font-medium not-italic text-neutral-600 dark:text-neutral-300">
              Suggested:
            </span>{" "}
            {pattern.suggested_adjustment}
          </p>
          <p className="mt-2 text-[11px] text-neutral-400 dark:text-neutral-500">
            Based on {historyCount} recent recommendation{" "}
            {historyCount === 1 ? "record" : "records"}.
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${conf.className}`}
          aria-label={`Confidence: ${conf.label}`}
        >
          {conf.label}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        {!saved ? (
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            Dismiss
          </button>
        ) : null}
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={saved}
          className={
            saved
              ? `inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:bg-emerald-950/50 ${tokens.motion}`
              : `inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-black/20 hover:bg-white dark:border-white/15 dark:bg-neutral-900/60 dark:text-neutral-200 dark:hover:bg-neutral-900 ${tokens.motion}`
          }
        >
          {saved ? (
            <>
              <CheckIcon />
              Using this preference
            </>
          ) : (
            "Use this preference"
          )}
        </button>
      </div>

      {/* Transient success state. Lives below the row controls so it
          reads like a footer confirmation rather than a banner. Uses
          `aria-live="polite"` so screen readers announce the save
          without interrupting the runner's current focus. */}
      <AnimatePresence initial={false}>
        {justSaved && (
          <motion.div
            key="saved-notice"
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
            role="status"
            aria-live="polite"
          >
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs leading-relaxed text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
              <CheckIcon />
              <span>
                Preference saved. Kinetic will use this conservatively in
                future recommendations.
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function WarningNote({ warnings }: { warnings: string[] }) {
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${tokens.primary.soft}`}>
      {warnings.map((w, i) => (
        <p key={i} className="leading-relaxed">
          {w}
        </p>
      ))}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="animate-pulse rounded-xl border border-black/5 bg-white/30 p-4 dark:border-white/10 dark:bg-white/[0.02]"
        >
          <div className="h-3.5 w-1/3 rounded bg-neutral-200/80 dark:bg-white/10" />
          <div className="mt-2.5 h-3 w-2/3 rounded bg-neutral-200/60 dark:bg-white/[0.07]" />
          <div className="mt-2 h-3 w-1/2 rounded bg-neutral-200/60 dark:bg-white/[0.07]" />
        </div>
      ))}
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-xl border border-black/5 bg-white/30 p-4 text-sm text-neutral-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-neutral-300">
      <p>Couldn&apos;t load insights right now.</p>
      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className={`mt-3 inline-flex items-center rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-black/20 hover:bg-white dark:border-white/15 dark:bg-neutral-900/60 dark:text-neutral-200 dark:hover:bg-neutral-900 ${tokens.motion}`}
      >
        Try again
      </button>
    </div>
  );
}

function EmptyState({ warnings }: { warnings: string[] }) {
  // Match the message to the backend's signal: a "no history" warning
  // means the user hasn't engaged with recommendations yet; a "limited
  // history" warning means we have some signal but not enough to
  // surface anything. Absent both, we have ≥5 events but no pattern
  // crossed the threshold — that's a genuine "no clear patterns" state.
  const hasNoHistory = warnings.some((w) =>
    /no recommendation history/i.test(w),
  );
  const isLimited = warnings.some((w) => /limited history/i.test(w));
  const message = hasNoHistory
    ? "We haven't seen your runs yet. Recommendations you accept or adjust will show up here over time."
    : isLimited
      ? "We need a few more days of recommendations before patterns are reliable enough to surface here."
      : "No clear patterns yet — Kinetic is still gathering signal from your training.";

  return (
    <div className="rounded-xl border border-dashed border-black/10 bg-white/20 p-5 text-center text-sm leading-relaxed text-neutral-500 dark:border-white/10 dark:bg-white/[0.02] dark:text-neutral-400">
      <p>{message}</p>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className="h-3.5 w-3.5"
    >
      <path
        fillRule="evenodd"
        d="M16.704 5.293a1 1 0 010 1.414l-7.5 7.5a1 1 0 01-1.414 0l-3.5-3.5a1 1 0 011.414-1.414l2.793 2.793 6.793-6.793a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}
