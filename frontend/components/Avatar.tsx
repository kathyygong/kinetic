"use client";

import { useState } from "react";

type AvatarProps = {
  /** Display name. Used for `alt` text and as a fallback to initials. */
  name: string;
  /** Image URL. If omitted or it errors, the initials tile is shown instead. */
  photo?: string;
  /**
   * Pixel size. The component renders a perfect circle at this size.
   * Defaults to 40 (a comfortable nav size). Use 96 for the profile
   * page header.
   */
  size?: number;
  /** Extra Tailwind classes appended to the root element. */
  className?: string;
};

/**
 * Round avatar with graceful fallback.
 *
 * Behavior:
 *   - If a `photo` URL is provided and loads, show the image.
 *   - If the image errors (Google avatars can be blocked by ORB / CORS),
 *     swap to a tinted tile with the user's initials.
 *   - If no `photo`, render the initials tile directly.
 *
 * Sizing is driven by inline width/height so the same component works
 * for a 40px nav badge and a 96px profile header.
 */
export default function Avatar({
  name,
  photo,
  size = 40,
  className = "",
}: AvatarProps) {
  const [broken, setBroken] = useState(false);
  // Reset the error flag when the URL changes — a new photo deserves
  // a fresh load attempt.
  const showImage = !!photo && !broken;

  // Scale the font down with the tile so initials always look balanced.
  const fontSize = Math.max(11, Math.round(size * 0.36));

  const sharedClasses =
    "shrink-0 rounded-full border border-black/10 shadow-sm dark:border-white/10";

  if (showImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo}
        alt={name}
        width={size}
        height={size}
        onError={() => setBroken(true)}
        referrerPolicy="no-referrer"
        className={`${sharedClasses} object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      aria-label={name}
      role="img"
      className={`${sharedClasses} flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100 font-semibold text-blue-700 dark:from-blue-950/60 dark:to-blue-900/40 dark:text-blue-200 ${className}`}
      style={{ width: size, height: size, fontSize }}
    >
      {initials(name)}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
