"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion, type Variants } from "framer-motion";
import { FirebaseError } from "firebase/app";

import OnboardingProgress from "@/components/OnboardingProgress";
import {
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  getGoogleCalendarConnection,
} from "@/lib/integrations/googleCalendar";
import {
  emptyProfile,
  getUserProfile,
  saveUserProfile,
} from "@/lib/profileStorage";
import { tokens } from "@/lib/tokens";
import type {
  ConnectedService,
  ConnectedServices,
  UserProfile,
} from "@/lib/types";

// --- Motion ----------------------------------------------------------------

const PREMIUM_EASE = [0.22, 1, 0.36, 1] as const;

// Page-exit fade duration. Same value across every onboarding step.
const EXIT_MS = 320;

const containerVariants: Variants = {
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    y: 0,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: { duration: EXIT_MS / 1000, ease: PREMIUM_EASE },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: PREMIUM_EASE },
  },
};

// --- Service definitions ---------------------------------------------------

type ServiceStatus = "idle" | "connecting" | "connected" | "error";

type ServiceMeta = {
  key: ConnectedService;
  name: string;
  /** Short value-prop. Why connecting helps the plan adapt. */
  description: string;
  /** Real OAuth flow vs mock. */
  flow: "real" | "mock";
  /** Foreground brand-ish color for the icon tile. */
  iconBg: string;
  iconFg: string;
  Icon: () => React.JSX.Element;
};

const SERVICES: ServiceMeta[] = [
  {
    key: "google_calendar",
    name: "Google Calendar",
    description:
      "We'll plan around your meetings and trips, so workouts fit your real day.",
    flow: "real",
    iconBg: "bg-blue-500/10 dark:bg-blue-500/20",
    iconFg: "text-blue-600 dark:text-blue-300",
    Icon: GoogleCalendarIcon,
  },
  {
    key: "apple_health",
    name: "Apple Health",
    description:
      "Bring in workouts, heart rate, and sleep so the plan reacts to how you actually move.",
    flow: "mock",
    iconBg: "bg-rose-500/10 dark:bg-rose-500/20",
    iconFg: "text-rose-600 dark:text-rose-300",
    Icon: AppleHealthIcon,
  },
  {
    key: "garmin",
    name: "Garmin",
    description:
      "Sync runs, heart-rate variability, and recovery metrics straight from your watch.",
    flow: "mock",
    iconBg: "bg-sky-500/10 dark:bg-sky-500/20",
    iconFg: "text-sky-700 dark:text-sky-300",
    Icon: GarminIcon,
  },
  {
    key: "oura",
    name: "Oura",
    description:
      "Sleep and readiness scores feed into how hard each day's workout should be.",
    flow: "mock",
    iconBg: "bg-neutral-900/10 dark:bg-neutral-100/10",
    iconFg: "text-neutral-800 dark:text-neutral-200",
    Icon: OuraIcon,
  },
];

const EMPTY_SERVICES: ConnectedServices = {
  google_calendar: { connected: false },
  apple_health: { connected: false },
  garmin: { connected: false },
  oura: { connected: false },
};

// --- Page ------------------------------------------------------------------

/**
 * Onboarding step 3 — connect data sources.
 *
 * Google Calendar runs a real OAuth popup via Firebase (calendar.readonly
 * scope on top of GoogleAuthProvider). Wearable integrations are shown
 * honestly as future/setup-later options; Apple Health CSV import lives
 * on Profile where a file picker fits the flow.
 */
