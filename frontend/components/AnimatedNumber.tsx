"use client";

import { useEffect, useRef, useState } from "react";
import {
  animate as motionAnimate,
  useMotionValue,
  useTransform,
  motion,
  type MotionValue,
} from "framer-motion";

type AnimatedNumberProps = {
  /** Target numeric value. */
  value: number;
  /** Animation duration in seconds. Defaults to 0.9. */
  duration?: number;
  /** Decimal places to render. Defaults to 0. */
  decimals?: number;
  /** Optional suffix appended to the rendered string (e.g. "%", "mi"). */
  suffix?: string;
  /** Optional prefix (e.g. "$"). */
  prefix?: string;
  /**
   * Extra Tailwind classes for the wrapping span. The component renders
   * the digits with `tabular-nums` automatically so the width stays
   * stable as the value ticks.
   */
  className?: string;
  /**
   * If true (default), the count-up only runs once when the component
   * first mounts with a non-zero target. Subsequent value changes still
   * tween. Set to false to always start from 0.
   */
  smartInitial?: boolean;
};

/**
 * Smoothly tweens a numeric value from its previous render to the new
 * `value`, formatting with the supplied `decimals` / `prefix` / `suffix`.
 *
 * Used for the dashboard's race countdown, recovery score, and any other
 * place where a static number would feel less alive than a value that
 * settles into place. Uses Framer Motion's `animate()` so we get the
 * same easing curves as the rest of the app's transitions.
 */
export default function AnimatedNumber({
  value,
  duration = 0.9,
  decimals = 0,
  suffix = "",
  prefix = "",
  className = "",
  smartInitial = true,
}: AnimatedNumberProps) {
  // Start at 0 the first time so the count-up is always satisfying.
  // Subsequent updates tween from the previously displayed value, which
  // we track via `prevRef`.
  const prevRef = useRef<number>(smartInitial ? 0 : value);
  const mv = useMotionValue<number>(prevRef.current);
  const [text, setText] = useState<string>(() => format(prevRef.current, decimals));

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    if (from === to) {
      setText(format(to, decimals));
      return;
    }
    const controls = motionAnimate(mv, to, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setText(format(latest, decimals)),
    });
    prevRef.current = to;
    return () => controls.stop();
    // mv is stable; intentionally exclude it from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration, decimals]);

  return (
    <span className={`tabular-nums ${className}`}>
      {prefix}
      {text}
      {suffix}
    </span>
  );
}

function format(n: number, decimals: number): string {
  if (decimals <= 0) return Math.round(n).toString();
  return n.toFixed(decimals);
}

// Re-export a hook variant for callers that want to drive their own
// element (e.g. an SVG attribute) from the same tween.
export function useAnimatedNumber(value: number, duration = 0.9): MotionValue<number> {
  const mv = useMotionValue(value);
  useEffect(() => {
    const controls = motionAnimate(mv, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);
  return mv;
}

// `motion` & `useTransform` are re-exported for downstream callers that
// want to compose AnimatedNumber with other motion primitives without
// pulling Framer directly.
export { motion, useTransform };
