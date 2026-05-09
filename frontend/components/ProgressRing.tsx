"use client";

import { motion } from "framer-motion";

type ProgressRingProps = {
  /** Progress value clamped to [0, 1]. */
  value: number;
  /** Outer diameter in pixels. Defaults to 96. */
  size?: number;
  /** Stroke width in pixels. Defaults to 8. */
  stroke?: number;
  /**
   * Color theme for the active arc. Maps to a CSS gradient ID baked
   * into the component. Defaults to "blue".
   *
   * Recovery semantics (kept in lock-step with `lib/recoveryScore.ts`):
   *  - emerald  → recovered  (green)
   *  - amber    → fatigued   (yellow / orange)
   *  - rose     → at risk    (red)
   *  - blue     → neutral / no state yet
   */
  tone?: "blue" | "emerald" | "amber" | "rose";
  /**
   * Optional content rendered in the center of the ring (a stat, an
   * emoji, an icon, etc.).
   */
  children?: React.ReactNode;
  /** Extra Tailwind classes appended to the wrapping div. */
  className?: string;
  /** Delay in seconds before the ring fills. Defaults to 0.1. */
  delay?: number;
};

const TONE_GRADIENTS: Record<
  NonNullable<ProgressRingProps["tone"]>,
  { id: string; from: string; via: string; to: string }
> = {
  blue: { id: "ring-blue", from: "#60a5fa", via: "#3b82f6", to: "#2563eb" },
  emerald: { id: "ring-emerald", from: "#6ee7b7", via: "#10b981", to: "#047857" },
  amber: { id: "ring-amber", from: "#fcd34d", via: "#f59e0b", to: "#b45309" },
  rose: { id: "ring-rose", from: "#fda4af", via: "#f43f5e", to: "#be123c" },
};

/**
 * Animated circular progress ring with a gradient stroke. Tweens the
 * `strokeDashoffset` from 0% to the target percentage so the arc draws
 * itself in like a watch face filling.
 *
 * Used for recovery score, plan consistency, and any other 0-100% stat
 * where a circle reads more "alive" than a flat bar.
 */
export default function ProgressRing({
  value,
  size = 96,
  stroke = 8,
  tone = "blue",
  children,
  className = "",
  delay = 0.1,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(1, value));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped);
  const grad = TONE_GRADIENTS[tone];

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={grad.id} x1="0" y1="0" x2={size} y2={size}>
            <stop offset="0%" stopColor={grad.from} />
            <stop offset="50%" stopColor={grad.via} />
            <stop offset="100%" stopColor={grad.to} />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-neutral-200/70 dark:text-white/10"
          fill="none"
        />
        {/* Active arc */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={`url(#${grad.id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay }}
        />
      </svg>
      {children !== undefined && (
        <div className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
}
