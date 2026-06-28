"use client";

import { motion, useReducedMotion } from "framer-motion";

type MotionBackgroundProps = {
  /**
   * Visual density. "ambient" (default) is a quiet, app-wide wash with
   * two slow-drifting blobs. "hero" amps up size + opacity for landing
   * pages where the background should feel more present.
   */
  variant?: "ambient" | "hero";
  /**
   * Whether to render an animated topographic contour pattern beneath
   * the gradient blobs. Adds a subtle "trail map" texture that fits
   * Kinetic's running theme. Defaults to true on hero, false on ambient.
   */
  contours?: boolean;
};

/**
 * Decorative app-wide background. Two soft blue/sky gradient blobs that
 * drift slowly across the viewport (~32s loop) to give the app a quiet
 * sense of motion — a visual nod to the "Kinetic" brand.
 *
 * Optionally overlays a faint topographic line pattern that evokes a
 * trail map / contour reading without dominating the page. The whole
 * thing is `pointer-events-none` and `aria-hidden`, so it never
 * interferes with content beneath it.
 *
 * Designed to be mounted once per page (or once globally in the layout
 * if you want it everywhere). Cheaper than CSS `background-attachment:
 * fixed` because the blobs are GPU-composited and the contour pattern
 * is a tiny SVG `<pattern>` repeated as a CSS background.
 */
export default function MotionBackground({
  variant = "ambient",
  contours,
}: MotionBackgroundProps) {
  const isHero = variant === "hero";
  const showContours = contours ?? isHero;
  // Respect the user's reduced-motion preference: render the gradient
  // wash but hold the blobs still instead of drifting them forever.
  const reduceMotion = useReducedMotion();
  // Sizing + tint amplifies for hero pages so the wash feels like a
  // proper backdrop, not a hint.
  const blobSize = isHero ? "h-[42rem] w-[42rem]" : "h-[34rem] w-[34rem]";
  const tintA = isHero
    ? "from-blue-400/42 via-sky-400/22 to-transparent"
    : "from-blue-400/32 via-sky-400/16 to-transparent";
  const tintB = isHero
    ? "from-sky-400/38 via-blue-400/20 to-transparent"
    : "from-sky-400/28 via-blue-400/14 to-transparent";
  // Cyan accent — keeps the wash lively while staying in the blue family.
  const tintC = isHero
    ? "from-cyan-400/30 via-sky-400/18 to-transparent"
    : "from-cyan-400/22 via-sky-400/12 to-transparent";
  const blobSizeC = isHero ? "h-[38rem] w-[38rem]" : "h-[30rem] w-[30rem]";
  // Indigo accent — a deeper blue corner glow for added depth.
  const tintD = isHero
    ? "from-indigo-400/26 via-blue-400/14 to-transparent"
    : "from-indigo-400/18 via-blue-400/10 to-transparent";
  const blobSizeD = isHero ? "h-[30rem] w-[30rem]" : "h-[26rem] w-[26rem]";

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      {/* Soft lavender wash — a periwinkle gradient anchored to the top
          of the viewport that warms the whole page beneath the blobs. */}
      <div
        className={`absolute inset-0 ${
          isHero
            ? "bg-[radial-gradient(120%_85%_at_50%_-10%,rgba(59,130,246,0.18),transparent_58%)]"
            : "bg-[radial-gradient(120%_85%_at_50%_-10%,rgba(59,130,246,0.11),transparent_58%)]"
        } dark:opacity-50`}
      />
      {/* Blob A — drifts diagonally bottom-left ↔ top-right. */}
      <motion.div
        className={`absolute -top-40 right-[-20%] rounded-full bg-gradient-to-br blur-3xl ${blobSize} ${tintA}`}
        initial={{ x: 0, y: 0, scale: 1 }}
        animate={
          reduceMotion
            ? undefined
            : {
                x: [0, -40, 24, 0],
                y: [0, 28, -16, 0],
                scale: [1, 1.06, 0.97, 1],
              }
        }
        transition={
          reduceMotion
            ? undefined
            : {
                duration: 32,
                ease: "easeInOut",
                repeat: Infinity,
                repeatType: "loop",
              }
        }
      />
      {/* Blob B — drifts the opposite direction for a balanced parallax. */}
      <motion.div
        className={`absolute -bottom-40 left-[-20%] rounded-full bg-gradient-to-tr blur-3xl ${blobSize} ${tintB}`}
        initial={{ x: 0, y: 0, scale: 1 }}
        animate={
          reduceMotion
            ? undefined
            : {
                x: [0, 36, -28, 0],
                y: [0, -22, 14, 0],
                scale: [1, 0.97, 1.05, 1],
              }
        }
        transition={
          reduceMotion
            ? undefined
            : {
                duration: 38,
                ease: "easeInOut",
                repeat: Infinity,
                repeatType: "loop",
              }
        }
      />

      {/* Blob C — lavender accent that breathes near the upper-center,
          giving the wash its periwinkle warmth on a slower loop. */}
      <motion.div
        className={`absolute -top-32 left-1/3 rounded-full bg-gradient-to-b blur-3xl ${blobSizeC} ${tintC}`}
        initial={{ x: 0, y: 0, scale: 1 }}
        animate={
          reduceMotion
            ? undefined
            : {
                x: [0, 30, -22, 0],
                y: [0, 18, 30, 0],
                scale: [1, 1.05, 0.96, 1],
              }
        }
        transition={
          reduceMotion
            ? undefined
            : {
                duration: 44,
                ease: "easeInOut",
                repeat: Infinity,
                repeatType: "loop",
              }
        }
      />

      {/* Blob D — warm coral glow drifting along the lower-right, the
          mockup's orange "energy" accent kept low and slow. */}
      <motion.div
        className={`absolute bottom-[-12%] right-[-10%] rounded-full bg-gradient-to-tl blur-3xl ${blobSizeD} ${tintD}`}
        initial={{ x: 0, y: 0, scale: 1 }}
        animate={
          reduceMotion
            ? undefined
            : {
                x: [0, -26, 16, 0],
                y: [0, -18, 12, 0],
                scale: [1, 1.04, 0.97, 1],
              }
        }
        transition={
          reduceMotion
            ? undefined
            : {
                duration: 50,
                ease: "easeInOut",
                repeat: Infinity,
                repeatType: "loop",
              }
        }
      />

      {showContours && <ContourTexture />}
    </div>
  );
}

