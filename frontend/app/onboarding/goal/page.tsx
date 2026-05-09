"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { motion, type Variants } from "framer-motion";

import OnboardingProgress from "@/components/OnboardingProgress";
import { clearSavedPlan, getGoal, goalSignature, saveGoal } from "@/lib/storage";
import {
  emptyProfile,
  getUserProfile,
  saveUserProfile,
} from "@/lib/profileStorage";
import { tokens } from "@/lib/tokens";
import type {
  DayOfWeek,
  ExperienceLevel,
  Goal,
  RaceDistance,
  UserProfile,
} from "@/lib/types";

// --- Motion ----------------------------------------------------------------

const PREMIUM_EASE = [0.22, 1, 0.36, 1] as const;

// Page-exit fade duration. Matches the other onboarding steps so motion
// feels uniform across the flow.
const EXIT_MS = 320;

const containerVariants: Variants = {
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    y: 0,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
  // Whole page floats up + fades when continuing to the next step. The
  // next page's stagger-in catches the eye on the other side.
  exit: {
    opacity: 0,
    y: -10,
    transition: { duration: EXIT_MS / 1000, ease: PREMIUM_EASE },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: PREMIUM_EASE },
  },
};

// --- Constants -------------------------------------------------------------

const RACE_OPTIONS: Array<{ value: RaceDistance; label: string }> = [
  { value: "5k", label: "5K" },
  { value: "10k", label: "10K" },
  { value: "half", label: "Half" },
  { value: "marathon", label: "Marathon" },
];

