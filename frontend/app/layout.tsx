import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import TopNav from "@/components/top-nav";
import MotionBackground from "@/components/MotionBackground";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Space Grotesk — the brand wordmark face. Geometric grotesque with
// just enough personality (slightly humanist `e`/`a`, taut counters)
// to carry the "Kinetic" name without competing with the body type.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Kinetic — Adaptive training",
  description: "Adaptive training decisions based on your readiness, plan, and time.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      {/*
        Premium-minimal shell, inspired by apple.com / linear.app:
          - soft top-down gradient (neutral-100 → white) that stays put on
            long pages via bg-fixed, so the wash never tiles or seams
          - sticky top nav rendered by <TopNav>, which already sets its
            own backdrop-blur and subtle bottom border
          - centered content column capped at max-w-6xl with generous
            horizontal padding that scales up on larger viewports
      */}
      <body className="relative min-h-screen overflow-x-hidden bg-gradient-to-b from-gray-50 to-white bg-fixed text-neutral-900 antialiased dark:from-neutral-950 dark:to-black dark:text-neutral-100">
        {/* Slow-drifting gradient blobs + subtle topographic texture
            wrap the whole app so motion (the brand) is felt before any
            content renders. Mounted once at the layout level, fixed
            behind the content via `fixed inset-0 -z-10`. */}
        <div className="pointer-events-none fixed inset-0 -z-10">
          <MotionBackground variant="ambient" contours />
        </div>
        <TopNav />
        <div className="mx-auto w-full max-w-6xl px-6 sm:px-8 lg:px-12">
          {children}
        </div>
      </body>
    </html>
  );
}
