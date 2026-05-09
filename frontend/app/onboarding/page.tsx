"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion, type Variants } from "framer-motion";

import { tokens } from "@/lib/tokens";
import KineticLogo from "@/components/KineticLogo";
import StrideWave from "@/components/StrideWave";

// Smooth out-quart easing — the Apple-style deceleration used elsewhere
// in the app so onboarding feels of a piece with the rest of Kinetic.
const PREMIUM_EASE = [0.22, 1, 0.36, 1] as const;

// How long the page-exit fade runs before we swap routes. Kept short so
// the flow still feels snappy; long enough that the eye can register the
// transition rather than a hard cut.
const EXIT_MS = 320;

const containerVariants: Variants = {
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    y: 0,
    transition: { staggerChildren: 0.12, delayChildren: 0.15 },
  },
  // Whole page floats up and fades when the user moves to the next step.
  // Pairs with the next page's stagger-in for a continuous feel.
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
    transition: { duration: 0.55, ease: PREMIUM_EASE },
  },
};

/**
 * Onboarding welcome screen — the first thing a brand-new user sees.
 *
 * Layout intentionally minimal: wordmark, headline, single CTA. No nav,
 * no chrome, no "below the fold" content. Just the brand promise and an
 * invitation to start.
 *
 * Background uses two soft blue gradient blobs that bleed off the edges
 * of the viewport, echoing the gradient accents on /profile so the
 * design language carries through.
 */
export default function OnboardingWelcomePage() {
  const router = useRouter();
  const [isExiting, setIsExiting] = useState(false);

  // Tap on "Get started" plays the page-exit fade, then routes. The
  // delay matches the exit transition so the new page slides in cleanly
  // instead of cutting in mid-fade.
  const handleGetStarted = () => {
    if (isExiting) return;
    setIsExiting(true);
    window.setTimeout(() => router.push("/login?mode=signup"), EXIT_MS - 40);
  };

  return (
    <main className="relative flex min-h-[calc(100vh-3rem)] items-center justify-center overflow-hidden py-16 sm:py-24">
      {/* Animated gradient + topographic wash is mounted globally in
          app/layout.tsx so every page (including onboarding) shares the
          same drifting backdrop. */}

      <motion.div
        initial="hidden"
        animate={isExiting ? "exit" : "show"}
        variants={containerVariants}
        className="w-full max-w-3xl text-center"
      >
        {/* Wordmark */}
        <motion.div
          variants={itemVariants}
          className="flex items-center justify-center gap-2.5"
        >
          <KineticLogo size={28} />
          <p className="text-sm font-medium uppercase tracking-[0.32em] text-neutral-500 dark:text-neutral-400">
            Kinetic
          </p>
        </motion.div>

        {/* Headline — the hero promise */}
        <motion.h1
          variants={itemVariants}
          className="mt-8 text-balance text-5xl font-semibold leading-[1.05] tracking-tight text-neutral-900 dark:text-neutral-100 sm:text-6xl lg:text-7xl"
        >
          Adaptive AI training
          <br className="hidden sm:block" />
          that fits your real life.
        </motion.h1>

        {/* Decorative stride waveform — visualizes the brand promise */}
        {/* of a "rhythm" that adapts to the runner. */}
        <motion.div
          variants={itemVariants}
          className="mx-auto mt-10 flex justify-center"
          aria-hidden="true"
        >
          <StrideWave width={360} height={48} tone="blue" loop />
        </motion.div>

        {/* Primary CTA + quiet sign-in affordance */}
        <motion.div
          variants={itemVariants}
          className="mt-14 flex flex-col items-center gap-5"
        >
          {/* motion.button instead of <Link> so we can drive the */}
          {/* page-exit fade before navigation, plus a subtle */}
          {/* whileHover lift that's calmer than the CSS scale. */}
          <motion.button
            type="button"
            onClick={handleGetStarted}
            whileHover={{ y: -1 }}
            whileTap={{ y: 0, scale: 0.97 }}
            transition={{ duration: 0.18, ease: PREMIUM_EASE }}
            className={`inline-flex items-center justify-center rounded-full px-8 py-3.5 text-base font-semibold ${tokens.primary.solid}`}
          >
            Get started
          </motion.button>
          <Link
            href="/login?mode=signin"
            className={`text-sm text-neutral-500 underline-offset-4 hover:text-neutral-800 hover:underline dark:text-neutral-400 dark:hover:text-neutral-200 ${tokens.motion}`}
          >
            Already have an account? Sign in
          </Link>
        </motion.div>
      </motion.div>
    </main>
  );
}
