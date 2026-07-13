"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  CalendarDays,
  HeartPulse,
  LayoutDashboard,
  LogIn,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import Avatar from "@/components/Avatar";
import KineticLogo from "@/components/KineticLogo";
import { auth, type User } from "@/lib/firebase";
import { getUserProfile } from "@/lib/profileStorage";
import { tokens } from "@/lib/tokens";

const NAV_ITEMS: {
  href: string;
  label: string;
  mobileLabel?: string;
  icon: LucideIcon;
}[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    mobileLabel: "Today",
    icon: LayoutDashboard,
  },
  { href: "/plan", label: "Plan", icon: CalendarDays },
  { href: "/recovery", label: "Recovery", icon: HeartPulse },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

// Routes where the global nav should not render.
const NAV_HIDDEN_ROUTES = ["/login", "/onboarding", "/mobile-companion"];

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
    <>
      <header className="sticky top-0 z-40 hidden border-b border-black/5 bg-white/84 backdrop-blur-xl sm:block dark:border-white/10 dark:bg-neutral-950/84">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-8">
            <Link
              href="/dashboard"
              aria-label="Kinetic — go to dashboard"
              className="group flex items-center gap-2.5 transition-opacity hover:opacity-90"
            >
              <KineticLogo size={26} />
              <span className="font-brand select-none text-[13px] font-semibold uppercase leading-none tracking-[0.22em] text-neutral-900 dark:text-white">
                Kinetic
              </span>
            </Link>
            <nav
              aria-label="Primary navigation"
              className="hidden items-center gap-1 sm:flex"
            >
              {NAV_ITEMS.map((item) => {
                const active =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
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
                aria-current={profileActive ? "page" : undefined}
                title={displayName}
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

      <aside
        id="mobile-primary-nav"
        className="fixed inset-y-0 left-0 z-40 flex w-16 flex-col border-r border-black/5 bg-white/84 px-1.5 backdrop-blur-xl sm:hidden dark:border-white/10 dark:bg-neutral-950/84"
      >
        <Link
          href="/dashboard"
          aria-label="Kinetic — go to today"
          title="Kinetic"
          className="flex h-16 shrink-0 items-center justify-center border-b border-black/5 transition-opacity hover:opacity-80 dark:border-white/10"
        >
          <KineticLogo size={34} />
        </Link>

        <nav
          aria-label="Primary navigation"
          className="flex flex-col items-center gap-1 pt-3"
        >
          {NAV_ITEMS.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            const railLabel = item.mobileLabel ?? item.label;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={railLabel}
                title={railLabel}
                className={`relative flex h-14 w-full flex-col items-center justify-center gap-1 rounded-lg transition-colors ${
                  active
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950/45 dark:text-blue-300"
                    : "text-neutral-500 hover:bg-neutral-100/80 hover:text-neutral-950 dark:text-neutral-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
                }`}
              >
                {active ? (
                  <span
                    aria-hidden="true"
                    className="absolute -left-1.5 h-7 w-0.5 rounded-r-full bg-blue-600 dark:bg-blue-400"
                  />
                ) : null}
                <Icon aria-hidden="true" size={19} strokeWidth={1.9} />
                <span className="max-w-full truncate px-0.5 text-[9px] font-semibold leading-none">
                  {railLabel}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-black/5 py-3 dark:border-white/10">
          {user ? (
            <Link
              href="/profile"
              aria-label="Profile"
              aria-current={profileActive ? "page" : undefined}
              title={displayName}
              className={`relative flex h-14 w-full flex-col items-center justify-center gap-1 rounded-lg transition-colors ${
                profileActive
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-950/45 dark:text-blue-300"
                  : "text-neutral-500 hover:bg-neutral-100/80 dark:text-neutral-400 dark:hover:bg-white/[0.06]"
              }`}
            >
              {profileActive ? (
                <span
                  aria-hidden="true"
                  className="absolute -left-1.5 h-7 w-0.5 rounded-r-full bg-blue-600 dark:bg-blue-400"
                />
              ) : null}
              <span
                className={`rounded-full ${
                  profileActive
                    ? "ring-2 ring-blue-500/40 ring-offset-1 ring-offset-blue-50 dark:ring-offset-blue-950"
                    : ""
                }`}
              >
                <Avatar name={displayName} photo={photo} size={32} />
              </span>
              <span className="text-[9px] font-semibold leading-none">
                Profile
              </span>
            </Link>
          ) : (
            <Link
              href="/login"
              aria-label="Sign in"
              className="flex h-14 w-full flex-col items-center justify-center gap-1 rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100/80 hover:text-neutral-950 dark:text-neutral-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
            >
              <LogIn aria-hidden="true" size={19} strokeWidth={1.9} />
              <span className="text-[9px] font-semibold leading-none">
                Sign in
              </span>
            </Link>
          )}
        </div>
      </aside>
    </>
  );
}
