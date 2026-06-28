"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";

import GlassCard from "@/components/GlassCard";
import PageContainer from "@/components/PageContainer";
import AthleticImage from "@/components/AthleticImage";
import RevealSection from "@/components/RevealSection";
import ProgressRing from "@/components/ProgressRing";
import AnimatedNumber from "@/components/AnimatedNumber";
import {
  READINESS_STORAGE_KEY,
  type FatigueLevel,
  type ManualReadiness,
  type ReadinessBaselines,
  type ReadinessLog,
  type SorenessLevel,
  clearReadinessForDate,
  getReadinessBaselines,
  getReadinessLog,
  getTodayReadiness,
  isoDateKey,
  replaceReadinessForDate,
} from "@/lib/readinessStorage";
import {
  classifyRecoveryState,
  computeRecoveryScore01,
  recoveryStateTone,
  type RecoveryState,
} from "@/lib/recoveryScore";
import { tokens } from "@/lib/tokens";

// --- Motion ----------------------------------------------------------------

// Same Apple-style deceleration we use across the app — keeps entrances
// feeling settled rather than snappy.
const PREMIUM_EASE = [0.22, 1, 0.36, 1] as const;

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: PREMIUM_EASE },
  },
};

// --- Static labels ---------------------------------------------------------

// Five-step fatigue scale: 1 = fresh / 5 = wiped. Labels lifted from
// common training-readiness questionnaires so the language reads as
// natural to athletes.
const FATIGUE_OPTIONS: Array<{ value: FatigueLevel; label: string }> = [
  { value: 1, label: "Fresh" },
  { value: 2, label: "Good" },
  { value: 3, label: "Average" },
  { value: 4, label: "Tired" },
  { value: 5, label: "Wiped" },
];

// Five-step soreness scale: 1 = none / 5 = very sore. Mirrors common
// post-session DOMS rating language so users can answer instinctively.
const SORENESS_OPTIONS: Array<{ value: SorenessLevel; label: string }> = [
  { value: 1, label: "None" },
  { value: 2, label: "Mild" },
  { value: 3, label: "Moderate" },
  { value: 4, label: "Sore" },
  { value: 5, label: "Very sore" },
];

// --- Draft helpers ----------------------------------------------------------

/**
 * In-flight form state. Holds whatever the user has typed since the
 * last save (or since the form was hydrated from today's saved entry).
 * Mirrors `ManualReadiness` minus the bookkeeping fields — we synthesise
 * `date` and `updated_at` at save time.
 */
type DraftReadiness = {
  sleep_hours?: number;
  hrv?: number;
  resting_hr?: number;
  fatigue_level?: FatigueLevel;
  soreness_level?: SorenessLevel;
};

/** Project a saved entry back into a draft so the form pre-fills. */
function toDraft(saved: ManualReadiness | null): DraftReadiness {
  if (!saved) return {};
  const draft: DraftReadiness = {};
  if (saved.sleep_hours !== undefined) draft.sleep_hours = saved.sleep_hours;
  if (saved.hrv !== undefined) draft.hrv = saved.hrv;
  if (saved.resting_hr !== undefined) draft.resting_hr = saved.resting_hr;
  if (saved.fatigue_level !== undefined) draft.fatigue_level = saved.fatigue_level;
  if (saved.soreness_level !== undefined) draft.soreness_level = saved.soreness_level;
  return draft;
}

/** Whether the user has typed anything at all into the form. */
function hasAnyValue(d: DraftReadiness): boolean {
  return (
    d.sleep_hours !== undefined ||
    d.hrv !== undefined ||
    d.resting_hr !== undefined ||
    d.fatigue_level !== undefined ||
    d.soreness_level !== undefined
  );
}

/**
 * Field-by-field comparison so the Save button can disable itself when
 * the form already matches the persisted entry. Treats decimal sleep
 * values that round to the same hours+minutes display as equal.
 */
function draftMatchesSaved(
  draft: DraftReadiness,
  saved: ManualReadiness | null,
): boolean {
  const savedDraft = toDraft(saved);
  return (
    sleepHoursEqual(draft.sleep_hours, savedDraft.sleep_hours) &&
    draft.hrv === savedDraft.hrv &&
    draft.resting_hr === savedDraft.resting_hr &&
    draft.fatigue_level === savedDraft.fatigue_level &&
    draft.soreness_level === savedDraft.soreness_level
  );
}

