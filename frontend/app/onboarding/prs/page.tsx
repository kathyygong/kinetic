"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";

import HMSInput from "@/components/HMSInput";
import OnboardingProgress from "@/components/OnboardingProgress";
import { projectRaceTime } from "@/lib/paceCalculator";
import {
  emptyProfile,
  getUserProfile,
  saveUserProfile,
} from "@/lib/profileStorage";
import { clearSavedPlan, getGoal, goalSignature, saveGoal } from "@/lib/storage";
import { tokens } from "@/lib/tokens";
import type { CurrentPRs, Goal, RaceDistance, UserProfile } from "@/lib/types";

// --- Motion ----------------------------------------------------------------

const PREMIUM_EASE = [0.22, 1, 0.36, 1] as const;

// Page-exit fade duration. Same value across every onboarding step.
const EXIT_MS = 320;

const containerVariants: Variants = {
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    y: 0,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
  // Whole page floats up + fades when the user advances. Pairs with the
  // next step's stagger-in for a continuous, calm hand-off.
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

const PR_FIELDS: Array<{ key: keyof CurrentPRs; label: string }> = [
  { key: "5k", label: "5K" },
  { key: "10k", label: "10K" },
  { key: "half", label: "Half marathon" },
  { key: "marathon", label: "Marathon" },
];

// Mid-pack placeholders so the inputs hint at what's expected without
// pre-filling values. (25:00 / 52:00 / 1:55:00 / 4:00:00.)
const PR_PLACEHOLDERS_SEC: Record<keyof CurrentPRs, number> = {
  "5k": 25 * 60,
  "10k": 52 * 60,
  half: 1 * 3600 + 55 * 60,
  marathon: 4 * 3600,
};

const RACE_LABEL: Record<RaceDistance, string> = {
  "5k": "5K",
  "10k": "10K",
  half: "half marathon",
  marathon: "marathon",
};

// --- Page ------------------------------------------------------------------

/**
 * Onboarding step 2 — collect personal records and show the user a
 * motivating projected race time as they type.
 *
 * All four PRs are optional. If the athlete has none, they can skip and
 * we'll fall back to defaults. As soon as one PR exists we surface the
 * projected target-race time using `projectRaceTime` from the pace
 * calculator, which already uses Riegel + experience-driven improvement.
 */
export default function OnboardingPRsPage() {
  const router = useRouter();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [prs, setPRs] = useState<Partial<CurrentPRs>>({});
  const [submitting, setSubmitting] = useState(false);
  // Drives the page-exit fade. Set to true on continue; navigation
  // happens just before the fade ends so the next step takes over
  // without a visible cut.
  const [isExiting, setIsExiting] = useState(false);

  // Load the goal saved during step 1. If there isn't one, send the user
  // back so we have a target distance to project against.
  useEffect(() => {
    const stored = getGoal();
    if (!stored) {
      router.replace("/onboarding/goal");
      return;
    }
    setGoal(stored);
    setPRs(stored.current_prs ?? {});
  }, [router]);

  const hasAnyPR = useMemo(
    () => PR_FIELDS.some(({ key }) => typeof prs[key] === "number"),
    [prs]
  );

  // Live projected race time for the user's chosen race, in seconds.
  // Only meaningful once they've entered at least one PR; otherwise the
  // calculator falls back to a 25:00 5K which would be misleading.
  const projectedSec = useMemo(() => {
    if (!goal || !hasAnyPR) return null;
    return projectRaceTime(goal.race_distance, prs, goal.experience_level);
  }, [goal, prs, hasAnyPR]);

  const updatePR = (key: keyof CurrentPRs, sec: number | undefined) => {
    setPRs((prev) => {
      const next = { ...prev };
      if (typeof sec === "number" && sec > 0) {
        next[key] = sec;
      } else {
        delete next[key];
      }
      return next;
    });
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!goal || submitting) return;
    setSubmitting(true);

    // Persist PRs onto the goal (drives pace calculation) and onto the
    // profile (canonical record). If the goal signature changes, drop
    // the cached plan so the dashboard rebuilds.
    const nextGoal: Goal = { ...goal, current_prs: prs };
    const previous = getGoal();
    if (!previous || goalSignature(previous) !== goalSignature(nextGoal)) {
      clearSavedPlan();
    }
    saveGoal(nextGoal);

    // Mirror the PRs onto the profile so /profile and /profile/edit
    // stay in sync with what the user entered here. Identity, training
    // days, and connection state are preserved untouched.
    const base = getUserProfile() ?? emptyProfile();
    const profile: UserProfile = {
      ...base,
      experience_level: base.experience_level || nextGoal.experience_level,
      weekly_mileage:
        base.weekly_mileage !== undefined
          ? base.weekly_mileage
          : nextGoal.weekly_mileage,
      personal_bests: prs,
    };
    saveUserProfile(profile);

    // Page-exit fade, then route. The 40ms head-start lets the next
    // page begin mounting under us so the hand-off feels seamless.
    setIsExiting(true);
    window.setTimeout(
      () => router.push("/onboarding/integrations"),
      EXIT_MS - 40
    );
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
        {/* Step indicator. */}
        <motion.div variants={itemVariants}>
          <OnboardingProgress current={2} />
        </motion.div>

        {/* Header */}
        <motion.div variants={itemVariants} className="mt-10 text-center">
          <h1 className="text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-neutral-900 dark:text-neutral-100 sm:text-5xl">
            How fast are you now?
          </h1>
          <p className="mt-4 text-base text-neutral-600 dark:text-neutral-400">
            Drop in any race times you have. We&apos;ll calibrate your paces
            and project where you can be on race day.
          </p>
        </motion.div>

        {/* Form card */}
        <motion.form
          variants={itemVariants}
          onSubmit={handleSubmit}
          className="mt-10 rounded-3xl border border-black/10 bg-white/80 p-6 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-neutral-900/70 sm:p-10"
        >
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {PR_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label
                  htmlFor={`pr_${key}_m`}
                  className="mb-2 block text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400"
                >
                  {label}
                </label>
                <HMSInput
                  id={`pr_${key}`}
                  valueSec={prs[key]}
                  placeholderSec={PR_PLACEHOLDERS_SEC[key]}
                  onChange={(sec) => updatePR(key, sec)}
                />
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
            Hours : minutes : seconds. Leave any blank that you haven&apos;t
            raced — even one PR is enough to calibrate.
          </p>

          {/* Projection — animates in only once we have something to project. */}
          <AnimatePresence initial={false}>
            {goal && projectedSec !== null && (
              <motion.div
                key="projection"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.35, ease: PREMIUM_EASE }}
                className="mt-8 overflow-hidden rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 via-sky-400/5 to-transparent p-5 dark:border-blue-400/20"
              >
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-blue-700/80 dark:text-blue-200/80">
                  Projected {RACE_LABEL[goal.race_distance]}
                </p>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-neutral-100">
                    {formatHMS(projectedSec)}
                  </span>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    on race day
                  </span>
                </div>
                <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
                  Based on your fastest current effort and a typical{" "}
                  {goal.experience_level} training block.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit */}
          <div className="mt-10 flex flex-col-reverse items-center justify-end gap-3 sm:flex-row">
            <Link
              href="/onboarding/goal"
              className={`text-sm text-neutral-500 underline-offset-4 hover:text-neutral-800 hover:underline dark:text-neutral-400 dark:hover:text-neutral-200 ${tokens.motion}`}
            >
              Back
            </Link>
            <motion.button
              type="submit"
              disabled={!goal || submitting || isExiting}
              whileHover={{ y: -1 }}
              whileTap={{ y: 0, scale: 0.97 }}
              transition={{ duration: 0.18, ease: PREMIUM_EASE }}
              className={`inline-flex items-center justify-center rounded-full px-7 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${tokens.primary.solid}`}
            >
              {submitting
                ? "Building your plan…"
                : hasAnyPR
                  ? "Continue"
                  : "Skip for now"}
            </motion.button>
          </div>
        </motion.form>
      </motion.div>
    </main>
  );
}

// --- Helpers ---------------------------------------------------------------

/** Format integer seconds as "M:SS" or "H:MM:SS". */
function formatHMS(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}
