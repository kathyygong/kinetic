"use client";

import { useEffect, useMemo, useState } from "react";

import { applyPreferredDays, generateTrainingPlan } from "@/lib/planGenerator";
import { getUserProfile } from "@/lib/profileStorage";
import { clearSavedPlan, getGoal, goalSignature, saveGoal } from "@/lib/storage";
import type {
  CurrentPRs,
  ExperienceLevel,
  Goal,
  RaceDistance,
} from "@/lib/types";
import GlassCard from "@/components/GlassCard";
import HMSInput from "@/components/HMSInput";
import PageContainer from "@/components/PageContainer";
import { tokens } from "@/lib/tokens";

const DEFAULT_GOAL: Goal = {
  goal_type: "race",
  race_distance: "5k",
  target_date: "",
  experience_level: "intermediate",
  current_prs: {},
  weekly_mileage: undefined,
};

// Example PR times shown as placeholders, in seconds. Roughly mid-pack:
// 25:00 5K, 52:00 10K, 1:55:00 half, 4:00:00 marathon.
const PR_PLACEHOLDERS_SEC: Record<keyof CurrentPRs, number> = {
  "5k": 25 * 60,
  "10k": 52 * 60,
  half: 1 * 3600 + 55 * 60,
  marathon: 4 * 3600,
};

const RACE_OPTIONS: Array<{ value: RaceDistance; label: string }> = [
  { value: "5k", label: "5K" },
  { value: "10k", label: "10K" },
  { value: "half", label: "Half marathon" },
  { value: "marathon", label: "Marathon" },
];

const EXPERIENCE_OPTIONS: Array<{
  value: ExperienceLevel;
  label: string;
  description: string;
}> = [
  {
    value: "beginner",
    label: "Beginner",
    description: "0–1 yr running",
  },
  {
    value: "intermediate",
    label: "Intermediate",
    description: "1–4 yrs, regular training",
  },
  {
    value: "advanced",
    label: "Advanced",
    description: "Competitive, structured plans",
  },
];

const PR_FIELDS: Array<{ key: keyof CurrentPRs; label: string }> = [
  { key: "5k", label: "5K" },
  { key: "10k", label: "10K" },
  { key: "half", label: "Half" },
  { key: "marathon", label: "Marathon" },
];

