"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

type FloatingMetricTone = "blue" | "emerald" | "amber" | "rose" | "neutral";

type FloatingMetricProps = {
  label: string;
  value: ReactNode;
  unit?: string;
  detail?: string;
  tone?: FloatingMetricTone;
  className?: string;
  /**
   * Typography overrides for the value. Numeric metrics keep the default
   * (large, tabular, single-line truncated); short word values like
   * "Proceed" pass a smaller size so they fit the capsule instead of
   * truncating to "Proc…" on narrow mobile widths.
   */
  valueClassName?: string;
};

const TONE_CLASS: Record<FloatingMetricTone, string> = {
  blue:
    "border-blue-200/70 bg-blue-50/72 text-blue-950 dark:border-blue-800/40 dark:bg-blue-950/28 dark:text-blue-100",
  emerald:
    "border-emerald-200/70 bg-emerald-50/72 text-emerald-950 dark:border-emerald-800/40 dark:bg-emerald-950/28 dark:text-emerald-100",
  amber:
    "border-amber-200/70 bg-amber-50/78 text-amber-950 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-100",
  rose:
    "border-rose-200/70 bg-rose-50/72 text-rose-950 dark:border-rose-800/40 dark:bg-rose-950/28 dark:text-rose-100",
  neutral:
    "border-neutral-200/70 bg-white/68 text-neutral-950 dark:border-white/10 dark:bg-white/[0.055] dark:text-neutral-100",
};

export default function FloatingMetric({
  label,
  value,
  unit,
  detail,
  tone = "neutral",
  className = "",
  valueClassName,
}: FloatingMetricProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      whileHover={reduceMotion ? undefined : { y: -2 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className={`min-h-[5.75rem] rounded-2xl border px-4 py-3 shadow-[0_12px_26px_-22px_rgb(15_23_42/0.55)] backdrop-blur-md ${TONE_CLASS[tone]} ${className}`}
    >
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.2em] opacity-60">
        {label}
      </p>
      <div className="mt-2 flex min-w-0 items-baseline gap-1.5">
        <span
          className={`min-w-0 font-semibold tracking-tight ${
            valueClassName ?? "truncate text-2xl leading-none tabular-nums"
          }`}
        >
          {value}
        </span>
        {unit ? (
          <span className="shrink-0 text-xs font-medium uppercase tracking-[0.14em] opacity-55">
            {unit}
          </span>
        ) : null}
      </div>
      {detail ? (
        <p className="mt-2 line-clamp-2 text-xs leading-snug opacity-65">
          {detail}
        </p>
      ) : null}
    </motion.div>
  );
}
