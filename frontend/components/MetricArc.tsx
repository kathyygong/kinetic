"use client";

import { useId } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";

type MetricArcTone = "blue" | "violet" | "emerald" | "amber" | "rose";

type MetricArcProps = {
  /** Progress value clamped to [0, 1]. */
  value: number;
  /** Outer width in pixels. The arc is a top semicircle, so the drawn
   *  height is roughly half this. Defaults to 200. */
  size?: number;
  /** Stroke width in pixels. Defaults to 14. */
  stroke?: number;
  /** Color theme for the active arc. Defaults to "blue". */
  tone?: MetricArcTone;
  /** Content rendered in the well of the arc (a big number, a label…). */
  children?: ReactNode;
  /** Extra classes on the wrapper. */
  className?: string;
  /** Seconds before the arc draws itself in. Defaults to 0.15. */
  delay?: number;
};

const TONE_GRADIENTS: Record<
  MetricArcTone,
  { from: string; via: string; to: string; dot: string }
> = {
  blue: { from: "#60a5fa", via: "#3b82f6", to: "#2563eb", dot: "#2563eb" },
  violet: { from: "#c4b5fd", via: "#8b5cf6", to: "#6d28d9", dot: "#6d28d9" },
  emerald: { from: "#6ee7b7", via: "#10b981", to: "#047857", dot: "#047857" },
  amber: { from: "#fcd34d", via: "#f59e0b", to: "#b45309", dot: "#b45309" },
  rose: { from: "#fda4af", via: "#f43f5e", to: "#be123c", dot: "#be123c" },
};

/**
 * Semicircle metric gauge — the "Level 9" arc from the reference mockup.
 *
 * Draws a top semicircle (speedometer style) whose active sweep fills
 * from the left to a point set by `value`, with a soft end-dot marking
 * the current position. The arc animates itself in like a watch face,
 * and a `children` slot sits in the well beneath the arc for the headline
 * stat. Self-contained SVG — no layout dependencies.
 */
export default function MetricArc({
  value,
  size = 200,
  stroke = 14,
  tone = "blue",
  children,
  className = "",
  delay = 0.15,
}: MetricArcProps) {
  const clamped = Math.max(0, Math.min(1, value));
  const uid = useId().replace(/[:]/g, "");
  const grad = TONE_GRADIENTS[tone];

  const cx = size / 2;
  const r = (size - stroke) / 2;
  const cy = r + stroke / 2;
  const height = r + stroke;
  const arcLength = Math.PI * r;

  // Top semicircle, left → right.
  const path = `M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${cy}`;

  // End-dot position at the value fraction along the arc.
  const dotX = cx - r * Math.cos(Math.PI * clamped);
  const dotY = cy - r * Math.sin(Math.PI * clamped);

  return (
    <div
      className={`relative inline-flex flex-col items-center ${className}`}
      style={{ width: size, maxWidth: "100%" }}
    >
      <svg
        width={size}
        height={height}
        viewBox={`0 0 ${size} ${height}`}
        className="h-auto w-full"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`arc-${uid}`} x1="0" y1="0" x2={size} y2="0">
            <stop offset="0%" stopColor={grad.from} />
            <stop offset="50%" stopColor={grad.via} />
            <stop offset="100%" stopColor={grad.to} />
          </linearGradient>
        </defs>
        {/* Track */}
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="text-neutral-200/70 dark:text-white/10"
        />
        {/* Active sweep */}
        <motion.path
          d={path}
          fill="none"
          stroke={`url(#arc-${uid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={arcLength}
          initial={{ strokeDashoffset: arcLength }}
          animate={{ strokeDashoffset: arcLength * (1 - clamped) }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay }}
        />
        {/* End dot */}
        <motion.circle
          cx={dotX}
          cy={dotY}
          r={stroke / 2 + 2}
          fill="#ffffff"
          stroke={grad.dot}
          strokeWidth={3}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: "easeOut", delay: delay + 0.9 }}
          style={{ transformOrigin: `${dotX}px ${dotY}px` }}
        />
      </svg>
      {children !== undefined && (
        <div className="-mt-2 flex flex-col items-center text-center">{children}</div>
      )}
    </div>
  );
}