export default function SettingsPage() {
  const [goal, setGoal] = useState<Goal>(DEFAULT_GOAL);
  const [saved, setSaved] = useState(false);

  // Load any previously saved goal.
  useEffect(() => {
    const stored = getGoal();
    if (stored) {
      setGoal({
        ...DEFAULT_GOAL,
        ...stored,
        current_prs: { ...DEFAULT_GOAL.current_prs, ...stored.current_prs },
      });
    }
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    // If the new goal differs from what was previously saved, the cached
    // calendar-aware plan is stale — drop it so the dashboard regenerates
    // a fresh plan on next visit.
    const previous = getGoal();
    if (!previous || goalSignature(previous) !== goalSignature(goal)) {
      clearSavedPlan();
    }
    saveGoal(goal);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const updatePR = (key: keyof CurrentPRs, seconds: number | undefined) => {
    setGoal((g) => {
      const next = { ...g.current_prs };
      if (typeof seconds === "number" && seconds > 0) {
        next[key] = seconds;
      } else {
        delete next[key];
      }
      return { ...g, current_prs: next };
    });
  };

  // Live plan preview — only meaningful once the user has picked a date.
  const preview = useMemo(() => {
    if (!goal.target_date) return null;
    try {
      const plan = applyPreferredDays(
        generateTrainingPlan(goal),
        getUserProfile()?.preferred_training_days,
      );
      if (plan.length === 0) return null;
      const peakWeeklyMiles = plan.reduce((max, w) => {
        const mi = w.workouts.reduce((s, x) => s + x.distance, 0);
        return mi > max ? mi : max;
      }, 0);
      const longestRun = plan.reduce((max, w) => {
        const mi = w.workouts.reduce(
          (m, x) => (x.type === "long run" && x.distance > m ? x.distance : m),
          0
        );
        return mi > max ? mi : max;
      }, 0);
      return {
        weeks: plan.length,
        peakWeeklyMiles: Math.round(peakWeeklyMiles),
        longestRun: Math.round(longestRun * 10) / 10,
      };
    } catch {
      return null;
    }
  }, [goal]);

  // Sanity warnings. Empty array means the form looks fine.
  const warnings = useMemo(() => {
    const out: string[] = [];
    if (goal.target_date) {
      const target = new Date(goal.target_date);
      if (!Number.isNaN(target.getTime())) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const ms = target.getTime() - today.getTime();
        const days = Math.floor(ms / (1000 * 60 * 60 * 24));
        if (days < 0) {
          out.push("Target date is in the past. Pick a future date.");
        } else if (days < 28) {
          out.push(
            `Target date is only ${days} day${days === 1 ? "" : "s"} away. Plans need at least 4 weeks; we'll generate a 4-week plan.`
          );
        }
      }
    }
    if (
      typeof goal.weekly_mileage === "number" &&
      goal.weekly_mileage > 0 &&
      goal.weekly_mileage < 5
    ) {
      out.push(
        "Weekly mileage under 5 mi will produce a very light plan. Consider 10–20 to start."
      );
    }
    return out;
  }, [goal]);

  return (
    <PageContainer className="mx-auto w-full max-w-3xl px-2 py-12 sm:py-16">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Kinetic</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Configure your training goal and athlete profile. Changes regenerate
          your plan.
        </p>
      </header>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1 — Race goal */}
        <SectionCard
          title="Race goal"
          description="The race you're training toward."
        >
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Race distance" htmlFor="race_distance">
              <div className="relative">
                <select
                  id="race_distance"
                  value={goal.race_distance}
                  onChange={(e) =>
                    setGoal((g) => ({
                      ...g,
                      race_distance: e.target.value as RaceDistance,
                    }))
                  }
                  className={selectClass}
                >
                  {RACE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDownIcon />
              </div>
            </Field>

            <Field label="Target date" htmlFor="target_date">
              <input
                id="target_date"
                type="date"
                value={goal.target_date}
                onChange={(e) =>
                  setGoal((g) => ({ ...g, target_date: e.target.value }))
                }
                className={inputClass}
              />
            </Field>
          </div>
        </SectionCard>

        {/* Section 2 — Athlete profile */}
        <SectionCard
          title="Athlete profile"
          description="Helps us calibrate intensity and weekly volume."
        >
          <div className="space-y-6">
            <Field label="Experience level" htmlFor="experience_level">
              <SegmentedControl
                value={goal.experience_level}
                options={EXPERIENCE_OPTIONS}
                onChange={(v) =>
                  setGoal((g) => ({ ...g, experience_level: v }))
                }
              />
            </Field>

            <Field
              label="Weekly mileage"
              htmlFor="weekly_mileage"
              hint="Optional — we'll estimate from experience level if blank."
            >
              <div className="relative max-w-[180px]">
                <input
                  id="weekly_mileage"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="1"
                  placeholder="—"
                  value={goal.weekly_mileage ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setGoal((g) => ({
                      ...g,
                      weekly_mileage: v === "" ? undefined : Number(v),
                    }));
                  }}
                  className={`${inputClass} pr-10`}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-neutral-400">
                  mi
                </span>
              </div>
            </Field>
          </div>
        </SectionCard>

        {/* Section 3 — Personal records */}
        <SectionCard
          title="Personal records"
          description="Your best times — used to set training paces and project race times."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {PR_FIELDS.map(({ key, label }) => (
              <Field key={key} label={label} htmlFor={`pr_${key}_m`}>
                <HMSInput
                  id={`pr_${key}`}
                  valueSec={goal.current_prs[key]}
                  placeholderSec={PR_PLACEHOLDERS_SEC[key]}
                  onChange={(sec) => updatePR(key, sec)}
                />
              </Field>
            ))}
          </div>
          <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
            Hours : minutes : seconds. Leave blank if you haven&apos;t raced the
            distance — we&apos;ll project paces from your fastest entered PR.
          </p>
        </SectionCard>

        {/* Action bar */}
        <div className="sticky bottom-4 z-10">
          <GlassCard
            interactive={false}
            className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-1 flex-wrap items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
              {preview ? (
                <span className="tabular-nums">
                  ~{preview.weeks}-week plan · peak{" "}
                  <span className="font-medium text-neutral-700 dark:text-neutral-200">
                    {preview.peakWeeklyMiles} mi/wk
                  </span>{" "}
                  · longest run{" "}
                  <span className="font-medium text-neutral-700 dark:text-neutral-200">
                    {preview.longestRun} mi
                  </span>
                </span>
              ) : (
                <span>Pick a target date to preview your plan.</span>
              )}
            </div>
            <div className="flex items-center justify-end gap-3">
              {saved && (
                <span className={`text-sm font-medium ${tokens.success.text}`}>
                  Saved
                </span>
              )}
              <button
                type="submit"
                className={`rounded-full px-5 py-2.5 text-sm font-semibold ${tokens.primary.solid}`}
              >
                Save goal
              </button>
            </div>
          </GlassCard>
        </div>

        {warnings.length > 0 && (
          <ul className={`space-y-1.5 rounded-xl border px-4 py-3 text-xs leading-relaxed ${tokens.warning.soft}`}>
            {warnings.map((w, i) => (
              <li key={i} className="flex gap-2">
                <span className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${tokens.warning.dot}`} />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        )}
      </form>
    </PageContainer>
  );
}

// --- Section ----------------------------------------------------------------

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <GlassCard interactive={false} className="p-6 sm:p-8">
      <header className="mb-6">
        <h2 className="text-base font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          {title}
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {description}
        </p>
      </header>
      {children}
    </GlassCard>
  );
}

// --- Field ------------------------------------------------------------------

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400"
      >
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}

// --- Segmented control ------------------------------------------------------

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string; description?: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={[
              "rounded-lg border px-4 py-3 text-left text-sm",
              tokens.motion,
              active
                ? tokens.primary.softActive
                : "border-black/10 bg-white/60 text-neutral-700 hover:border-black/20 hover:bg-white hover:shadow-sm dark:border-white/10 dark:bg-neutral-900/40 dark:text-neutral-300 dark:hover:border-white/20 dark:hover:bg-neutral-900/60",
            ].join(" ")}
            aria-pressed={active}
          >
            <span className="block font-medium">{opt.label}</span>
            {opt.description && (
              <span
                className={`mt-0.5 block text-[11px] ${
                  active
                    ? "text-blue-700/80 dark:text-blue-200/80"
                    : "text-neutral-500"
                }`}
              >
                {opt.description}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// --- Input styling ----------------------------------------------------------

const inputClass =
  "w-full rounded-lg border border-black/10 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 hover:border-black/20 focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-neutral-950/60 dark:text-neutral-100 dark:hover:border-white/20 dark:focus:border-blue-400/60 dark:focus:ring-blue-400/20";

// Tinted background + reserved space on the right for the chevron icon, so
// the field reads as a dropdown rather than a plain text box.
const selectClass =
  `${inputClass} cursor-pointer appearance-none pr-10 bg-neutral-50 hover:bg-neutral-100 dark:bg-neutral-900/60 dark:hover:bg-neutral-900`;

function ChevronDownIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width="18"
      height="18"
      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 dark:text-neutral-400"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