function sleepHoursEqual(a: number | undefined, b: number | undefined): boolean {
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;
  // Compare at minute granularity since that's what the inputs expose.
  return Math.round(a * 60) === Math.round(b * 60);
}

/** Hours portion of a decimal sleep_hours value (floor). */
function splitSleepHours(decimal: number | undefined): number | undefined {
  if (decimal === undefined || !Number.isFinite(decimal)) return undefined;
  return Math.floor(decimal);
}

/** Minutes portion of a decimal sleep_hours value (rounded to nearest minute). */
function splitSleepMinutes(decimal: number | undefined): number | undefined {
  if (decimal === undefined || !Number.isFinite(decimal)) return undefined;
  const minutes = Math.round((decimal - Math.floor(decimal)) * 60);
  // Cap at 59 so a value like 7.999 doesn't render "7h 60m".
  return Math.min(minutes, 59);
}

// --- Page -------------------------------------------------------------------

export default function RecoveryPage() {
  // Until biometric integrations land, manual entry is the only real
  // signal source. We hydrate from localStorage on mount so SSR stays
  // deterministic (no hydration mismatch from a missing entry).
  const [today, setToday] = useState<ManualReadiness | null>(null);
  // Full readiness log so the metric charts can plot the user's actual
  // entries (sparse points) rather than synthetic mock data.
  const [log, setLog] = useState<ReadinessLog>({ entries: {} });
  // In-flight draft — mirrors the form fields and only commits to
  // localStorage when the user presses Save. Allows the form to feel
  // like a single "save the whole reading" interaction rather than
  // saving on every keystroke.
  const [draft, setDraft] = useState<DraftReadiness>({});
  const [hydrated, setHydrated] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    const log0 = getReadinessLog();
    const today0 = getTodayReadiness();
    setLog(log0);
    setToday(today0);
    setDraft(toDraft(today0));
    setHydrated(true);
  }, []);

  // Cross-tab sync: if the user clears or edits readiness from another
  // tab (or the dashboard nukes the entry), refresh both today's value
  // and the full log so the charts update without a hard reload.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === READINESS_STORAGE_KEY || e.key === null) {
        const log0 = getReadinessLog();
        const today0 = getTodayReadiness();
        setLog(log0);
        setToday(today0);
        setDraft(toDraft(today0));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // 30-day sparse series built from the user's actual entries. Days
  // without a logged value are gaps — the chart connects only the
  // points that exist so the curve always reflects real data.
  const hrv = useMemo(() => buildSparseSeries(log, "hrv", 30), [log]);
  const sleep = useMemo(
    () => buildSparseSeries(log, "sleep_hours", 30),
    [log],
  );
  const rhr = useMemo(
    () => buildSparseSeries(log, "resting_hr", 30),
    [log],
  );

  // Baselines are the user's rolling 30-day averages — fed into the
  // shared recovery-score helper so the HRV component is computed as a
  // ratio against the runner's own history (matches the backend's
  // formula and the dashboard ring).
  const baselines: ReadinessBaselines = useMemo(
    () => {
      void log;
      return getReadinessBaselines(30);
    },
    [log],
  );

  // The score and state both flow through the SAME helpers used by the
  // dashboard, so the number you see here always equals the number on
  // the dashboard ring for the same inputs. When `today` is null we
  // fall back to the most recent logged values so the page still has
  // something to show — the score then represents "your latest
  // reading", not "today's reading", and the caption below the ring
  // makes that distinction.
  const fallbackReadiness: ManualReadiness | null = useMemo(() => {
    if (today) return today;
    const latestHrv = hrv.points.at(-1)?.value;
    const latestSleep = sleep.points.at(-1)?.value;
    const latestRhr = rhr.points.at(-1)?.value;
    if (
      latestHrv === undefined &&
      latestSleep === undefined &&
      latestRhr === undefined
    ) {
      return null;
    }
    // Synthesise a ManualReadiness from the chart values. We don't
    // have self-reports for past days here — just the metrics. The
    // synthetic timestamp anchors the entry to the latest point's
    // calendar date so downstream staleness checks stay sensible.
    const latestDate = hrv.points.at(-1)?.date ?? isoDateKey(new Date());
    return {
      date: latestDate,
      updated_at: new Date(`${latestDate}T00:00:00`).toISOString(),
      ...(latestHrv !== undefined ? { hrv: latestHrv } : {}),
      ...(latestSleep !== undefined ? { sleep_hours: latestSleep } : {}),
      ...(latestRhr !== undefined ? { resting_hr: latestRhr } : {}),
    };
  }, [today, hrv.points, sleep.points, rhr.points]);

  const score01 = useMemo(
    () => computeRecoveryScore01(fallbackReadiness, baselines),
    [fallbackReadiness, baselines],
  );
  const recoveryState: RecoveryState | null = useMemo(
    () => classifyRecoveryState(fallbackReadiness, baselines),
    [fallbackReadiness, baselines],
  );

  const recoveryScore = useMemo(() => {
    if (score01 === null) {
      return {
        score: null as number | null,
        label: "Log a reading to see your score",
        tone: "text-neutral-500 dark:text-neutral-400",
      };
    }
    const score = Math.round(score01 * 100);
    // Label + tone follow the engine's state classification rather than
    // raw thresholds so they always agree with the dashboard's tone.
    if (recoveryState === "at_risk") {
      return { score, label: "At risk — prioritise rest", tone: tokens.danger.text };
    }
    if (recoveryState === "fatigued") {
      return { score, label: "Fatigued — keep it easy", tone: tokens.warning.text };
    }
    return { score, label: "Ready to train", tone: tokens.success.text };
  }, [score01, recoveryState]);

  // Whether the form has unsaved edits relative to the last persisted
  // entry. Used to enable / disable the Save button.
  const dirty = useMemo(
    () => !draftMatchesSaved(draft, today),
    [draft, today],
  );

  // Whether the draft has any populated field at all. Saving an empty
  // draft would create a record with no metrics — we treat that as a
  // no-op so users use "Clear today" to remove an entry instead.
  const draftHasAny = useMemo(() => hasAnyValue(draft), [draft]);

  // --- Manual entry handlers ---------------------------------------------

  // Update a single draft field. Setting a value to `undefined` removes
  // the key entirely so empty-vs-zero stays unambiguous.
  const updateDraft = <K extends keyof DraftReadiness>(
    key: K,
    value: DraftReadiness[K] | undefined,
  ) => {
    setDraft((prev) => {
      const next: DraftReadiness = { ...prev };
      if (value === undefined) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  };

  // Combine the hours + minutes inputs back into the canonical decimal
  // sleep_hours we persist. Either field being undefined treats that
  // half as zero unless both are missing — in which case the metric is
  // cleared entirely.
  const updateSleep = (hours: number | undefined, minutes: number | undefined) => {
    if (hours === undefined && minutes === undefined) {
      updateDraft("sleep_hours", undefined);
      return;
    }
    const decimal = (hours ?? 0) + (minutes ?? 0) / 60;
    updateDraft("sleep_hours", decimal);
  };

  // Persist the current draft as the day's saved entry, fully replacing
  // any prior entry for today so the most recent save wins.
  const handleSave = () => {
    if (!draftHasAny || !dirty) return;
    const saved = replaceReadinessForDate(isoDateKey(), draft);
    setToday(saved);
    setDraft(toDraft(saved));
    setLog(getReadinessLog());
    setJustSaved(true);
    window.clearTimeout(savedTimerRef.current);
    savedTimerRef.current = window.setTimeout(() => setJustSaved(false), 1600);
  };

  const handleClear = () => {
    clearReadinessForDate(isoDateKey());
    setToday(null);
    setDraft({});
    setLog(getReadinessLog());
    setJustSaved(false);
  };

  return (
    <PageContainer className="mx-auto w-full max-w-3xl px-2 py-12 sm:py-16">
      <RevealSection as="header" className="mb-10" y={18}>
        <AthleticImage
          src="/images/athletic/runner-trail.jpg"
          alt="Runner on an open road under a clear blue sky"
          eyebrow="Readiness & recovery"
          title="Recovery"
          headingLevel="h1"
          subtitle="How recovered you are today — and the signals behind it."
          className="h-52 sm:h-60"
          priority
        />
      </RevealSection>

      {/* Hero — large recovery score, centered, framed by an */}
      {/* animated progress ring so the number reads at a glance. */}
      <section className="mb-12 flex flex-col items-center text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
          Recovery score
        </p>
        <div className="mt-6">
          <ProgressRing
            value={(recoveryScore.score ?? 0) / 100}
            size={184}
            stroke={12}
            tone={recoveryStateTone(recoveryState)}
            delay={0.15}
          >
            {recoveryScore.score != null ? (
              <div className="flex items-baseline gap-1 tabular-nums">
                <AnimatedNumber
                  value={recoveryScore.score}
                  duration={1.2}
                  className="text-5xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50"
                />
                <span className="text-base font-medium text-neutral-400">
                  /100
                </span>
              </div>
            ) : (
              <span className="text-3xl font-medium text-neutral-400">—</span>
            )}
          </ProgressRing>
        </div>
        <p className={`mt-5 text-sm font-medium ${recoveryScore.tone}`}>
          {recoveryScore.label}
        </p>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {recoveryScore.score === null
            ? "Log HRV, sleep, or resting heart rate to start tracking."
            : today
              ? "Based on the readings you logged today, blended with the last 7 days of trends."
              : "Based on your most recent HRV, sleep, and resting heart rate readings."}
        </p>
        {/* Band legend — keeps the score range ↔ state mapping visible
            so users can never wonder whether 79 is "good" or "bad". */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            80–100 Recovered
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            50–79 Fatigued
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            0–49 At risk
          </span>
        </div>
      </section>

      {/* Manual entry — primary action until biometric integrations land */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={itemVariants}
        className="mb-4"
      >
        <ManualEntryCard
          today={today}
          draft={draft}
          dirty={dirty}
          canSave={dirty && draftHasAny}
          hydrated={hydrated}
          justSaved={justSaved}
          onDraftChange={updateDraft}
          onSleepChange={updateSleep}
          onSave={handleSave}
          onClear={handleClear}
        />
      </motion.div>

      {/* Confirmation that today's training recommendation reacts to
          these inputs. Hidden until the user has actually logged
          something so we don't pre-promise an effect they haven't
          triggered yet. */}
      {hydrated && today && (
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: PREMIUM_EASE }}
          className="mb-12 text-center text-xs text-neutral-500 dark:text-neutral-400"
        >
          Today&apos;s training recommendation updates each time you save.{" "}
          <Link
            href="/dashboard"
            className="font-medium text-blue-600 underline-offset-4 hover:underline dark:text-blue-400"
          >
            View on dashboard →
          </Link>
        </motion.p>
      )}
      {!(hydrated && today) && <div className="mb-8" />}

      {/* Metric cards */}
      <div className="space-y-5">
        <RevealSection delay={0.03}>
          <MetricCard
            name="HRV"
            unit="ms"
            series={hrv}
            higherIsBetter
            format={(n) => n.toFixed(0)}
          />
        </RevealSection>
        <RevealSection delay={0.06}>
          <MetricCard
            name="Sleep"
            unit="hr"
            series={sleep}
            higherIsBetter
            format={(n) => n.toFixed(1)}
          />
        </RevealSection>
        <RevealSection delay={0.09}>
          <MetricCard
            name="Resting HR"
            unit="bpm"
            series={rhr}
            higherIsBetter={false}
            format={(n) => n.toFixed(0)}
          />
        </RevealSection>
      </div>
    </PageContainer>
  );
}

// Holds the timer id used by the "Saved" pill flash. Lives at module
// scope so updateField (a local arrow) can clear+set it without forcing
// a re-render via useRef.
const savedTimerRef: { current: number | undefined } = { current: undefined };

// --- Manual entry card ------------------------------------------------------

function ManualEntryCard({
  today,
  draft,
  dirty,
  canSave,
  hydrated,
  justSaved,
  onDraftChange,
  onSleepChange,
  onSave,
  onClear,
}: {
  today: ManualReadiness | null;
  draft: DraftReadiness;
  dirty: boolean;
  canSave: boolean;
  hydrated: boolean;
  justSaved: boolean;
  onDraftChange: <K extends keyof DraftReadiness>(
    key: K,
    value: DraftReadiness[K] | undefined,
  ) => void;
  onSleepChange: (
    hours: number | undefined,
    minutes: number | undefined,
  ) => void;
  onSave: () => void;
  onClear: () => void;
}) {
  // Prevent default form submission so the page never reloads — the
  // Save button is wired up below to call `onSave` directly, but
  // wrapping the inputs in <form> means pressing Enter inside any
  // input also triggers it for free.
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave();
  };

  // Split the canonical decimal sleep_hours into the two integer
  // fields the user actually types into.
  const sleepHoursPart = splitSleepHours(draft.sleep_hours);
  const sleepMinutesPart = splitSleepMinutes(draft.sleep_hours);

  return (
    <GlassCard interactive={false} className="p-6 sm:p-8">
      <form onSubmit={handleSubmit}>
        <header className="mb-6 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
              How are you feeling today?
            </h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Log readings manually until your wearable is connected. Tap
              Save when you&apos;re done — re-saving overrides the day&apos;s
              previous entry.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <AnimatePresence>
              {justSaved && (
                <motion.span
                  key="saved-pill"
                  initial={{ opacity: 0, scale: 0.85, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.92, y: -2 }}
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${tokens.success.soft}`}
                >
                  <motion.svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <motion.path
                      d="M5 12 L10 17 L19 7"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{
                        duration: 0.4,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    />
                  </motion.svg>
                  Saved
                </motion.span>
              )}
            </AnimatePresence>
            {hydrated && today && (
              <button
                type="button"
                onClick={onClear}
                className={`text-xs font-medium text-neutral-500 underline-offset-4 hover:text-neutral-800 hover:underline dark:text-neutral-400 dark:hover:text-neutral-200 ${tokens.motion}`}
              >
                Clear today
              </button>
            )}
          </div>
        </header>

        <div className="space-y-7">
          <SleepField
            hours={sleepHoursPart}
            minutes={sleepMinutesPart}
            onChange={onSleepChange}
          />
          <NumberField
            label="HRV"
            unit="ms"
            min={0}
            max={250}
            step={1}
            value={draft.hrv}
            placeholder="e.g. 65"
            onChange={(v) => onDraftChange("hrv", v)}
          />
          <NumberField
            label="Resting heart rate"
            unit="bpm"
            min={0}
            max={200}
            step={1}
            value={draft.resting_hr}
            placeholder="e.g. 52"
            onChange={(v) => onDraftChange("resting_hr", v)}
          />

          <LevelSliderField
            label="Fatigue"
            hint="How drained do your legs / body feel right now?"
            options={FATIGUE_OPTIONS}
            value={draft.fatigue_level}
            onChange={(v) => onDraftChange("fatigue_level", v)}
          />
          <LevelSliderField
            label="Soreness"
            hint="Any DOMS or specific tightness from recent sessions?"
            options={SORENESS_OPTIONS}
            value={draft.soreness_level}
            onChange={(v) => onDraftChange("soreness_level", v)}
          />
        </div>

        {/* Save row: explicit commit. Disabled until there's a change to
            persist, so the button quietly tells the user the form is
            already in sync with what's stored. */}
        <div className="mt-7 flex items-center justify-end gap-3">
          {dirty && (
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              Unsaved changes
            </span>
          )}
          <button
            type="submit"
            disabled={!canSave}
            className={[
              "inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-semibold",
              canSave
                ? "bg-blue-600 text-white hover:bg-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400"
                : "bg-neutral-200 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500",
              "transition-colors",
            ].join(" ")}
            aria-disabled={!canSave}
          >
            Save
          </button>
        </div>
      </form>
    </GlassCard>
  );
}

// --- Sleep input (hours + minutes) ------------------------------------------

/**
 * Split presentation for sleep: separate Hours and Minutes inputs that
 * compose back into the canonical decimal sleep_hours we persist. Two
 * adjacent inputs sit under a shared "Sleep" header so the visual
 * weight matches the other metrics.
 */
function SleepField({
  hours,
  minutes,
  onChange,
}: {
  hours: number | undefined;
  minutes: number | undefined;
  onChange: (
    hours: number | undefined,
    minutes: number | undefined,
  ) => void;
}) {
  const isSet = hours !== undefined || minutes !== undefined;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Sleep
        </span>
        {isSet && (
          <button
            type="button"
            onClick={() => onChange(undefined, undefined)}
            aria-label="Clear Sleep"
            className="text-xs font-medium text-neutral-400 underline-offset-4 hover:text-neutral-700 hover:underline dark:hover:text-neutral-200"
          >
            Clear
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SleepUnitInput
          label="Hours"
          unit="hr"
          min={0}
          max={24}
          value={hours}
          placeholder="7"
          onChange={(v) => onChange(v, minutes)}
        />
        <SleepUnitInput
          label="Minutes"
          unit="min"
          min={0}
          max={59}
          value={minutes}
          placeholder="30"
          onChange={(v) => onChange(hours, v)}
        />
      </div>
    </div>
  );
}

function SleepUnitInput({
  label,
  unit,
  min,
  max,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  unit: string;
  min: number;
  max: number;
  value: number | undefined;
  placeholder: string;
  onChange: (value: number | undefined) => void;
}) {
  // Mirror the canonical value into a string so the user can type
  // freely without React clobbering the input mid-edit.
  const [text, setText] = useState<string>(
    typeof value === "number" && Number.isFinite(value) ? String(value) : "",
  );
  useEffect(() => {
    const next =
      typeof value === "number" && Number.isFinite(value) ? String(value) : "";
    setText(next);
  }, [value]);

  const isSet = typeof value === "number" && Number.isFinite(value);

  const commit = (raw: string) => {
    setText(raw);
    if (raw.trim() === "") {
      onChange(undefined);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    if (n < min || n > max) return;
    onChange(Math.trunc(n));
  };

  const inputId = `manual-sleep-${label.toLowerCase()}`;

  return (
    <div>
      <label
        htmlFor={inputId}
        className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500"
      >
        {label}
      </label>
      <div
        className={[
          "flex items-center gap-1 rounded-xl border bg-white/60 px-2 py-2 transition-colors dark:bg-neutral-900/30",
          isSet
            ? "border-black/15 dark:border-white/15"
            : "border-black/10 dark:border-white/10",
          "focus-within:border-blue-500/70 focus-within:ring-2 focus-within:ring-blue-500/20",
        ].join(" ")}
      >
        <input
          id={inputId}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={text}
          placeholder={placeholder}
          onChange={(e) => commit(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-base font-medium tabular-nums text-neutral-900 placeholder:text-neutral-400 focus:outline-none dark:text-neutral-100 dark:placeholder:text-neutral-500"
        />
        <span className="hidden shrink-0 text-sm font-medium text-neutral-500 sm:inline dark:text-neutral-400">
          {unit}
        </span>
      </div>
    </div>
  );
}

// --- Number input field -----------------------------------------------------

function NumberField({
  label,
  unit,
  min,
  max,
  step,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number | undefined;
  placeholder: string;
  onChange: (value: number | undefined) => void;
}) {
  // Mirror the canonical value into a string so the user can type
  // freely (including transient "7." mid-input) without React fighting
  // back. We only commit a real number to storage on change once it
  // parses to a finite value within range.
  const [draft, setDraft] = useState<string>(
    typeof value === "number" && Number.isFinite(value) ? String(value) : "",
  );
  // Re-sync the draft when the canonical value is set externally
  // (e.g. "Clear today" wipes the entry from another control).
  useEffect(() => {
    const next =
      typeof value === "number" && Number.isFinite(value) ? String(value) : "";
    setDraft(next);
  }, [value]);

  const isSet = typeof value === "number" && Number.isFinite(value);

  const commit = (raw: string) => {
    setDraft(raw);
    if (raw.trim() === "") {
      onChange(undefined);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    if (n < min || n > max) return;
    onChange(n);
  };

  const inputId = `manual-${label.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <label
          htmlFor={inputId}
          className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400"
        >
          {label}
        </label>
        {isSet && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            aria-label={`Clear ${label}`}
            className="text-xs font-medium text-neutral-400 underline-offset-4 hover:text-neutral-700 hover:underline dark:hover:text-neutral-200"
          >
            Clear
          </button>
        )}
      </div>
      <div
        className={[
          "flex items-center gap-2 rounded-xl border bg-white/60 px-3 py-2 transition-colors dark:bg-neutral-900/30",
          isSet
            ? "border-black/15 dark:border-white/15"
            : "border-black/10 dark:border-white/10",
          "focus-within:border-blue-500/70 focus-within:ring-2 focus-within:ring-blue-500/20",
        ].join(" ")}
      >
        <input
          id={inputId}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => commit(e.target.value)}
          className="w-full bg-transparent text-base font-medium tabular-nums text-neutral-900 placeholder:text-neutral-400 focus:outline-none dark:text-neutral-100 dark:placeholder:text-neutral-500"
        />
        <span className="shrink-0 text-sm font-medium text-neutral-500 dark:text-neutral-400">
          {unit}
        </span>
      </div>
    </div>
  );
}

// --- 1–5 level slider ------------------------------------------------------

function LevelSliderField<T extends number>({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  options: Array<{ value: T; label: string }>;
  value: T | undefined;
  onChange: (value: T | undefined) => void;
}) {
  // Default to the middle of the scale when nothing's logged yet so
  // the thumb has a meaningful resting position. The readout still
  // says "Tap to set" until the user actually moves it.
  const isSet = typeof value === "number" && Number.isFinite(value);
  const min = options[0].value;
  const max = options[options.length - 1].value;
  const mid = options[Math.floor(options.length / 2)].value;
  const sliderValue = isSet ? value : mid;
  const activeLabel = isSet
    ? options.find((o) => o.value === value)?.label ?? ""
    : "Tap to set";

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            {label}
          </p>
          {hint && (
            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
              {hint}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-baseline gap-2">
          <span
            className={`text-sm font-medium ${
              isSet
                ? "text-neutral-900 dark:text-neutral-100"
                : "text-neutral-400 dark:text-neutral-500"
            }`}
          >
            {activeLabel}
          </span>
          {isSet && (
            <span className="rounded-full bg-blue-600/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
              {value}/5
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          role="slider"
          min={min}
          max={max}
          step={1}
          value={sliderValue}
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={isSet ? value : undefined}
          aria-valuetext={isSet ? `${value} of ${max} — ${activeLabel}` : undefined}
          onChange={(e) => onChange(Number(e.target.value) as T)}
          className="kinetic-range w-full cursor-pointer appearance-none accent-blue-600 outline-none"
        />
        {isSet && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            aria-label={`Clear ${label}`}
            className="text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
          >
            ×
          </button>
        )}
      </div>
      {/* Tick labels — give context for what each end of the scale means
          without making the user remember the numbering. */}
      <div className="mt-1.5 flex justify-between text-[10px] uppercase tracking-wider text-neutral-400">
        {options.map((o) => (
          <span
            key={o.value}
            className={
              isSet && o.value === value
                ? "font-semibold text-neutral-700 dark:text-neutral-200"
                : ""
            }
          >
            {o.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// --- Series helpers ---------------------------------------------------------

/**
 * Sparse 30-day metric series built from the readiness log. Each point
 * carries its position within the window (`x` is the day index, where
 * 0 = the oldest day and `totalDays - 1` = today) so the chart can
 * place the dot correctly even when the user has skipped most days.
 */
type SparseSeries = {
  totalDays: number;
  points: Array<{ x: number; value: number; date: string }>;
};

type MetricKey = "hrv" | "sleep_hours" | "resting_hr";

/**
 * Walk back `days` days from today, collecting every entry that has a
 * finite value for `metric`. Returns the points in chronological order
 * (oldest first) so the chart polyline reads left-to-right.
 */
function buildSparseSeries(
  log: ReadinessLog,
  metric: MetricKey,
  days: number,
): SparseSeries {
  const today = new Date();
  const points: Array<{ x: number; value: number; date: string }> = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    // i runs 0..days-1; we want the oldest day first so subtract
    // (days - 1 - i) days from today.
    d.setDate(d.getDate() - (days - 1 - i));
    const dateKey = isoDateKey(d);
    const entry = log.entries[dateKey];
    const v = entry?.[metric];
    if (typeof v === "number" && Number.isFinite(v)) {
      points.push({ x: i, value: v, date: dateKey });
    }
  }
  return { totalDays: days, points };
}

// --- Metric card ------------------------------------------------------------

function MetricCard({
  name,
  unit,
  series,
  higherIsBetter,
  format,
}: {
  name: string;
  unit: string;
  series: SparseSeries;
  higherIsBetter: boolean;
  format: (n: number) => string;
}) {
  const points = series.points;
  const hasData = points.length > 0;
  const latestPoint = points.at(-1);

  // Find a baseline point at least 7 days prior to the latest one for
  // the "vs 7d ago" delta. We pick the most recent qualifying point so
  // the comparison is as close to a true week-over-week as possible
  // given a sparse dataset.
  const baselinePoint = useMemo(() => {
    if (!latestPoint || points.length < 2) return null;
    const cutoff = latestPoint.x - 7;
    for (let i = points.length - 2; i >= 0; i--) {
      if (points[i].x <= cutoff) return points[i];
    }
    return null;
  }, [points, latestPoint]);

  let deltaNode: React.ReactNode = null;
  if (latestPoint && baselinePoint) {
    const delta = latestPoint.value - baselinePoint.value;
    const positive = higherIsBetter ? delta >= 0 : delta <= 0;
    const formattedAbs = format(Math.abs(delta));
    const isZero = parseFloat(formattedAbs) === 0;
    const deltaTone = isZero
      ? "text-neutral-500 dark:text-neutral-400"
      : positive
        ? tokens.success.text
        : tokens.warning.text;
    const sign = isZero ? "" : delta > 0 ? "+" : "−";
    const deltaLabel = isZero
      ? "Steady vs 7d ago"
      : `${sign}${formattedAbs} ${unit} vs 7d ago`;
    deltaNode = (
      <p className={`text-xs font-medium tabular-nums ${deltaTone}`}>
        {deltaLabel}
      </p>
    );
  } else if (latestPoint) {
    deltaNode = (
      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
        First reading
      </p>
    );
  }

  return (
    <GlassCard className="p-6">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
            {name}
          </p>
          <div className="mt-2 flex items-baseline gap-1.5 tabular-nums">
            <span className="text-3xl font-semibold tracking-tight">
              {latestPoint ? format(latestPoint.value) : "—"}
            </span>
            <span className="text-sm text-neutral-500">{unit}</span>
          </div>
        </div>
        {deltaNode}
      </div>

      <div className="mt-5">
        {hasData ? (
          <RecoveryLineChart
            series={series}
            name={name}
            format={format}
            unit={unit}
          />
        ) : (
          <EmptyChart name={name} />
        )}
      </div>
    </GlassCard>
  );
}

// --- Empty state ------------------------------------------------------------

function EmptyChart({ name }: { name: string }) {
  return (
    <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-neutral-200 dark:border-neutral-800">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Log a reading to start tracking your {name} trend.
      </p>
    </div>
  );
}

// --- Line chart -------------------------------------------------------------

function RecoveryLineChart({
  series,
  name,
  format,
  unit,
}: {
  series: SparseSeries;
  name: string;
  format: (n: number) => string;
  unit: string;
}) {
  const W = 600;
  const H = 120;
  const PAD_X = 4;
  const PAD_Y = 12;

  const { totalDays, points } = series;
  const values = points.map((p) => p.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  // Add a small visual margin so the line never touches the top/bottom.
  // Use a sensible default range when only one point is present.
  const range = Math.max(maxVal - minVal, Math.max(maxVal * 0.05, 1));
  const yMin = minVal - range * 0.1;
  const yMax = maxVal + range * 0.1;

  const xFor = (i: number) =>
    PAD_X + (i * (W - PAD_X * 2)) / Math.max(totalDays - 1, 1);
  const yFor = (v: number) =>
    PAD_Y + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD_Y * 2);

  const polyPoints = points
    .map((p) => `${xFor(p.x)},${yFor(p.value)}`)
    .join(" ");
  const last = points[points.length - 1];
  const lastX = xFor(last.x);
  const lastY = yFor(last.value);

  // Single midline gridline — minimal, just enough to anchor the eye.
  const midY = yFor((yMin + yMax) / 2);

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-24 w-full"
        role="img"
        aria-label={`${name} over the last ${totalDays} days`}
      >
        {/* Minimal gridline */}
        <line
          x1={PAD_X}
          x2={W - PAD_X}
          y1={midY}
          y2={midY}
          stroke="currentColor"
          strokeOpacity={0.12}
          strokeDasharray="2 4"
          className="text-neutral-500"
        />

        {/* Line through actual entries (only renders when ≥2 points) */}
        {points.length >= 2 && (
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            points={polyPoints}
            className="text-neutral-700 dark:text-neutral-200"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Dots for every recorded entry — emphasises that the chart
            shows real data points rather than a synthetic curve. */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={xFor(p.x)}
            cy={yFor(p.value)}
            r={2}
            fill="currentColor"
            className="text-neutral-500 dark:text-neutral-400"
          />
        ))}

        {/* Highlight the most recent point. */}
        <circle
          cx={lastX}
          cy={lastY}
          r={3}
          fill="currentColor"
          className="text-neutral-900 dark:text-neutral-100"
        />
      </svg>

      {/* Subtle axis labels */}
      <div className="mt-2 flex justify-between text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
        <span>{totalDays}d ago</span>
        <span className="tabular-nums normal-case tracking-normal text-neutral-400">
          {format(minVal)}
          {minVal !== maxVal ? `–${format(maxVal)}` : ""} {unit}
        </span>
        <span>Today</span>
      </div>
    </div>
  );
}

// --- Recovery score ---------------------------------------------------------

// The recovery score formula now lives in `lib/recoveryScore.ts` and is
// shared with the dashboard so both surfaces always render the same
// number for the same inputs. See that module for weights and
// thresholds (kept in lock-step with `backend/app/state_estimator.py`).