/**
 * Faint topographic contour overlay. Tiles a hand-drawn SVG pattern at
 * ~3-4% opacity so it reads as paper texture rather than imagery.
 * Inspired by trail maps — fits the running/training theme without
 * looking like an explicit illustration.
 */
function ContourTexture() {
  // Contour SVG encoded inline so we avoid a network round-trip and
  // can tint it via stroke color directly.
  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' width='240' height='240' viewBox='0 0 240 240'>
      <g fill='none' stroke='%233b82f6' stroke-width='1' stroke-opacity='0.5'>
        <path d='M-20,80 C40,60 80,140 140,120 C200,100 240,160 280,140' />
        <path d='M-20,120 C40,100 80,180 140,160 C200,140 240,200 280,180' />
        <path d='M-20,160 C40,140 80,220 140,200 C200,180 240,240 280,220' />
        <path d='M-20,40 C40,20 80,100 140,80 C200,60 240,120 280,100' />
        <path d='M-20,200 C40,180 80,260 140,240 C200,220 240,280 280,260' />
      </g>
    </svg>
  `;
  const url = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  return (
    <div
      className="absolute inset-0 opacity-[0.035] dark:opacity-[0.05]"
      style={{
        backgroundImage: url,
        backgroundSize: "240px 240px",
        backgroundRepeat: "repeat",
      }}
    />
  );
}
