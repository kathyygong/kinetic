"use client";

import type { ReactNode } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";

/**
 * Props for the {@link GlassCard} component.
 */
type GlassCardProps = {
  /** Content rendered inside the card. */
  children: ReactNode;
  /** Optional extra Tailwind classes appended to the base styles. */
  className?: string;
  /**
   * Whether to lift the card slightly on hover (scale 1.015 + soft shadow).
   * Defaults to `true`. Set to `false` for static surfaces (banners, etc.).
   */
  interactive?: boolean;
  /**
   * Optional Framer Motion props (e.g. `initial`, `animate`, `transition`)
   * passed straight through to the underlying `motion.div`. Useful when the
   * card is part of a staggered entrance sequence.
   */
  motionProps?: HTMLMotionProps<"div">;
};

/**
 * Reusable frosted-glass card surface used across Kinetic for grouping
 * related content (recommendations, plan details, settings panels, etc.).
 *
 * Visual style: translucent white panel with a soft blur, hairline
 * border, rounded corners, and a subtle shadow. Designed to sit on top
 * of the global gradient background and feel premium / minimal.
 *
 * Subtle motion:
 *   - On hover: lifts up 2px with a wider, softer drop shadow.
 *   - Hover/tap transitions are short (~180ms) so the card never feels
 *     bouncy or sluggish.
 *
 * @example
 *   <GlassCard className="p-6">…</GlassCard>
 *   <GlassCard interactive={false} className="p-4">Banner</GlassCard>
 */
export default function GlassCard({
  children,
  className = "",
  interactive = true,
  motionProps,
}: GlassCardProps) {
  const hover = interactive
    ? {
        // Slightly stronger lift than before: a touch of vertical motion
        // plus a wider, softer shadow so the card visibly "comes forward"
        // without ever feeling jumpy.
        y: -2,
        boxShadow:
          "0 12px 32px -12px rgb(0 0 0 / 0.18), 0 4px 12px -8px rgb(0 0 0 / 0.10)",
      }
    : undefined;
  return (
    <motion.div
      whileHover={hover}
      transition={{ type: "tween", duration: 0.18, ease: "easeOut" }}
      {...motionProps}
      className={`rounded-2xl border border-white/20 bg-white/60 shadow-sm backdrop-blur-md ${className}`}
    >
      {children}
    </motion.div>
  );
}
