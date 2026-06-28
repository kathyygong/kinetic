"use client";

import type { ReactNode } from "react";
import Image from "next/image";

type AthleticImageProps = {
  /** Path under /public, e.g. "/images/athletic/track-lanes.jpg". */
  src: string;
  /** Required alt text for accessibility. */
  alt: string;
  /** Small uppercase label rendered above the title. */
  eyebrow?: string;
  /** Large editorial overlay headline. */
  title?: ReactNode;
  /** Semantic heading level for the editorial title. Defaults to h2. */
  headingLevel?: "h1" | "h2";
  /** Supporting line under the title. */
  subtitle?: string;
  /** Extra overlay content (CTAs, stats) rendered below the text. */
  children?: ReactNode;
  /**
   * Outer wrapper classes. Use this to set the height (e.g. `h-72`) and
   * any rounding override; a height class here wins over the default.
   */
  className?: string;
  /** Rounding for the frame. Defaults to a generous editorial radius. */
  rounded?: string;
  /** Where the overlay text sits vertically. Defaults to bottom. */
  align?: "bottom" | "center";
  /** CSS object-position focal point for the photo. Defaults to center. */
  focus?: string;
  /** Pass `true` for above-the-fold heroes so Next preloads the image. */
  priority?: boolean;
};

/**
 * Full-bleed athletic photo frame.
 *
 * Renders a rounded, overflow-hidden image card with a blue duotone +
 * bottom-up legibility gradient and optional editorial overlay text —
 * the "full-bleed photography in a rounded card" pattern from the
 * reference design. The photo eases into a slow zoom on hover (disabled
 * under `prefers-reduced-motion`).
 *
 * The wrapper uses `next/image` with `fill`, so the caller must give the
 * frame a height via `className` (a sensible default is provided).
 */
export default function AthleticImage({
  src,
  alt,
  eyebrow,
  title,
  headingLevel = "h2",
  subtitle,
  children,
  className = "",
  rounded = "rounded-[2rem]",
  align = "bottom",
  focus = "center",
  priority = false,
}: AthleticImageProps) {
  const hasOverlayText = eyebrow || title || subtitle || children;

  return (
    <div
      className={`group relative isolate h-72 overflow-hidden border border-white/15 shadow-[0_30px_70px_-40px_rgb(30_58_138/0.55)] sm:h-80 ${rounded} ${className}`}
    >
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes="(max-width: 1024px) 100vw, 1024px"
        style={{ objectPosition: focus }}
        className="object-cover transition-transform duration-[1200ms] ease-out will-change-transform group-hover:scale-[1.06] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
      />
      {/* Blue duotone wash keeps every photo on-brand. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-blue-600/12 mix-blend-multiply"
      />
      {/* Bottom-up legibility gradient so overlay text always reads. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-blue-950/85 via-blue-950/25 to-transparent"
      />
      {hasOverlayText ? (
        <div
          className={`absolute inset-0 flex flex-col gap-2 p-6 sm:p-8 ${
            align === "center" ? "justify-center" : "justify-end"
          }`}
        >
          {eyebrow ? (
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/85">
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-full bg-gradient-to-br from-sky-300 to-blue-400"
              />
              {eyebrow}
            </p>
          ) : null}
          {title && headingLevel === "h1" ? (
            <h1 className="text-balance text-3xl font-semibold leading-[1.05] text-white drop-shadow-sm sm:text-4xl">
              {title}
            </h1>
          ) : title ? (
            <h2 className="text-balance text-3xl font-semibold leading-[1.05] text-white drop-shadow-sm sm:text-4xl">
              {title}
            </h2>
          ) : null}
          {subtitle ? (
            <p className="max-w-xl text-sm leading-relaxed text-white/85 sm:text-base">
              {subtitle}
            </p>
          ) : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}
