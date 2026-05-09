"use client";

import { useId } from "react";
import { motion } from "framer-motion";

type StrideWaveProps = {
  /** Width in pixels. Defaults to 320. */
  width?: number;
  /** Height in pixels. Defaults to 56. */
  height?: number;
  /** Optional Tailwind classes. */
  className?: string;
  /**
   * Stroke tone. Defaults to "blue" for primary surfaces; "muted" reads
   * as a quiet inline divider. "emerald" / "amber" match the recovery
   * palette for tinted contexts.
   */
  tone?: "blue" | "muted" | "emerald" | "amber";
  /**
   * If false, the stride only draws once on mount instead of looping.
   * Defaults to true.
   */
  loop?: boolean;
};

const TONE_COLORS: Record<
  NonNullable<StrideWaveProps["tone"]>,
  { from: string; to: string }
> = {
  blue: { from: "#60a5fa", to: "#3b82f6" },
  muted: { from: "#94a3b8", to: "#64748b" },
  emerald: { from: "#34d399", to: "#10b981" },
  amber: { from: "#fbbf24", to: "#f59e0b" },
};

/**
 * Stylized "stride waveform" — a smooth sinusoidal line that draws
 * itself in like a heartbeat trace. Visually represents the rhythm of
 * a runner's stride and the data feedback loop driving Kinetic.
 *
 * Used as a decorative accent on the dashboard hero, the recovery
 * page, and section dividers. The line uses a horizontal gradient
 * (transparent → tone → tone → transparent) so the ends fade out
 * cleanly without a CSS mask. Cheap to render (one SVG path).
 */
export default function StrideWave({
  width = 320,
  height = 56,
  className = "",
  tone = "blue",
  loop = true,
}: StrideWaveProps) {
  // Stable per-instance gradient ID so multiple StrideWaves on the
  // same page don't collide on the `<defs>` namespace. `useId` keeps
  // SSR + client renders in sync.
  const reactId = useId();
  const gradId = `stride-grad-${reactId.replace(/:/g, "")}`;

  const colors = TONE_COLORS[tone];

  // Build a low-amplitude sine path scaled to the supplied box.
  const amp = height * 0.32;
  const mid = height / 2;
  const points: string[] = [];
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * width;
    // Two stacked sines so the curve has a natural "stride" rhythm
    // rather than a single uniform wave.
    const y =
      mid +
      Math.sin((i / steps) * Math.PI * 4) * amp * 0.7 +
      Math.sin((i / steps) * Math.PI * 8 + 0.6) * amp * 0.3;
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  const d = `M ${points[0]} L ${points.slice(1).join(" L ")}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden="true"
      fill="none"
    >
      <defs>
        {/* Horizontal stroke fade — feathers the line ends so the wave */}
        {/* dissolves into the page rather than terminating sharply. */}
        <linearGradient id={gradId} x1="0" y1="0" x2={width} y2="0">
          <stop offset="0%" stopColor={colors.from} stopOpacity="0" />
          <stop offset="18%" stopColor={colors.from} stopOpacity="1" />
          <stop offset="82%" stopColor={colors.to} stopOpacity="1" />
          <stop offset="100%" stopColor={colors.to} stopOpacity="0" />
        </linearGradient>
      </defs>

      <motion.path
        d={d}
        stroke={`url(#${gradId})`}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ opacity: 0 }}
        animate={
          loop
            ? { opacity: [0.7, 1, 0.7] }
            : { opacity: 0.95 }
        }
        transition={
          loop
            ? {
                duration: 3.6,
                ease: [0.22, 1, 0.36, 1],
                repeat: Infinity,
                repeatType: "reverse",
              }
            : { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
        }
      />
    </svg>
  );
}
