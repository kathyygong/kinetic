"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { motion, type HTMLMotionProps, type Variants } from "framer-motion";

import Avatar from "@/components/Avatar";
import AthleticImage from "@/components/AthleticImage";
import GlassCard from "@/components/GlassCard";
import HMSInput from "@/components/HMSInput";
import MemoryCenter from "@/components/MemoryCenter";
import PageContainer from "@/components/PageContainer";
import { auth, signOutUser, type User } from "@/lib/firebase";
import {
  fetchCalendarHealth,
  type CalendarHealthResponse,
} from "@/lib/api";
import { clearCalendarFailure, isCalendarUnhealthy } from "@/lib/dataFreshness";
import {
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  getGoogleCalendarConnection,
} from "@/lib/integrations/googleCalendar";
import {
  getUserProfile,
  planAffectingFieldsChanged,
  saveUserProfile,
} from "@/lib/profileStorage";
import { clearProductEvents } from "@/lib/instrumentation";
import { clearAllUserStorage } from "@/lib/persistence/firebasePersistence";
import { clearSavedPlan } from "@/lib/storage";
import { tokens } from "@/lib/tokens";
import type {
  ConnectedService,
  ConnectedServices,
  CurrentPRs,
  DayOfWeek,
  ExperienceLevel,
  UserProfile,
} from "@/lib/types";

// --- Static labels ---------------------------------------------------------

const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

const DAY_LABELS: Record<DayOfWeek, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};
const DAY_ORDER: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const PR_FIELDS: Array<{ key: keyof CurrentPRs; label: string }> = [
  { key: "5k", label: "5K" },
  { key: "10k", label: "10K" },
  { key: "half", label: "Half" },
  { key: "marathon", label: "Marathon" },
];

// Sensible per-distance hints for the empty state of each PR input.
// Match the values used by the full edit form so the experience is
// consistent regardless of where the user picks up.
const PR_PLACEHOLDERS_SEC: Record<keyof CurrentPRs, number> = {
  "5k": 25 * 60,
  "10k": 52 * 60,
  half: 1 * 3600 + 55 * 60,
  marathon: 4 * 3600,
};

const SERVICE_FIELDS: Array<{
  key: ConnectedService;
  label: string;
  /** "real" → live OAuth flow; "mock" → simulated connect (placeholder UI). */
  flow: "real" | "mock";
}> = [
  { key: "google_calendar", label: "Google Calendar", flow: "real" },
  { key: "apple_health", label: "Apple Health", flow: "mock" },
  { key: "garmin", label: "Garmin", flow: "mock" },
  { key: "oura", label: "Oura", flow: "mock" },
];

type ServiceStatus = "idle" | "connecting" | "connected" | "error";

// --- Motion ----------------------------------------------------------------

// Smooth out-quart easing curve — the Apple-style deceleration that makes
// elements settle into place rather than snap. Used across all entrances.
const PREMIUM_EASE = [0.22, 1, 0.36, 1] as const;

// Orchestrator variant: stays opacity:1 itself but staggers each motion
// descendant on a 70ms cadence. The 80ms delayChildren lets PageContainer's
// own fade-in (250ms) finish first, so the cards layer in cleanly on top.
const contentVariants: Variants = {
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.08,
    },
  },
};

// Per-item variant: gentle 12px upward drift + fade in.
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: PREMIUM_EASE },
  },
};

