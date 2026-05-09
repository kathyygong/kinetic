"use client";

type KineticLogoProps = {
  /** Pixel size of the square logo mark. Defaults to 28. */
  size?: number;
  /** Extra Tailwind classes appended to the wrapper. */
  className?: string;
};

/**
 * Kinetic brand mark — a typographic monogram set inside a rounded
 * square.
 *
 * The "K" is drawn as filled letterform shapes, not symmetric strokes:
 *   - The stem is a thin vertical bar with sharp terminals (no rounded
 *     caps) — closer to a refined sans like Space Grotesk than to
 *     hand-drawn marker strokes.
 *   - The two diagonals are filled parallelograms whose junction
 *     sits ABOVE the optical centre (~y=13.8 on a 32 grid). That's
 *     the defining proportion that separates a real K letterform
 *     from three intersecting sticks.
 *   - The lower diagonal is slightly longer than the upper one,
 *     mirroring how almost every serious typeface draws this letter.
 *
 * Together with the rounded-square container in a deep indigo→slate
 * gradient, the lockup reads as a considered product mark — the same
 * idiom used by Linear, Stripe, Notion.
 */
export default function KineticLogo({
  size = 28,
  className = "",
}: KineticLogoProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 32 32"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
      >
        <defs>
          {/* Container fill — a tight two-stop gradient from an
              indigo midnight into a near-black slate. Restrained
              enough to read as a single solid colour at favicon
              sizes, deep enough to feel premium at hero sizes. */}
          <linearGradient id="kinetic-mark" x1="0" y1="0" x2="32" y2="32">
            <stop offset="0%" stopColor="#1e3a8a" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
        </defs>

        {/* Rounded-square container — rx=7.5 / 32 ≈ 23%, the modern
            "soft squircle" rounding used by most polished product
            marks. */}
        <rect x="0" y="0" width="32" height="32" rx="7.5" fill="url(#kinetic-mark)" />

        {/*
          Typographic K — drawn as filled paths so the letterform has
          real terminals and the upper/lower arms can have different
          lengths. Coordinates are tuned so the optical weight matches
          a heavy sans-serif at the same x-height.
        */}
        <g fill="#ffffff">
          {/* Stem — narrow vertical bar, sharp 90° corners. */}
          <path d="M9.4 8 H12 V24 H9.4 Z" />
          {/* Upper diagonal — quadrilateral from junction (just above
              centre) up and out to the top-right shoulder. */}
          <path d="M12 13.8 L19.6 8 H22.6 L13.6 14.85 Z" />
          {/* Lower diagonal — slightly longer, sweeps out further to
              the lower-right baseline (the classic K weighting). */}
          <path d="M12 13.8 L13.6 13.8 L23.2 24 H19.9 Z" />
        </g>
      </svg>
    </span>
  );
}

