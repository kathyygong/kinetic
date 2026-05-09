"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";

type PageContainerProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Top-level page wrapper that fades content in with a subtle upward
 * drift on mount. Used by every authenticated page (dashboard, plan,
 * recovery, settings) so the app feels cohesive and premium.
 *
 * Motion is intentionally short (~250ms) and small (12px rise) so it
 * reads as a polish detail, not a flashy effect.
 */
export default function PageContainer({
  children,
  className = "",
}: PageContainerProps) {
  return (
    <motion.main
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.main>
  );
}
