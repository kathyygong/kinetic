/**
 * Semantic color tokens for Kinetic.
 *
 * The system has four soft, low-saturation tokens:
 *   • primary  — blue.    Actions, highlights, the "today" / "current" state.
 *   • success  — green.   Good recovery, positive deltas, accepted workouts.
 *   • warning  — amber.   Fatigue, plan adjustments needed, low recovery.
 *   • danger   — rose.    At-risk recovery, errors, blocking issues.
 *
 * Use these instead of raw Tailwind colors (`bg-emerald-50`, `bg-amber-100`,
 * etc.) so the palette stays coherent. Each token exposes:
 *   - solid   : filled button / pill (white text on tinted background)
 *   - soft    : tinted surface for banners, chips, info boxes
 *   - text    : just the text color (for inline highlights, deltas)
 *   - border  : just the border color
 *   - dot     : background color for tiny status dots
 *
 * Two interaction variants are exported:
 *
 *   tokens.motion      — press-only (smooth transition + scale-down on
 *                        click + focus ring). Use for tile / segmented /
 *                        secondary buttons where a hover scale feels
 *                        cramped.
 *
 *   The `solid` variants below — same as `tokens.motion` plus a subtle
 *                        hover grow (`hover:scale-[1.02]`). Used on
 *                        standalone primary CTAs.
 */
const interaction =
  "transition-[transform,background-color,box-shadow,border-color] duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-950";

const interactionLift = `${interaction} hover:scale-[1.02]`;

export const tokens = {
  /** Generic press affordance for any clickable that doesn't use a tinted
   *  variant below (e.g. ghost / outline / segmented buttons). */
  motion: interaction,
  primary: {
    /** Filled CTA button: "Accept", "Save", "Set training goal". */
    solid: `bg-blue-500 text-white shadow-sm hover:bg-blue-600 hover:shadow-md active:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 ${interactionLift}`,
    /** Soft tinted surface for banners and info boxes. */
    soft: "border-blue-100 bg-blue-50/80 text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-100",
    /** Selected chip / pill: stronger border than soft, still light bg. */
    softActive:
      "border-blue-300 bg-blue-50 text-blue-900 shadow-[inset_0_0_0_1px_rgb(147_197_253/0.4)] dark:border-blue-700/60 dark:bg-blue-950/40 dark:text-blue-100",
    /** Inline text accent. */
    text: "text-blue-700 dark:text-blue-300",
    /** Border only. */
    border: "border-blue-200 dark:border-blue-900/40",
    /** Status dot. */
    dot: "bg-blue-500",
    /** Hero gradient background (very soft). */
    heroGradient: "bg-gradient-to-br from-blue-50 to-transparent",
    /** Focus ring — used for inputs / interactive surfaces. */
    ring: "focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50",
  },
  success: {
    solid: `bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 hover:shadow-md dark:bg-emerald-500 dark:hover:bg-emerald-400 ${interactionLift}`,
    soft: "border-emerald-100 bg-emerald-50/80 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100",
    text: "text-emerald-700 dark:text-emerald-400",
    border: "border-emerald-200 dark:border-emerald-900/40",
    dot: "bg-emerald-500",
  },
  warning: {
    solid: `bg-amber-500 text-white shadow-sm hover:bg-amber-600 hover:shadow-md dark:bg-amber-500 dark:hover:bg-amber-400 ${interactionLift}`,
    soft: "border-amber-100 bg-amber-50/80 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100",
    text: "text-amber-700 dark:text-amber-400",
    border: "border-amber-200 dark:border-amber-900/40",
    dot: "bg-amber-500",
  },
  danger: {
    solid: `bg-rose-600 text-white shadow-sm hover:bg-rose-700 hover:shadow-md dark:bg-rose-500 dark:hover:bg-rose-400 ${interactionLift}`,
    soft: "border-rose-100 bg-rose-50/80 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-100",
    text: "text-rose-700 dark:text-rose-400",
    border: "border-rose-200 dark:border-rose-900/40",
    dot: "bg-rose-500",
  },
} as const;