export default function OnboardingIntegrationsPage() {
  const router = useRouter();
  const [services, setServices] = useState<ConnectedServices>(EMPTY_SERVICES);
  const [statuses, setStatuses] = useState<
    Record<ConnectedService, ServiceStatus>
  >({
    google_calendar: "idle",
    apple_health: "idle",
    garmin: "idle",
    oura: "idle",
  });
  const [errors, setErrors] = useState<Partial<Record<ConnectedService, string>>>(
    {}
  );
  const [gcalEmail, setGcalEmail] = useState<string | undefined>();
  const [continuing, setContinuing] = useState(false);

  // Hydrate from any prior session: profile flags + the live Google
  // Calendar token (which can outlive the profile flag).
  useEffect(() => {
    const profile = getUserProfile();
    const stored = profile?.connected_services ?? EMPTY_SERVICES;
    const gcal = getGoogleCalendarConnection();
    const next: ConnectedServices = {
      google_calendar: { connected: !!gcal, last_synced_at: stored.google_calendar?.last_synced_at },
      apple_health: stored.apple_health ?? { connected: false },
      garmin: stored.garmin ?? { connected: false },
      oura: stored.oura ?? { connected: false },
    };
    setServices(next);
    setGcalEmail(gcal?.email);
    setStatuses((s) => ({
      ...s,
      google_calendar: gcal ? "connected" : s.google_calendar,
      apple_health: next.apple_health.connected ? "connected" : s.apple_health,
      garmin: next.garmin.connected ? "connected" : s.garmin,
      oura: next.oura.connected ? "connected" : s.oura,
    }));
  }, []);

  const anyConnected = useMemo(
    () => Object.values(services).some((s) => s.connected),
    [services]
  );

  const persistServices = (next: ConnectedServices) => {
    // Update *only* connected_services on the profile; everything else
    // (identity, PRs, training days) was already saved by earlier
    // steps and must not be clobbered here.
    const base = getUserProfile() ?? emptyProfile();
    const profile: UserProfile = { ...base, connected_services: next };
    saveUserProfile(profile);
  };

  const handleConnect = async (svc: ServiceMeta) => {
    setErrors((prev) => ({ ...prev, [svc.key]: undefined }));
    setStatuses((prev) => ({ ...prev, [svc.key]: "connecting" }));

    try {
      if (svc.flow === "real" && svc.key === "google_calendar") {
        const conn = await connectGoogleCalendar();
        setGcalEmail(conn.email);
      } else {
        throw new Error(
          svc.key === "apple_health"
            ? "Import Apple Health CSV from Profile after setup."
            : "Coming soon — not connected yet.",
        );
      }
      const next: ConnectedServices = {
        ...services,
        [svc.key]: {
          connected: true,
          last_synced_at: new Date().toISOString(),
        },
      };
      setServices(next);
      persistServices(next);
      setStatuses((prev) => ({ ...prev, [svc.key]: "connected" }));
    } catch (err) {
      const message =
        err instanceof FirebaseError
          ? friendlyFirebaseError(err)
          : err instanceof Error
            ? err.message
            : "Connection failed.";
      setErrors((prev) => ({ ...prev, [svc.key]: message }));
      setStatuses((prev) => ({ ...prev, [svc.key]: "error" }));
    }
  };

  const handleDisconnect = (svc: ServiceMeta) => {
    if (svc.key === "google_calendar") {
      disconnectGoogleCalendar();
      setGcalEmail(undefined);
    }
    const next: ConnectedServices = {
      ...services,
      [svc.key]: { connected: false },
    };
    setServices(next);
    persistServices(next);
    setStatuses((prev) => ({ ...prev, [svc.key]: "idle" }));
    setErrors((prev) => ({ ...prev, [svc.key]: undefined }));
  };

  const handleContinue = () => {
    if (continuing) return;
    setContinuing(true);
    // Page-exit fade, then route. Matches the other steps so the
    // hand-off into the preview screen reads as one continuous flow.
    window.setTimeout(
      () => router.push("/onboarding/preview"),
      EXIT_MS - 40
    );
  };

  return (
    <main className="relative flex min-h-[calc(100vh-3rem)] items-center justify-center overflow-hidden py-16 sm:py-24">
      {/* Global animated wash lives in app/layout.tsx. */}

      <motion.div
        initial="hidden"
        animate={continuing ? "exit" : "show"}
        variants={containerVariants}
        className="w-full max-w-3xl"
      >
        {/* Step indicator. */}
        <motion.div variants={itemVariants}>
          <OnboardingProgress current={3} />
        </motion.div>

        {/* Header */}
        <motion.div variants={itemVariants} className="mt-10 text-center">
          <h1 className="text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-neutral-900 dark:text-neutral-100 sm:text-5xl">
            Connect your data sources.
          </h1>
          <p className="mt-4 text-base text-neutral-600 dark:text-neutral-400">
            Optional, but the more we know, the more your plan adapts.
            You can change these any time from your profile.
          </p>
        </motion.div>

        {/* Service grid */}
        <motion.div
          variants={itemVariants}
          className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          {SERVICES.map((svc) => (
            <ServiceCard
              key={svc.key}
              meta={svc}
              status={statuses[svc.key]}
              connected={services[svc.key]?.connected ?? false}
              email={svc.key === "google_calendar" ? gcalEmail : undefined}
              error={errors[svc.key]}
              onConnect={() => handleConnect(svc)}
              onDisconnect={() => handleDisconnect(svc)}
            />
          ))}
        </motion.div>

        {/* Submit */}
        <motion.div
          variants={itemVariants}
          className="mt-10 flex flex-col-reverse items-center justify-end gap-3 sm:flex-row"
        >
          <Link
            href="/onboarding/prs"
            className={`inline-flex min-h-11 min-w-11 items-center justify-center text-sm text-neutral-500 underline-offset-4 hover:text-neutral-800 hover:underline dark:text-neutral-400 dark:hover:text-neutral-200 ${tokens.motion}`}
          >
            Back
          </Link>
          <motion.button
            type="button"
            onClick={handleContinue}
            disabled={continuing}
            whileHover={{ y: -1 }}
            whileTap={{ y: 0, scale: 0.97 }}
            transition={{ duration: 0.18, ease: PREMIUM_EASE }}
            className={`inline-flex items-center justify-center rounded-full px-7 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${tokens.primary.solid}`}
          >
            {continuing
              ? "Building your plan…"
              : anyConnected
                ? "Continue"
                : "Skip for now"}
          </motion.button>
        </motion.div>
      </motion.div>
    </main>
  );
}