// --- Page ------------------------------------------------------------------

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [loaded, setLoaded] = useState(false);
  const router = useRouter();

  // Inline edit state for the Training stats and Personal bests cards.
  // Drafts hold the in-progress values so Cancel can throw them away
  // without affecting the displayed profile until the user hits Save.
  const [editingStats, setEditingStats] = useState(false);
  const [statsDraft, setStatsDraft] = useState<{
    weekly_mileage: number | undefined;
    preferred_training_days: DayOfWeek[];
  }>({ weekly_mileage: undefined, preferred_training_days: [] });

  const [editingPRs, setEditingPRs] = useState(false);
  // PR drafts are intentionally Partial — new users haven't logged
  // every distance yet, and the per-row clear button uses
  // `delete next[key]` to drop a value back to "unset". Mirrors the
  // `Partial<CurrentPRs>` shape on `profile.personal_bests`.
  const [prsDraft, setPrsDraft] = useState<Partial<CurrentPRs>>({});

  // Connected-services state lives outside `profile` so we can show
  // per-row connecting / error states without round-tripping through
  // localStorage. Updated on mount + after every connect/disconnect.
  const [serviceStatus, setServiceStatus] = useState<
    Record<ConnectedService, ServiceStatus>
  >({
    google_calendar: "idle",
    apple_health: "idle",
    garmin: "idle",
    oura: "idle",
  });
  const [serviceErrors, setServiceErrors] = useState<
    Partial<Record<ConnectedService, string>>
  >({});
  const [gcalEmail, setGcalEmail] = useState<string | undefined>();
  // Google Calendar can be "connected" (token present) but failing
  // to reach Google through the backend (token expired, scopes
  // revoked, etc.). When that's true we swap the "Last synced"
  // subtitle for a clear "Couldn't reach Google · Reconnect"
  // affordance so the runner can actually fix it instead of
  // trusting a misleading green pill.
  const [gcalUnhealthy, setGcalUnhealthy] = useState(false);
  // The *backend's* view of its own Google OAuth state. This is the
  // authoritative signal: a 503 on /availability/week could mean any
  // number of things, but `health.status` tells us whether the runner
  // clicking Reconnect would actually help (token thing on Realm A)
  // or whether the operator needs to fix the server (Realm B). We
  // keep the client-side `gcalUnhealthy` flag as a fallback for when
  // the health endpoint itself is unreachable.
  const [gcalHealth, setGcalHealth] = useState<CalendarHealthResponse | null>(
    null,
  );
  // True while we're re-probing /integrations/calendar/health from a
  // user-initiated "Check again" click. Drives the button's loading
  // affordance so the runner sees their click did something even when
  // the response is the same amber state.
  const [gcalHealthChecking, setGcalHealthChecking] = useState(false);
  const [deletingData, setDeletingData] = useState(false);

  useEffect(() => {
    const stored = getUserProfile();
    setProfile(stored);
    setLoaded(true);

    // Hydrate connected-service status. The Google Calendar OAuth token
    // is stored separately from the profile flag, and either can outlive
    // the other (e.g. user signs out then back in) — so we trust the
    // token's existence as the source of truth for "connected" here.
    const gcal = getGoogleCalendarConnection();
    setGcalEmail(gcal?.email);
    // Independent of the token's existence: the *backend's* calendar
    // integration may have failed recently. The dashboard stamps a
    // failure in localStorage whenever `/availability/week` or
    // `/travel` doesn't come back 2xx; we read that here so the
    // Profile row can show the runner where to act.
    setGcalUnhealthy(isCalendarUnhealthy());
    setServiceStatus({
      google_calendar:
        gcal || stored?.connected_services?.google_calendar?.connected
          ? "connected"
          : "idle",
      apple_health: stored?.connected_services?.apple_health?.connected
        ? "connected"
        : "idle",
      garmin: stored?.connected_services?.garmin?.connected ? "connected" : "idle",
      oura: stored?.connected_services?.oura?.connected ? "connected" : "idle",
    });
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setAuthUser);
    return () => unsub();
  }, []);

  // Keep the "calendar offline" pill honest as the user moves between
  // tabs. The dashboard is what stamps the failure (via its
  // `/availability/week` fetch), so the most common path is:
  // user-opens-dashboard → 503 → comes-back-to-profile. We re-check
  // on focus, visibility change, and on cross-tab storage writes so
  // the affordance shows up without a full reload.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const recheck = () => setGcalUnhealthy(isCalendarUnhealthy());
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === "kinetic_calendar_last_failure" ||
        e.key === "kinetic_calendar_last_sync"
      ) {
        recheck();
      }
    };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Ask the backend for the authoritative health of its own Google
  // Calendar OAuth. The dashboard's 503-based heuristic answers "did
  // the last calendar fetch fail", but only the server knows *why* —
  // which determines whether "Reconnect" in the UI would actually
  // help (frontend OAuth) or whether the operator needs to step in
  // (server-side token/credentials). We probe on mount and again on
  // focus so a fix-on-the-server self-heals without a reload.
  useEffect(() => {
    if (!authUser) return;
    let cancelled = false;
    const probe = async () => {
      try {
        const h = await fetchCalendarHealth();
        if (!cancelled) setGcalHealth(h);
      } catch {
        // The endpoint itself was unreachable (server down, network
        // blip). Fall back to the client-side heuristic by leaving
        // gcalHealth null; the UI uses gcalUnhealthy in that case.
        if (!cancelled) setGcalHealth(null);
      }
    };
    probe();
    const onFocus = () => probe();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [authUser]);

  const handleSignOut = async () => {
    await signOutUser();
    router.replace("/login");
  };

  const handleDeleteTrainingData = async () => {
    const confirmed = window.confirm(
      "Delete your Kinetic profile, plan, readiness, workout history, and training memory? This cannot be undone.",
    );
    if (!confirmed) return;

    setDeletingData(true);
    try {
      await clearAllUserStorage(authUser?.uid);
      clearProductEvents();
      setProfile(null);
      router.replace("/onboarding");
    } finally {
      setDeletingData(false);
    }
  };

  // --- Inline edit handlers ----------------------------------------------

  // Persist a profile patch and, if any plan-affecting field changed,
  // invalidate the cached plan so the dashboard regenerates against
  // the new values on next load. Returns the merged profile.
  const persistProfilePatch = (patch: Partial<UserProfile>): UserProfile | null => {
    if (!profile) return null;
    const next: UserProfile = { ...profile, ...patch };
    saveUserProfile(next);
    if (planAffectingFieldsChanged(profile, next)) {
      clearSavedPlan();
    }
    setProfile(next);
    return next;
  };

  const startEditStats = () => {
    if (!profile) return;
    setStatsDraft({
      weekly_mileage: profile.weekly_mileage,
      preferred_training_days: [...profile.preferred_training_days],
    });
    setEditingStats(true);
  };
  const cancelEditStats = () => setEditingStats(false);
  const saveStats = () => {
    persistProfilePatch({
      weekly_mileage: statsDraft.weekly_mileage,
      preferred_training_days: statsDraft.preferred_training_days,
    });
    setEditingStats(false);
  };
  const toggleDraftDay = (d: DayOfWeek) =>
    setStatsDraft((s) => {
      const set = new Set(s.preferred_training_days);
      if (set.has(d)) set.delete(d);
      else set.add(d);
      // Keep canonical order so storage stays stable.
      const ordered = DAY_ORDER.filter((x) => set.has(x));
      return { ...s, preferred_training_days: ordered };
    });

  const startEditPRs = () => {
    if (!profile) return;
    setPrsDraft({ ...profile.personal_bests });
    setEditingPRs(true);
  };
  const cancelEditPRs = () => setEditingPRs(false);
  const savePRs = () => {
    persistProfilePatch({ personal_bests: prsDraft });
    setEditingPRs(false);
  };
  const updateDraftPR = (key: keyof CurrentPRs, sec: number | undefined) =>
    setPrsDraft((p) => {
      const next = { ...p };
      if (typeof sec === "number" && sec > 0) next[key] = sec;
      else delete next[key];
      return next;
    });

  // --- Connected-services handlers ----------------------------------------

  // Persist a single service's new connection state without touching the
  // others. We re-read the profile each time so we don't accidentally
  // clobber edits made elsewhere on the page.
  const persistService = (
    key: ConnectedService,
    connection: { connected: boolean; last_synced_at?: string },
  ) => {
    const current = getUserProfile() ?? profile;
    if (!current) return;
    const baseServices: ConnectedServices = current.connected_services ?? {
      google_calendar: { connected: false },
      apple_health: { connected: false },
      garmin: { connected: false },
      oura: { connected: false },
    };
    const next: UserProfile = {
      ...current,
      connected_services: {
        ...baseServices,
        [key]: connection,
      },
    };
    saveUserProfile(next);
    setProfile(next);
  };

  const handleConnect = async (key: ConnectedService, flow: "real" | "mock") => {
    setServiceErrors((prev) => ({ ...prev, [key]: undefined }));
    setServiceStatus((prev) => ({ ...prev, [key]: "connecting" }));
    try {
      if (flow === "real" && key === "google_calendar") {
        const conn = await connectGoogleCalendar();
        setGcalEmail(conn.email);
      } else {
        // Mock flow — short delay so the loading affordance feels real.
        await new Promise((r) => setTimeout(r, 700));
      }
      persistService(key, {
        connected: true,
        last_synced_at: new Date().toISOString(),
      });
      setServiceStatus((prev) => ({ ...prev, [key]: "connected" }));
      // Optimistically clear the "calendar offline" pill. The next
      // dashboard load will call `recordCalendarSync` (or stamp a
      // fresh failure) and become the real source of truth — we
      // just don't want the pill lingering after the user did the
      // thing it asked them to do.
      //
      // We also clear the localStorage failure stamp itself (not just
      // in-memory state) so the storage-event listener and any other
      // tab can't re-derive `unhealthy=true` from a stale flag.
      if (key === "google_calendar") {
        setGcalUnhealthy(false);
        clearCalendarFailure();
        // Re-probe the backend health: the frontend OAuth doesn't
        // touch the server's token, so the server view is still
        // independently true and we shouldn't lie about it. If the
        // probe still says non-ok, the row stays amber with the
        // server's own message — better than a misleading flash of
        // green.
        fetchCalendarHealth()
          .then((h) => setGcalHealth(h))
          .catch(() => {
            /* fall back to heuristic */
          });
      }
    } catch (err) {
      const message =
        err instanceof FirebaseError
          ? friendlyFirebaseError(err)
          : err instanceof Error
            ? err.message
            : "Connection failed.";
      setServiceErrors((prev) => ({ ...prev, [key]: message }));
      setServiceStatus((prev) => ({ ...prev, [key]: "error" }));
    }
  };

  const handleDisconnect = (key: ConnectedService) => {
    if (key === "google_calendar") {
      disconnectGoogleCalendar();
      setGcalEmail(undefined);
    }
    persistService(key, { connected: false });
    setServiceStatus((prev) => ({ ...prev, [key]: "idle" }));
    setServiceErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  // Re-probe the backend's calendar health on demand. We use this for
  // the "Check again" button on the not-user-actionable amber state:
  // the runner can't fix the underlying problem (it's on the server),
  // but they CAN find out whether the operator fixed it. Without this
  // affordance the row is a dead end — they see a problem with no way
  // to verify recovery short of reloading the whole page.
  const handleRetryGcalHealth = async () => {
    setGcalHealthChecking(true);
    try {
      const h = await fetchCalendarHealth();
      setGcalHealth(h);
      // If the backend is now healthy, also drop the client-side
      // failure stamp so the heuristic fallback agrees.
      if (h.status === "ok") {
        clearCalendarFailure();
        setGcalUnhealthy(false);
      }
    } catch {
      // Probe itself failed — leave gcalHealth as-is so the row falls
      // back to the heuristic. Surfacing this as a hard error would be
      // noise; the row stays amber and the runner can try again.
    } finally {
      setGcalHealthChecking(false);
    }
  };

  // Prefer the saved profile values; fall back to Firebase auth so the
  // header always shows *something* useful even before profile data exists.
  // Email is the exception: the live auth email wins so a stale cached
  // value (e.g. from an old demo profile) can never shadow the real one.
  const fullName =
    profile?.full_name?.trim() ||
    authUser?.displayName?.trim() ||
    authUser?.email?.split("@")[0] ||
    "Athlete";
  const email = authUser?.email || profile?.email || "";
  const photo = profile?.profile_photo || authUser?.photoURL || undefined;

  return (
    <PageContainer className="relative mx-auto w-full max-w-3xl px-2 py-12 sm:py-16">
      {/* Global animated wash lives in app/layout.tsx. */}

      <motion.div
        initial="hidden"
        animate="show"
        variants={contentVariants}
      >
        <motion.div variants={itemVariants} className="mb-10">
          <AthleticImage
            src="/images/athletic/runner-track.jpg"
            alt="Aerial view of runners striding across a track"
            eyebrow="Athlete profile"
            title="Profile"
            headingLevel="h1"
            subtitle="Your athlete identity and connected data sources."
            className="h-52 sm:h-60"
            priority
          />
        </motion.div>

        <div className="space-y-6">
          {/* 1 — Identity header */}
          <GlassCard
            interactive={false}
            motionProps={{ variants: itemVariants }}
            className="relative overflow-hidden p-8 sm:p-10"
          >
            {/* Subtle blue highlight in the top-right corner */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-gradient-to-br from-blue-400/20 via-sky-400/10 to-transparent blur-2xl"
            />

            {/* Edit action — anchored to top-right of card */}
            <Link
              href="/profile/edit"
              className={`absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-xs font-medium text-neutral-700 backdrop-blur hover:border-black/20 hover:bg-white dark:border-white/15 dark:bg-neutral-900/60 dark:text-neutral-200 dark:hover:bg-neutral-900 ${tokens.motion}`}
              aria-label="Edit profile"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
                className="h-3.5 w-3.5"
              >
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.379-8.379-2.828-2.828z" />
              </svg>
              Edit
            </Link>

            <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:items-center sm:gap-8 sm:text-left">
              <Avatar name={fullName} photo={photo} size={96} />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
                  {fullName}
                </h2>
                {email && (
                  <p className="mt-1 truncate text-sm text-neutral-500 dark:text-neutral-400">
                    {email}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${tokens.primary.softActive}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${tokens.primary.dot}`} />
                    {profile
                      ? EXPERIENCE_LABELS[profile.experience_level]
                      : "Experience not set"}
                  </span>
                </div>
              </div>
            </div>
          </GlassCard>

          {/* 2 — Training stats */}
          <SectionCard
            title="Training stats"
            description="Volume and the days you like to run."
            motionProps={{ variants: itemVariants }}
            headerAction={
              profile && !editingStats ? (
                <EditPillButton onClick={startEditStats} label="Edit training stats" />
              ) : null
            }
          >
            {editingStats ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
                  <div>
                    <StatLabel>Weekly mileage</StatLabel>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        aria-label="Weekly mileage"
                        value={
                          statsDraft.weekly_mileage === undefined
                            ? ""
                            : String(statsDraft.weekly_mileage)
                        }
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "") {
                            setStatsDraft((s) => ({
                              ...s,
                              weekly_mileage: undefined,
                            }));
                            return;
                          }
                          const n = Number(raw);
                          if (Number.isFinite(n) && n >= 0) {
                            setStatsDraft((s) => ({ ...s, weekly_mileage: n }));
                          }
                        }}
                        className="w-24 rounded-lg border border-black/10 bg-white px-3 py-2 text-2xl font-semibold tabular-nums tracking-tight text-neutral-900 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-300/40 dark:border-white/15 dark:bg-neutral-900 dark:text-neutral-100"
                      />
                      <span className="text-sm text-neutral-500">mi</span>
                    </div>
                  </div>
                  <div>
                    <StatLabel>Preferred training days</StatLabel>
                    <DaysToggleRow
                      days={statsDraft.preferred_training_days}
                      onToggle={toggleDraftDay}
                    />
                  </div>
                </div>
                <EditFooter onCancel={cancelEditStats} onSave={saveStats} />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
                <Stat
                  label="Weekly mileage"
                  value={
                    profile?.weekly_mileage !== undefined
                      ? `${profile.weekly_mileage}`
                      : "—"
                  }
                  suffix={profile?.weekly_mileage !== undefined ? "mi" : undefined}
                />
                <div>
                  <StatLabel>Preferred training days</StatLabel>
                  <DaysRow days={profile?.preferred_training_days ?? []} />
                </div>
              </div>
            )}
          </SectionCard>

          {/* 3 — Personal bests */}
          <SectionCard
            title="Personal bests"
            description="Your fastest times — used to calibrate paces and project race times."
            motionProps={{ variants: itemVariants }}
            headerAction={
              profile && !editingPRs ? (
                <EditPillButton onClick={startEditPRs} label="Edit personal bests" />
              ) : null
            }
          >
            {editingPRs ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
                  {PR_FIELDS.map(({ key, label }) => (
                    <div key={key}>
                      <StatLabel>{label}</StatLabel>
                      <HMSInput
                        id={`pr_${key}`}
                        valueSec={prsDraft[key]}
                        placeholderSec={PR_PLACEHOLDERS_SEC[key]}
                        onChange={(s) => updateDraftPR(key, s)}
                      />
                    </div>
                  ))}
                </div>
                <EditFooter onCancel={cancelEditPRs} onSave={savePRs} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
                {PR_FIELDS.map(({ key, label }) => (
                  <Stat
                    key={key}
                    label={label}
                    value={formatPR(profile?.personal_bests?.[key])}
                  />
                ))}
              </div>
            )}
          </SectionCard>

          {/* 4 — Kinetic is learning. Reads recommendation history out of
              localStorage and surfaces conservative behavioral patterns the
              backend's /behavior-insights endpoint returned. Sits between
              the static profile facts above and the integrations below so
              the page flows: things you told us → things we noticed →
              external sources we can read from. */}
          <MemoryCenter motionProps={{ variants: itemVariants }} />

          {/* 5 — Connected services */}
          <SectionCard
            title="Connected services"
            description="External data sources Kinetic can read from."
            motionProps={{ variants: itemVariants }}
          >
            <ul className="divide-y divide-black/5 dark:divide-white/10">
              {SERVICE_FIELDS.map(({ key, label, flow }) => {
                const conn = profile?.connected_services?.[key];
                const status = serviceStatus[key];
                const connected = status === "connected" || !!conn?.connected;
                // Google Calendar "connected but failing" is its own
                // visual state. The backend's health endpoint is the
                // authoritative source — when it answered, we use its
                // `message` and `user_actionable` flag directly. When
                // it didn't (network blip, server down), we fall back
                // to the dashboard's 503-derived heuristic.
                const isGcalDegraded =
                  key === "google_calendar" &&
                  connected &&
                  (gcalHealth ? gcalHealth.status !== "ok" : gcalUnhealthy);
                // Default to NOT user-actionable when we don't have
                // a fresh health response. The frontend OAuth flow
                // (Realm A) can only re-grant access on this device —
                // it cannot fix the backend's stored Google token
                // (Realm B). So unless the backend explicitly tells
                // us "this is something the runner can fix from
                // here," we shouldn't offer a Reconnect button that
                // can't actually help. Showing the informational
                // "Needs attention" state is more honest.
                const gcalUserActionable = gcalHealth?.user_actionable ?? false;
                // We surface "Reconnect" only when the runner can
                // actually do something about it. Otherwise we show
                // a calm informational state with the server's own
                // message so they don't keep retrying a button that
                // won't help.
                const needsReconnect = isGcalDegraded && gcalUserActionable;
                const needsAttentionInfo = isGcalDegraded && !gcalUserActionable;
                const subtitle = isGcalDegraded
                  ? gcalHealth?.message ??
                    "Couldn't reach Google · Reconnect to sync your schedule"
                  : key === "google_calendar" && connected && gcalEmail
                    ? gcalEmail
                    : connected && conn?.last_synced_at
                      ? `Last synced ${formatDate(conn.last_synced_at)}`
                      : flow === "mock"
                        ? "Coming soon"
                        : null;
                return (
                  <li
                    key={key}
                    className="flex flex-col items-stretch gap-3 py-4 first:pt-0 last:pb-0 min-[360px]:flex-row min-[360px]:items-center min-[360px]:justify-between min-[360px]:gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <ServiceIcon service={key} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                          {label}
                        </p>
                        {subtitle && (
                          <p
                            className={`mt-0.5 text-xs ${
                              isGcalDegraded
                                ? tokens.warning.text
                                : "truncate text-neutral-500"
                            }`}
                          >
                            {subtitle}
                          </p>
                        )}
                        {serviceErrors[key] && (
                          <p className="mt-0.5 text-xs text-rose-600 dark:text-rose-400">
                            {serviceErrors[key]}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="self-start min-[360px]:self-auto">
                      <ConnectControl
                        status={status}
                        connected={connected}
                        flow={flow}
                        needsReconnect={needsReconnect}
                        needsAttentionInfo={needsAttentionInfo}
                        retrying={
                          key === "google_calendar" && gcalHealthChecking
                        }
                        onConnect={() => handleConnect(key, flow)}
                        onDisconnect={() => handleDisconnect(key)}
                        onRetry={
                          key === "google_calendar"
                            ? handleRetryGcalHealth
                            : undefined
                        }
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </SectionCard>

          <SectionCard
            title="Data controls"
            description="Your training history stays yours. Delete the local copy and, when signed in, its Firebase mirror."
            motionProps={{ variants: itemVariants }}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-xl text-sm text-neutral-600 dark:text-neutral-400">
                Connected-service authorization is managed separately above.
                Deleting Kinetic data does not delete data at those providers.
              </p>
              <button
                type="button"
                onClick={handleDeleteTrainingData}
                disabled={deletingData}
                className={`min-h-11 shrink-0 rounded-full border border-rose-300/70 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-wait disabled:opacity-60 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300 dark:hover:bg-rose-400/15 ${tokens.motion}`}
              >
                {deletingData ? "Deleting…" : "Delete training data"}
              </button>
            </div>
          </SectionCard>

          {/* Empty-state hint, only when nothing has been saved yet */}
          {loaded && !profile && (
            <motion.p
              variants={itemVariants}
              className="text-center text-xs text-neutral-500 dark:text-neutral-400"
            >
              No profile saved yet. Tap{" "}
              <Link
                href="/profile/edit"
                className={`underline-offset-2 hover:underline ${tokens.primary.text}`}
              >
                Edit profile
              </Link>{" "}
              to fill in your athlete details.
            </motion.p>
          )}

          {/* Footer — quiet sign-out affordance */}
          <motion.div
            variants={itemVariants}
            className="flex justify-center pt-4"
          >
            <button
              type="button"
              onClick={handleSignOut}
              className={`text-xs font-medium text-neutral-500 underline-offset-4 hover:text-neutral-800 hover:underline dark:text-neutral-400 dark:hover:text-neutral-200 ${tokens.motion}`}
            >
              Sign out
            </button>
          </motion.div>
        </div>
      </motion.div>
    </PageContainer>
  );
}

// --- Subcomponents ---------------------------------------------------------

function SectionCard({
  title,
  description,
  headerAction,
  children,
  motionProps,
}: {
  title: string;
  description: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  motionProps?: HTMLMotionProps<"div">;
}) {
  return (
    <GlassCard motionProps={motionProps} className="p-6 sm:p-8">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            {title}
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {description}
          </p>
        </div>
        {headerAction && <div className="shrink-0">{headerAction}</div>}
      </header>
      {children}
    </GlassCard>
  );
}

function StatLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
      {children}
    </p>
  );
}

function Stat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div>
      <StatLabel>{label}</StatLabel>
      <p className="text-2xl font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-neutral-100">
        {value}
        {suffix && (
          <span className="ml-1 text-sm font-normal text-neutral-500">
            {suffix}
          </span>
        )}
      </p>
    </div>
  );
}

function DaysRow({ days }: { days: DayOfWeek[] }) {
  const set = new Set(days);
  return (
    <div className="flex flex-wrap gap-1.5">
      {DAY_ORDER.map((d) => {
        const active = set.has(d);
        return (
          <span
            key={d}
            className={[
              "inline-flex h-9 min-w-9 items-center justify-center rounded-full border px-3 text-xs font-medium",
              active
                ? tokens.primary.softActive
                : "border-black/10 bg-white/50 text-neutral-400 dark:border-white/10 dark:bg-neutral-900/30 dark:text-neutral-500",
            ].join(" ")}
          >
            {DAY_LABELS[d]}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Interactive variant of {@link DaysRow}: each chip is a button that
 * toggles its day in the parent's draft state. Used when the Training
 * stats card is in inline-edit mode.
 */
function DaysToggleRow({
  days,
  onToggle,
}: {
  days: DayOfWeek[];
  onToggle: (d: DayOfWeek) => void;
}) {
  const set = new Set(days);
  return (
    <div className="flex flex-wrap gap-1.5">
      {DAY_ORDER.map((d) => {
        const active = set.has(d);
        return (
          <button
            key={d}
            type="button"
            onClick={() => onToggle(d)}
            aria-pressed={active}
            className={[
              "inline-flex h-9 min-w-9 cursor-pointer items-center justify-center rounded-full border px-3 text-xs font-medium",
              tokens.motion,
              active
                ? tokens.primary.softActive
                : "border-black/10 bg-white/50 text-neutral-500 hover:border-black/20 hover:bg-white dark:border-white/10 dark:bg-neutral-900/30 dark:text-neutral-400 dark:hover:border-white/20 dark:hover:bg-neutral-900",
            ].join(" ")}
          >
            {DAY_LABELS[d]}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Compact pill-shaped Edit button used in the header of an editable
 * card. Mirrors the visual treatment of the identity card's Edit link
 * so the affordance reads consistently across the page.
 */
function EditPillButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-xs font-medium text-neutral-700 backdrop-blur hover:border-black/20 hover:bg-white dark:border-white/15 dark:bg-neutral-900/60 dark:text-neutral-200 dark:hover:bg-neutral-900 ${tokens.motion}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
        className="h-3.5 w-3.5"
      >
        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.379-8.379-2.828-2.828z" />
      </svg>
      Edit
    </button>
  );
}

/**
 * Right-aligned Cancel + Save row shown beneath inline-editable card
 * content. Save is a primary-tinted button to match the rest of the
 * app; Cancel is a quiet text button.
 */
function EditFooter({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-3 border-t border-black/5 pt-4 dark:border-white/10">
      <button
        type="button"
        onClick={onCancel}
        className={`rounded-full px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 ${tokens.motion}`}
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        className={`inline-flex items-center justify-center rounded-full border border-transparent bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300/60 dark:bg-blue-500 dark:hover:bg-blue-400 ${tokens.motion}`}
      >
        Save
      </button>
    </div>
  );
}

function ConnectControl({
  status,
  connected,
  flow,
  needsReconnect = false,
  needsAttentionInfo = false,
  retrying = false,
  onConnect,
  onDisconnect,
  onRetry,
}: {
  status: ServiceStatus;
  connected: boolean;
  flow: "real" | "mock";
  /**
   * `connected === true` but the integration is currently failing in
   * a way the runner can fix from the UI (e.g. they need to grant
   * Google access again from their own account). We show an amber
   * "Calendar offline" pill plus a primary Reconnect button.
   */
  needsReconnect?: boolean;
  /**
   * `connected === true` but the failure is server-side and the
   * runner can't fix it from here (operator needs to re-authorize
   * the backend, or `credentials.json` is missing). We still need
   * to give them SOMETHING to click — a dead row is worse than a
   * placebo. So we show a "Check again" button that re-probes the
   * health endpoint; if the operator fixed it the row flips green.
   */
  needsAttentionInfo?: boolean;
  /** True while a Check-again probe is in flight. */
  retrying?: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  /**
   * Called when the runner clicks "Check again" on the
   * `needsAttentionInfo` variant. Optional because the other
   * services (Apple Health, Garmin, Oura) don't have a backend
   * health probe yet.
   */
  onRetry?: () => void;
}) {
  const connecting = status === "connecting";

  if (connected && needsReconnect) {
    // Amber "needs attention" state. The Reconnect button is the
    // primary action; Disconnect stays available as a quiet text link
    // for runners who want to fully unlink instead.
    return (
      <div className="flex shrink-0 items-center gap-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${tokens.warning.soft}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${tokens.warning.dot}`} />
          Calendar offline
        </span>
        <button
          type="button"
          onClick={onConnect}
          disabled={connecting}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-70 ${tokens.warning.solid} ${tokens.motion}`}
        >
          {connecting ? "Reconnecting…" : "Reconnect"}
        </button>
        <button
          type="button"
          onClick={onDisconnect}
          className={`text-xs font-medium text-neutral-500 underline-offset-4 hover:text-neutral-800 hover:underline dark:text-neutral-400 dark:hover:text-neutral-200 ${tokens.motion}`}
        >
          Disconnect
        </button>
      </div>
    );
  }

  if (connected && needsAttentionInfo) {
    // Server-side failure: same amber pill so the runner knows
    // something's off, but a "Check again" button instead of
    // "Reconnect" — because their browser-side OAuth can't fix a
    // backend-side problem. The retry just re-probes the health
    // endpoint so they can verify recovery the moment the operator
    // fixes it. Disconnect stays available as a quiet escape hatch.
    return (
      <div className="flex shrink-0 items-center gap-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${tokens.warning.soft}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${tokens.warning.dot}`} />
          Needs attention
        </span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm hover:border-black/20 hover:bg-white disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/15 dark:bg-neutral-900/60 dark:text-neutral-200 dark:hover:bg-neutral-900 ${tokens.motion}`}
          >
            {retrying ? "Checking…" : "Check again"}
          </button>
        )}
        <button
          type="button"
          onClick={onDisconnect}
          className={`text-xs font-medium text-neutral-500 underline-offset-4 hover:text-neutral-800 hover:underline dark:text-neutral-400 dark:hover:text-neutral-200 ${tokens.motion}`}
        >
          Disconnect
        </button>
      </div>
    );
  }

  if (connected) {
    // Compact "Connected" indicator + Disconnect text-button. Keeping the
    // disconnect action quiet (text-only) so it doesn't compete with the
    // primary surface but is still easily reachable.
    return (
      <div className="flex shrink-0 items-center gap-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${tokens.success.soft}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${tokens.success.dot}`} />
          Connected
        </span>
        <button
          type="button"
          onClick={onDisconnect}
          className={`text-xs font-medium text-neutral-500 underline-offset-4 hover:text-neutral-800 hover:underline dark:text-neutral-400 dark:hover:text-neutral-200 ${tokens.motion}`}
        >
          Disconnect
        </button>
      </div>
    );
  }

  // Not connected — show a Connect button. Mock-flow services are
  // disabled with a quiet badge so the user knows the integration is
  // still scaffolded.
  if (flow === "mock") {
    return (
      <button
        type="button"
        onClick={onConnect}
        disabled={connecting}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-black/10 bg-white/60 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:border-black/20 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-neutral-900/60 dark:text-neutral-300 dark:hover:bg-neutral-900 ${tokens.motion}`}
      >
        {connecting ? "Connecting…" : "Connect"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onConnect}
      disabled={connecting}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-70 ${tokens.primary.solid} ${tokens.motion}`}
    >
      {connecting ? "Connecting…" : "Connect"}
    </button>
  );
}

