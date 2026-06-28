"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

type PhoneFrameProps = {
  children: ReactNode;
  className?: string;
  screenClassName?: string;
  screenMinHeightClass?: string;
  label?: string;
};

/**
 * Rounded mobile-product frame for Kinetic preview moments.
 *
 * This is intentionally generic: pages provide the actual UI content
 * inside the screen. The frame supplies the device silhouette, glass
 * rim, speaker notch, and reduced-motion-aware hover lift.
 */
export default function PhoneFrame({
  children,
  className = "",
  screenClassName = "",
  screenMinHeightClass = "min-h-[20rem]",
  label = "Kinetic mobile preview",
}: PhoneFrameProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      aria-label={label}
      whileHover={reduceMotion ? undefined : { y: -5 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={`relative overflow-hidden rounded-[2rem] border border-white/35 bg-neutral-950 p-2 shadow-[0_34px_72px_-36px_rgb(15_23_42/0.72)] ${className}`}
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-10 top-1 z-20 h-5 rounded-b-2xl bg-neutral-950"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[2rem] bg-[linear-gradient(135deg,rgba(255,255,255,0.32),transparent_34%,rgba(255,255,255,0.10)_68%,transparent)]"
      />
      <div
        className={`relative ${screenMinHeightClass} overflow-hidden rounded-[1.5rem] bg-[linear-gradient(180deg,#f8fbff,#eef6ff_58%,#ffffff)] p-4 text-neutral-950 dark:bg-[linear-gradient(180deg,#111827,#0f172a_58%,#101827)] dark:text-neutral-50 ${screenClassName}`}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white/75 to-transparent dark:from-white/8"
        />
        <div className="relative">{children}</div>
      </div>
    </motion.div>
  );
}