// --- ServiceCard -----------------------------------------------------------

function ServiceCard({
  meta,
  status,
  connected,
  email,
  error,
  onConnect,
  onDisconnect,
}: {
  meta: ServiceMeta;
  status: ServiceStatus;
  connected: boolean;
  email?: string;
  error?: string;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div
      className={[
        "relative overflow-hidden rounded-2xl border p-5 backdrop-blur-md transition",
        connected
          ? "border-blue-500/30 bg-gradient-to-br from-blue-500/5 via-white/80 to-white/80 dark:border-blue-400/30 dark:from-blue-500/10 dark:via-neutral-900/70 dark:to-neutral-900/70"
          : "border-black/10 bg-white/80 hover:border-black/20 hover:shadow-sm dark:border-white/10 dark:bg-neutral-900/70 dark:hover:border-white/20",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.iconBg} ${meta.iconFg}`}
        >
          <meta.Icon />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {meta.name}
            </h3>
            {meta.flow === "mock" && (
              <span className="rounded-full border border-black/10 bg-white/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-neutral-500 dark:border-white/10 dark:bg-neutral-900/60 dark:text-neutral-400">
                Coming soon
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
            {meta.description}
          </p>
        </div>
      </div>

      {/* Status row */}
      <div className="mt-4 flex items-center justify-between gap-3">
        {connected ? (
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
            <CheckIcon />
            <span className="truncate">
              {email ? `Connected as ${email}` : "Connected"}
            </span>
          </div>
        ) : error ? (
          <p className={`text-xs ${tokens.warning.text}`}>{error}</p>
        ) : (
          <span className="text-[11px] uppercase tracking-wider text-neutral-400">
            Not connected
          </span>
        )}

        {connected ? (
          <button
            type="button"
            onClick={onDisconnect}
            className={`shrink-0 text-xs font-medium text-neutral-500 underline-offset-4 hover:text-neutral-800 hover:underline dark:text-neutral-400 dark:hover:text-neutral-200 ${tokens.motion}`}
          >
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            onClick={onConnect}
            disabled={status === "connecting" || meta.flow === "mock"}
            className={`shrink-0 inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-4 py-1.5 text-xs font-medium text-neutral-800 hover:border-black/20 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-neutral-950/40 dark:text-neutral-100 dark:hover:border-white/20 dark:hover:bg-neutral-900 ${tokens.motion}`}
          >
            {status === "connecting" ? (
              <span className="inline-flex items-center gap-1.5">
                <Spinner /> Connecting…
              </span>
            ) : meta.flow === "mock" ? (
              "Set up later"
            ) : status === "error" ? (
              "Try again"
            ) : (
              "Connect"
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// --- Helpers ---------------------------------------------------------------

function friendlyFirebaseError(err: FirebaseError): string {
  if (err.code === "auth/popup-closed-by-user") return "Connection cancelled.";
  if (err.code === "auth/cancelled-popup-request") return "Connection cancelled.";
  if (err.code === "auth/account-exists-with-different-credential") {
    return "This email is signed in with a different method. Sign in with Google to connect.";
  }
  return err.message || "Connection failed.";
}

// --- Icons -----------------------------------------------------------------

function GoogleCalendarIcon() {
  // Simple calendar mark — a rounded square with grid lines and the day "31".
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3.5v3M16 3.5v3" />
      <path d="M9 14h2M13 14h2M9 17h2" />
    </svg>
  );
}

function AppleHealthIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 20.5s-7-4.6-7-10A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7 3.5c0 5.4-7 10-7 10z" />
    </svg>
  );
}

function GarminIcon() {
  // Stylized triangle, a nod to the Garmin mark.
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 4.5 21 19.5H3z" />
      <path d="M9 14.5h6" />
    </svg>
  );
}

function OuraIcon() {
  // Ring.
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      aria-hidden
    >
      <circle cx="12" cy="12" r="6.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      className="animate-spin"
      aria-hidden
    >
      <path d="M21 12a9 9 0 1 1-3-6.7" />
    </svg>
  );
}