const EXPERIENCE_OPTIONS: Array<{
  value: ExperienceLevel;
  label: string;
  description: string;
}> = [
  { value: "beginner", label: "Beginner", description: "0–1 yr running" },
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

const DAY_OPTIONS: Array<{ value: DayOfWeek; label: string }> = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

const DEFAULT_GOAL: Goal = {
  goal_type: "race",
  race_distance: "10k",
  target_date: "",
  experience_level: "intermediate",
  current_prs: {},
  weekly_mileage: undefined,
};

// --- Page ------------------------------------------------------------------

/**
 * Onboarding step 2 — collect the athlete's training goal + identity bits.
 *
 * Visually consistent with /onboarding (the welcome screen): same gradient
 * wash, same wordmark eyebrow, same big-headline rhythm. Inputs sit on a
 * single tall card so the page reads as one focused task rather than four.
 */
export default function OnboardingGoalPage() {
  const router = useRouter();
  const [goal, setGoal] = useState<Goal>(DEFAULT_GOAL);
  const [days, setDays] = useState<DayOfWeek[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  // Drives the page-exit fade. Once true, the parent motion.div animates
  // to the `exit` variant; we navigate after the fade finishes so the
  // next step slides in cleanly instead of cutting in.
  const [isExiting, setIsExiting] = useState(false);

  // If the athlete bounces back to this step (e.g. via the back button),
  // keep their previous answers around.
  useEffect(() => {
    const stored = getGoal();
    if (stored) {
      setGoal({
        ...DEFAULT_GOAL,
        ...stored,
        current_prs: { ...DEFAULT_GOAL.current_prs, ...stored.current_prs },
      });
    }
    const profile = getUserProfile();
    if (profile?.preferred_training_days?.length) {
      setDays(profile.preferred_training_days);
    }
  }, []);

  const errors = useMemo(() => {
    const e: { target_date?: string; weekly_mileage?: string } = {};
    if (!goal.target_date) {
      e.target_date = "Pick a target race date.";
    } else {
      const d = new Date(goal.target_date);
      if (Number.isNaN(d.getTime())) {
        e.target_date = "Enter a valid date.";
      }
    }
    if (goal.weekly_mileage !== undefined && goal.weekly_mileage < 0) {
      e.weekly_mileage = "Mileage must be zero or more.";
    }
    return e;
  }, [goal]);

  const toggleDay = (d: DayOfWeek) => {
    setDays((prev) =>
      prev.includes(d)
        ? prev.filter((x) => x !== d)
        : [...prev, d].sort(
            (a, b) =>
              DAY_OPTIONS.findIndex((o) => o.value === a) -
              DAY_OPTIONS.findIndex((o) => o.value === b)
          )
    );
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }
    if (submitting) return;
    setSubmitting(true);

    // Persist the goal. If a previous goal was saved with a different
    // signature, drop the cached plan so the dashboard regenerates it.
    const previous = getGoal();
    if (!previous || goalSignature(previous) !== goalSignature(goal)) {
      clearSavedPlan();
    }
    saveGoal(goal);

    // Roll the training-side fields into the user profile so they appear
    // on /profile without the user re-entering them. We preserve any
    // identity / PR / connection fields already on the profile (the
    // login screen seeds identity on first auth).
    const base = getUserProfile() ?? emptyProfile();
    const profile: UserProfile = {
      ...base,
      experience_level: goal.experience_level,
      weekly_mileage: goal.weekly_mileage,
      preferred_training_days: days,
    };
    saveUserProfile(profile);

    // Trigger the page-exit fade, then navigate. The slight gap before
    // EXIT_MS lets the next page begin mounting under us so the
    // hand-off feels seamless.
    setIsExiting(true);
    window.setTimeout(() => router.push("/onboarding/prs"), EXIT_MS - 40);
  };

  return (
    <main className="relative flex min-h-[calc(100vh-3rem)] items-center justify-center overflow-hidden py-16 sm:py-24">
      {/* Global animated wash lives in app/layout.tsx. */}

      <motion.div
        initial="hidden"
        animate={isExiting ? "exit" : "show"}
        variants={containerVariants}
        className="w-full max-w-2xl"
      >
        {/* Step indicator — hairline bar that grows from the previous */}
        {/* step's width to this step's width on mount. */}
        <motion.div variants={itemVariants}>
          <OnboardingProgress current={1} />
        </motion.div>

        {/* Header */}
        <motion.div variants={itemVariants} className="mt-10 text-center">
          <h1 className="text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-neutral-900 dark:text-neutral-100 sm:text-5xl">
            What are you training for?
          </h1>
          <p className="mt-4 text-base text-neutral-600 dark:text-neutral-400">
            Tell us your race and your routine. We&apos;ll build a plan that
            adapts as your week unfolds.
          </p>
        </motion.div>

        {/* Form card */}
        <motion.form
          variants={itemVariants}
          onSubmit={handleSubmit}
          className="mt-10 rounded-3xl border border-black/10 bg-white/80 p-6 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-neutral-900/70 sm:p-10"
        >
          {/* Race distance */}
          <Field label="Race distance">
            <SegmentedControl<RaceDistance>
              value={goal.race_distance}
              options={RACE_OPTIONS}
              onChange={(v) => setGoal((g) => ({ ...g, race_distance: v }))}
              cols="grid-cols-2 sm:grid-cols-4"
            />
          </Field>

          {/* Target date */}
          <Field
            label="Target date"
            htmlFor="target_date"
            hint="When is your race? We'll back-calculate the build."
            error={showErrors ? errors.target_date : undefined}
            className="mt-8"
          >
            <input
              id="target_date"
              type="date"
              required
              value={goal.target_date}
              onChange={(e) =>
                setGoal((g) => ({ ...g, target_date: e.target.value }))
              }
              className={inputClass}
            />
          </Field>

          {/* Experience */}
          <Field label="Experience level" className="mt-8">
            <SegmentedControl<ExperienceLevel>
              value={goal.experience_level}
              options={EXPERIENCE_OPTIONS}
              onChange={(v) =>
                setGoal((g) => ({ ...g, experience_level: v }))
              }
              cols="grid-cols-1 sm:grid-cols-3"
            />
          </Field>

          {/* Weekly mileage */}
          <Field
            label="Current weekly mileage"
            htmlFor="weekly_mileage"
            hint="Leave blank if you're unsure — we'll estimate from experience."
            error={showErrors ? errors.weekly_mileage : undefined}
            className="mt-8"
          >
            <div className="relative">
              <input
                id="weekly_mileage"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                placeholder="e.g. 25"
                value={goal.weekly_mileage ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  setGoal((g) => ({
                    ...g,
                    weekly_mileage: raw === "" ? undefined : Number(raw),
                  }));
                }}
                className={`${inputClass} pr-12`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-neutral-400">
                mi
              </span>
            </div>
          </Field>

          {/* Preferred training days */}
          <Field
            label="Preferred training days"
            hint="Tap the days that work best — we'll prioritize them."
            className="mt-8"
          >
            <div className="flex flex-wrap gap-1.5">
              {DAY_OPTIONS.map((d) => {
                const active = days.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDay(d.value)}
                    aria-pressed={active}
                    className={[
                      "inline-flex h-10 min-w-12 items-center justify-center rounded-full border px-4 text-sm font-medium",
                      tokens.motion,
                      active
                        ? tokens.primary.softActive
                        : "border-black/10 bg-white text-neutral-600 hover:border-black/20 hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-950/40 dark:text-neutral-300 dark:hover:bg-neutral-900",
                    ].join(" ")}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </Field>

          {/* Submit */}
          <div className="mt-10 flex flex-col-reverse items-center justify-end gap-3 sm:flex-row">
            <Link
              href="/onboarding"
              className={`text-sm text-neutral-500 underline-offset-4 hover:text-neutral-800 hover:underline dark:text-neutral-400 dark:hover:text-neutral-200 ${tokens.motion}`}
            >
              Back
            </Link>
            {/* motion.button — the same hover lift used across onboarding. */}
            {/* It overrides the CSS `hover:scale-[1.02]` from tokens.primary.solid */}
            {/* with a subtler upward translate that reads as "premium" instead of */}
            {/* "bouncy". */}
            <motion.button
              type="submit"
              disabled={submitting || isExiting}
              whileHover={{ y: -1 }}
              whileTap={{ y: 0, scale: 0.97 }}
              transition={{ duration: 0.18, ease: PREMIUM_EASE }}
              className={`inline-flex items-center justify-center rounded-full px-7 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${tokens.primary.solid}`}
            >
              {submitting ? "Building your plan…" : "Continue"}
            </motion.button>
          </div>
        </motion.form>
      </motion.div>
    </main>
  );
}

// --- Subcomponents ---------------------------------------------------------

function Field({
  label,
  htmlFor,
  hint,
  error,
  className = "",
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p className={`mt-1.5 text-xs ${tokens.warning.text}`}>{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-neutral-500">{hint}</p>
      ) : null}
    </div>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  cols,
}: {
  value: T;
  options: Array<{ value: T; label: string; description?: string }>;
  onChange: (v: T) => void;
  cols: string;
}) {
  return (
    <div className={`grid gap-2 ${cols}`}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={[
              "rounded-xl border px-4 py-3 text-left text-sm",
              tokens.motion,
              active
                ? tokens.primary.softActive
                : "border-black/10 bg-white text-neutral-700 hover:border-black/20 hover:bg-neutral-50 hover:shadow-sm dark:border-white/10 dark:bg-neutral-950/40 dark:text-neutral-300 dark:hover:bg-neutral-900",
            ].join(" ")}
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

// Shared input style — matches /settings and /profile/edit so the visual
// language is consistent across every form in the app.
const inputClass =
  "w-full rounded-lg border border-black/10 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 hover:border-black/20 focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-neutral-950/60 dark:text-neutral-100 dark:hover:border-white/20 dark:focus:border-blue-400/60 dark:focus:ring-blue-400/20";