function friendlyFirebaseError(err: FirebaseError): string {
  if (err.code === "auth/popup-closed-by-user") return "Connection cancelled.";
  if (err.code === "auth/cancelled-popup-request") return "Connection cancelled.";
  if (err.code === "auth/popup-blocked") {
    return "Popup blocked — allow popups for this site and try again.";
  }
  if (err.code === "auth/account-exists-with-different-credential") {
    return "This email is signed in with a different method. Sign in with Google to connect.";
  }
  return err.message || "Connection failed.";
}

function ServiceIcon({ service }: { service: ConnectedService }) {
  // Simple, consistent monogram tiles keep the page coherent without
  // pulling in a brand-icon dependency. Each service gets a distinct
  // tinted tile and a 1–2 character mark, chosen to read at a glance.
  const PALETTE: Record<
    ConnectedService,
    { bg: string; text: string; mono: string }
  > = {
    google_calendar: {
      bg: "bg-blue-50 dark:bg-blue-950/40",
      text: "text-blue-700 dark:text-blue-300",
      mono: "GC",
    },
    apple_health: {
      bg: "bg-rose-50 dark:bg-rose-950/40",
      text: "text-rose-600 dark:text-rose-300",
      // Heart glyph reads instantly as "health".
      mono: "♥",
    },
    garmin: {
      bg: "bg-emerald-50 dark:bg-emerald-950/40",
      text: "text-emerald-700 dark:text-emerald-300",
      mono: "Gr",
    },
    oura: {
      bg: "bg-neutral-100 dark:bg-neutral-800/50",
      text: "text-neutral-700 dark:text-neutral-200",
      mono: "O",
    },
  };
  const p = PALETTE[service];
  return (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black/5 ${p.bg} ${p.text} text-sm font-semibold dark:border-white/10`}
      aria-hidden
    >
      {p.mono}
    </div>
  );
}

// --- Formatting helpers ----------------------------------------------------

/** Format an integer-second PR as `H:MM:SS` or `MM:SS`. Returns "—" when missing. */
function formatPR(seconds: number | undefined): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
    return "—";
  }
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  if (h > 0) {
    const mm = String(m).padStart(2, "0");
    return `${h}:${mm}:${ss}`;
  }
  return `${m}:${ss}`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
