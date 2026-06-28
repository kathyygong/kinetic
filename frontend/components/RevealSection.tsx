"use client";

import { createElement } from "react";
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Static map of the element types `RevealSection` can render. Declared
 * once at module scope so we never call `motion(tag)` during render
 * (which would create a fresh component on every render and reset its
 * state — flagged by `react-hooks/static-components`).
 */
const MOTION_TAGS = {
  div: motion.div,
  section: motion.section,
  article: motion.article,
  header: motion.header,
  li: motion.li,
  ul: motion.ul,
  span: motion.span,
} as const;

type RevealTag = keyof typeof MOTION_TAGS;

type RevealSectionProps = {
  children: ReactNode;
  className?: string;
  /**
   * Element to render. Defaults to a plain `div`. Pass `"section"`,
   * `"li"`, etc. when the reveal wrapper should also carry semantics.
   */
  as?: RevealTag;
  /**
   * Seconds to wait before the reveal starts. Use increasing values on
   * sibling blocks to stagger them in as the viewport reaches them.
   */
  delay?: number;
  /**
   * Vertical travel distance (px) the content rises from. Larger feels
   * more dramatic; the default reads as a gentle Apple-style lift.
   */
  y?: number;
  /**
   * Starting scale. Slightly < 1 gives the content a subtle "settle"
   * as it arrives. Set to 1 to disable the scale and only translate.
   */
  scaleFrom?: number;
  /**
   * Replay the reveal every time the block scrolls back into view.
   * Defaults to once (Apple product pages reveal a section a single
   * time, then leave it be).
   */
  once?: boolean;
};

/**
 * Scroll-linked reveal wrapper.
 *
 * Wrap a page section so it fades, lifts, and gently settles into place
 * as it enters the viewport — the core interaction borrowed from
 * Apple-style product pages. Respects `prefers-reduced-motion`: when the
 * user opts out we render the content in its final state immediately,
 * with no transform or opacity tween.
 *
 * Intentionally additive: it never changes layout of its children, so it
 * can be dropped around existing blocks without reflowing the page.
 */
export default function RevealSection({
  children,
  className = "",
  as = "div",
  delay = 0,
  y = 26,
  scaleFrom = 0.985,
  once = true,
}: RevealSectionProps) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return createElement(as, { className }, children);
  }

  const MotionTag = MOTION_TAGS[as];

  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y, scale: scaleFrom }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </MotionTag>
  );
}
