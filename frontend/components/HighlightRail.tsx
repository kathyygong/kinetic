"use client";

import { motion, useReducedMotion } from "framer-motion";

type HighlightTone = "blue" | "emerald" | "amber" | "neutral";

export type HighlightRailItem = {
  label: string;
  value: string;
  detail: string;
  tone?: HighlightTone;
};

type HighlightRailProps = {
  eyebrow?: string;
  title?: string;
  items: HighlightRailItem[];
  className?: string;
};

const TONE_CLASS: Record<HighlightTone, string> = {
  blue:
    "border-blue-200/70 bg-blue-50/78 text-blue-950 dark:border-blue-800/40 dark:bg-blue-950/28 dark:text-blue-100",
  emerald:
    "border-emerald-200/70 bg-emerald-50/78 text-emerald-950 dark:border-emerald-800/40 dark:bg-emerald-950/28 dark:text-emerald-100",
  amber:
    "border-amber-200/70 bg-amber-50/82 text-amber-950 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-100",
  neutral:
    "border-white/70 bg-white/72 text-neutral-950 dark:border-white/10 dark:bg-white/[0.06] dark:text-neutral-100",
};

/**
 * Apple-style highlight strip: compact product beats that reveal into
 * view and stay horizontally scannable on mobile.
 */
export default function HighlightRail({
  eyebrow = "Highlights",
  title,
  items,
  className = "",
}: HighlightRailProps) {
  const reduceMotion = useReducedMotion();

  return (
    <section className={`relative ${className}`}>
      <header className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full bg-gradient-to-br from-sky-300 to-blue-500"
            />
            {eyebrow}
          </p>
          {title ? (
            <h2 className="mt-1 text-2xl font-semibold text-neutral-950 dark:text-neutral-50">
              {title}
            </h2>
          ) : null}
        </div>
      </header>

      <ul className="-mx-2 flex snap-x gap-3 overflow-x-auto px-2 pb-2 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 sm:pb-0">
        {items.map((item, index) => (
          <motion.li
            key={`${item.label}-${item.value}`}
            initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.985 }}
            whileInView={
              reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }
            }
            viewport={{ once: true, margin: "0px 0px -10% 0px" }}
            transition={{
              duration: 0.58,
              ease: [0.22, 1, 0.36, 1],
              delay: Math.min(index * 0.05, 0.18),
            }}
            className={`min-h-[8.25rem] min-w-[12.5rem] snap-start rounded-[1.45rem] border p-4 shadow-[0_22px_52px_-34px_rgb(30_58_138/0.44)] backdrop-blur-xl sm:min-w-0 ${
              TONE_CLASS[item.tone ?? "neutral"]
            }`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] opacity-60">
              {item.label}
            </p>
            <p className="mt-3 text-2xl font-semibold leading-none">
              {item.value}
            </p>
            <p className="mt-3 text-sm leading-snug opacity-68">
              {item.detail}
            </p>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
