"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";

type LiquidSurfaceProps = {
  children: ReactNode;
  className?: string;
  motionProps?: HTMLMotionProps<"section">;
};

/**
 * Large translucent product-stage surface.
 *
 * This is intentionally a section-scale primitive, not a generic card:
 * use it for the primary product moment on a page where the content
 * should feel layered on the background instead of boxed into another
 * panel.
 */
export default function LiquidSurface({
  children,
  className = "",
  motionProps,
}: LiquidSurfaceProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.section
      {...motionProps}
      whileHover={reduceMotion ? undefined : { y: -2 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={`relative overflow-hidden rounded-[2.5rem] border border-white/60 bg-[linear-gradient(138deg,rgba(255,255,255,0.92),rgba(239,246,255,0.78)_44%,rgba(255,255,255,0.6)),linear-gradient(18deg,rgba(56,189,248,0.10),rgba(59,130,246,0.08)_46%,rgba(14,165,233,0.07))] shadow-[0_40px_90px_-46px_rgb(30_58_138/0.46),0_8px_24px_-16px_rgb(30_58_138/0.18)] backdrop-blur-xl dark:border-white/10 dark:bg-[linear-gradient(138deg,rgba(23,23,23,0.78),rgba(15,23,42,0.68)_44%,rgba(10,10,10,0.72)),linear-gradient(18deg,rgba(56,189,248,0.16),rgba(59,130,246,0.12)_46%,rgba(14,165,233,0.10))] dark:shadow-[0_40px_90px_-46px_rgb(0_0_0/0.7)] ${className}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/80 dark:bg-white/20"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:linear-gradient(110deg,transparent_0%,rgba(255,255,255,0.8)_18%,transparent_36%),linear-gradient(rgba(15,23,42,0.06)_1px,transparent_1px)] [background-size:220%_100%,22px_22px] dark:opacity-[0.10]"
      />
      <div className="relative">{children}</div>
    </motion.section>
  );
}
