"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import Avatar from "@/components/Avatar";
import KineticLogo from "@/components/KineticLogo";
import { auth, type User } from "@/lib/firebase";
import { getUserProfile } from "@/lib/profileStorage";
import { tokens } from "@/lib/tokens";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/plan", label: "Plan" },
  { href: "/recovery", label: "Recovery" },
  { href: "/settings", label: "Settings" },
];

// Routes where the global nav should not render.
const NAV_HIDDEN_ROUTES = ["/login", "/onboarding"];

export default function TopNav() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  // Stored profile name/photo override the auth values when present, so
  // edits in /profile/edit take effect immediately in the nav avatar.
  const [profileName, setProfileName] = useState<string | null>(null);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser);
    return () => unsub();
  }, []);

  // Re-read the saved profile on every navigation. Cheap, and gives us
  // a fresh avatar after the user saves edits without wiring up an
  // event-based subscription.
  useEffect(() => {
    const p = getUserProfile();
    setProfileName(p?.full_name?.trim() || null);
    setProfilePhoto(p?.profile_photo?.trim() || null);
  }, [pathname]);

  if (!pathname || NAV_HIDDEN_ROUTES.some((r) => pathname.startsWith(r))) {
    return null;
  }

  const displayName =
    profileName ||
    user?.displayName?.trim() ||
    user?.email?.split("@")[0] ||
    "Athlete";
  const photo = profilePhoto || user?.photoURL || undefined;
  const profileActive =
    pathname === "/profile" || pathname.startsWith("/profile/");

  return (
    <header className="sticky top-0 z-30 border-b border-black/5 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-neutral-950/80">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link
            href="/dashboard"
            aria-label="Kinetic — go to dashboard"
            className="group flex items-center gap-2.5 transition-opacity hover:opacity-90"
          >
            <KineticLogo size={26} />
            {/*
              Wordmark — Space Grotesk in semibold, set in all caps
              with wide tracking. Uppercase letterforms with generous
              tracking is the canonical "premium product" wordmark
              treatment (Stripe, Linear, Arc) — it reads as deliberate
              and quiet rather than decorative. A single solid colour
              keeps the lockup clean alongside the gradient mark.
            */}
            <span className="font-brand select-none text-[13px] font-semibold uppercase leading-none tracking-[0.22em] text-neutral-900 dark:text-white">
              Kinetic
            </span>
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {NAV_ITEMS.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3 py-1.5 text-sm transition ${
                    active
                      ? "bg-neutral-100 font-medium text-black dark:bg-neutral-800 dark:text-white"
                      : "text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center text-sm">
          {user ? (
            <Link
              href="/profile"
              aria-label="Profile"
              title={displayName}
              // Active state: a soft ring matches the filled background
              // on the other nav items. Hover state previews it.
              className={`flex items-center justify-center rounded-full ${tokens.motion} ${
                profileActive
                  ? "ring-2 ring-blue-500/40 ring-offset-2 ring-offset-white dark:ring-offset-neutral-950"
                  : "hover:ring-2 hover:ring-black/10 hover:ring-offset-2 hover:ring-offset-white dark:hover:ring-white/15 dark:hover:ring-offset-neutral-950"
              }`}
            >
              <Avatar name={displayName} photo={photo} size={32} />
            </Link>
          ) : (
            <Link
              href="/login"
              className={`rounded-md border border-black/10 px-3 py-1.5 text-neutral-700 hover:border-black/20 hover:bg-neutral-50 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-neutral-800 ${tokens.motion}`}
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
