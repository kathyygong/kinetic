"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";

import GlassCard from "@/components/GlassCard";
import HMSInput from "@/components/HMSInput";
import PageContainer from "@/components/PageContainer";
import { auth, type User } from "@/lib/firebase";
import {
  getUserProfile,
  planAffectingFieldsChanged,
  saveUserProfile,
} from "@/lib/profileStorage";
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

// --- Constants -------------------------------------------------------------

const EXPERIENCE_OPTIONS: Array<{
  value: ExperienceLevel;
  label: string;
  description: string;
}> = [
  { value: "beginner", label: "Beginner", description: "0–1 yr running" },
  { value: "intermediate", label: "Intermediate", description: "1–4 yrs, regular training" },
  { value: "advanced", label: "Advanced", description: "Competitive, structured plans" },
];

const DAYS: Array<{ value: DayOfWeek; label: string }> = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

const PR_FIELDS: Array<{ key: keyof CurrentPRs; label: string }> = [
  { key: "5k", label: "5K" },
  { key: "10k", label: "10K" },
  { key: "half", label: "Half" },
  { key: "marathon", label: "Marathon" },
];

const PR_PLACEHOLDERS_SEC: Record<keyof CurrentPRs, number> = {
  "5k": 25 * 60,
  "10k": 52 * 60,
  half: 1 * 3600 + 55 * 60,
  marathon: 4 * 3600,
};

const SERVICE_FIELDS: Array<{ key: ConnectedService; label: string; help: string }> = [
  { key: "google_calendar", label: "Google Calendar", help: "Read scheduled events to spot travel and busy days." },
  { key: "apple_health", label: "Apple Health", help: "Pull workouts, heart rate, and sleep." },
  { key: "garmin", label: "Garmin", help: "Sync runs, HR, and recovery metrics." },
  { key: "oura", label: "Oura", help: "Sleep score and readiness." },
];

const EMPTY_SERVICES: ConnectedServices = {
  google_calendar: { connected: false },
  apple_health: { connected: false },
  garmin: { connected: false },
  oura: { connected: false },
};

const EMPTY_PROFILE: UserProfile = {
  full_name: "",
  email: "",
  experience_level: "intermediate",
  weekly_mileage: undefined,
  preferred_training_days: [],
  personal_bests: {},
  connected_services: EMPTY_SERVICES,
};

// --- Page ------------------------------------------------------------------

export default function ProfileEditPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [saved, setSaved] = useState(false);

  // Hydrate from storage on mount; merge with auth defaults so brand-new
  // users see their email / display name pre-filled.
  useEffect(() => {
    const stored = getUserProfile();
    if (stored) {
      setProfile({
        ...EMPTY_PROFILE,
        ...stored,
        connected_services: {
          ...EMPTY_SERVICES,
          ...stored.connected_services,
        },
      });
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthUser(u);
      // First-load defaults from auth — only fill blanks, never overwrite.
      setProfile((p) => ({
        ...p,
        full_name: p.full_name || u?.displayName || "",
        email: u?.email || p.email || "",
        profile_photo: p.profile_photo || u?.photoURL || undefined,
      }));
    });
    return () => unsub();
  }, []);

  // --- Field setters -------------------------------------------------------

  const updateField = <K extends keyof UserProfile>(
    key: K,
    value: UserProfile[K]
  ) => setProfile((p) => ({ ...p, [key]: value }));

  const toggleDay = (d: DayOfWeek) =>
    setProfile((p) => {
      const set = new Set(p.preferred_training_days);
      if (set.has(d)) set.delete(d);
      else set.add(d);
      // Keep canonical order so storage is stable.
      const ordered = DAYS.map((x) => x.value).filter((x) => set.has(x));
      return { ...p, preferred_training_days: ordered };
    });

  const updatePR = (key: keyof CurrentPRs, seconds: number | undefined) =>
    setProfile((p) => {
      const next = { ...p.personal_bests };
      if (typeof seconds === "number" && seconds > 0) next[key] = seconds;
      else delete next[key];
      return { ...p, personal_bests: next };
    });

  const toggleService = (key: ConnectedService) =>
    setProfile((p) => {
      const prev = p.connected_services[key];
      const nowConnected = !prev.connected;
      return {
        ...p,
        connected_services: {
          ...p.connected_services,
          [key]: nowConnected
            ? { connected: true, last_synced_at: new Date().toISOString() }
            : { connected: false },
        },
      };
    });

  // --- Validation ---------------------------------------------------------

  const errors = useMemo(() => {
    const out: string[] = [];
    if (!profile.full_name.trim()) out.push("Full name is required.");
    if (
      profile.weekly_mileage !== undefined &&
      (Number.isNaN(profile.weekly_mileage) || profile.weekly_mileage < 0)
    ) {
      out.push("Weekly mileage must be a non-negative number.");
    }
    return out;
  }, [profile]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (errors.length > 0) return;
    const next = { ...profile, full_name: profile.full_name.trim() };
    // If a plan-affecting field changed (preferred days, experience,
    // weekly mileage, PRs), drop the cached calendar-aware plan so the
    // dashboard regenerates against the new preferences on next load.
    const previous = getUserProfile();
    if (previous && planAffectingFieldsChanged(previous, next)) {
      clearSavedPlan();
    }
    saveUserProfile(next);
    setSaved(true);
    setTimeout(() => router.push("/profile"), 600);
  };

  return (
    <PageContainer className="mx-auto w-full max-w-3xl px-2 py-12 sm:py-16">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Kinetic</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Edit profile</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Update your athlete identity, training preferences, and connected
          services. Saved on this device.
        </p>
      </header>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Identity */}
        <SectionCard
          title="Identity"
          description="How you appear in Kinetic."
        >
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Full name" htmlFor="full_name">
              <input
                id="full_name"
                type="text"
                required
                value={profile.full_name}
                onChange={(e) => updateField("full_name", e.target.value)}
                className={inputClass}
                placeholder={authUser?.displayName ?? "Your name"}
              />
            </Field>
            <Field
              label="Email"
              htmlFor="email"
              hint="Used for account contact only."
            >
              <input
                id="email"
                type="email"
                value={profile.email}
                onChange={(e) => updateField("email", e.target.value)}
                className={inputClass}
                placeholder={authUser?.email ?? "you@example.com"}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field
                label="Profile photo URL"
                htmlFor="profile_photo"
                hint="Paste a public image URL — we'll show your initials if it doesn't load."
              >
                <input
                  id="profile_photo"
                  type="url"
                  value={profile.profile_photo ?? ""}
                  onChange={(e) =>
                    updateField(
                      "profile_photo",
                      e.target.value.trim() || undefined
                    )
                  }
                  className={inputClass}
                  placeholder={authUser?.photoURL ?? "https://…"}
                />
              </Field>
            </div>
          </div>
        </SectionCard>

        {/* Training */}
        <SectionCard
          title="Training profile"
          description="Helps Kinetic calibrate volume and pick recovery days."
        >
          <div className="space-y-6">
            <Field label="Experience level" htmlFor="experience_level">
              <SegmentedControl
                value={profile.experience_level}
                options={EXPERIENCE_OPTIONS}
                onChange={(v) => updateField("experience_level", v)}
              />
            </Field>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field
                label="Weekly mileage"
                htmlFor="weekly_mileage"
                hint="Optional — leave blank if you're unsure."
              >
                <div className="relative">
                  <input
                    id="weekly_mileage"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="1"
                    placeholder="—"
                    value={profile.weekly_mileage ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      updateField(
                        "weekly_mileage",
                        v === "" ? undefined : Number(v)
                      );
                    }}
                    className={`${inputClass} pr-10`}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-neutral-400">
                    mi
                  </span>
                </div>
              </Field>

              <Field label="Preferred training days" htmlFor="days">
                <div id="days" className="flex flex-wrap gap-1.5">
                  {DAYS.map((d) => {
                    const active = profile.preferred_training_days.includes(
                      d.value
                    );
                    return (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => toggleDay(d.value)}
                        aria-pressed={active}
                        className={[
                          "inline-flex h-9 min-w-9 items-center justify-center rounded-full border px-3 text-xs font-medium",
                          tokens.motion,
                          active
                            ? tokens.primary.softActive
                            : "border-black/10 bg-white/60 text-neutral-600 hover:border-black/20 hover:bg-white dark:border-white/10 dark:bg-neutral-900/40 dark:text-neutral-400 dark:hover:bg-neutral-900/60",
                        ].join(" ")}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </div>
          </div>
        </SectionCard>

        {/* Personal bests */}
        <SectionCard
          title="Personal bests"
          description="Your fastest race times, used for pace projection."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {PR_FIELDS.map(({ key, label }) => (
              <Field key={key} label={label} htmlFor={`pr_${key}_m`}>
                <HMSInput
                  id={`pr_${key}`}
                  valueSec={profile.personal_bests[key]}
                  placeholderSec={PR_PLACEHOLDERS_SEC[key]}
                  onChange={(sec) => updatePR(key, sec)}
                />
              </Field>
            ))}
          </div>
          <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
            Hours : minutes : seconds. Leave blank for any distance you
            haven't raced.
          </p>
        </SectionCard>

        {/* Connected services */}
        <SectionCard
          title="Connected services"
          description="Toggle which data sources Kinetic should read from."
        >
          <ul className="divide-y divide-black/5 dark:divide-white/10">
            {SERVICE_FIELDS.map(({ key, label, help }) => {
              const conn = profile.connected_services[key];
              return (
                <li
                  key={key}
                  className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {label}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500">{help}</p>
                  </div>
                  <Toggle
                    on={conn.connected}
                    onChange={() => toggleService(key)}
                    label={label}
                  />
                </li>
              );
            })}
          </ul>
        </SectionCard>

        {/* Action bar */}
        <div className="sticky bottom-4 z-10">
          <GlassCard
            interactive={false}
            className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-1 flex-wrap items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
              {saved ? (
                <span className={`text-sm font-medium ${tokens.success.text}`}>
                  Saved · returning to profile
                </span>
              ) : errors.length > 0 ? (
                <span className={tokens.warning.text}>{errors[0]}</span>
              ) : (
                <span>Changes save to this device.</span>
              )}
            </div>
            <div className="flex items-center justify-end gap-3">
              <Link
                href="/profile"
                className={`rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-neutral-700 hover:border-black/20 hover:bg-neutral-50 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-neutral-800 ${tokens.motion}`}
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={errors.length > 0}
                className={`rounded-full px-5 py-2.5 text-sm font-semibold ${tokens.primary.solid} disabled:cursor-not-allowed disabled:opacity-50`}
              >
                Save profile
              </button>
            </div>
          </GlassCard>
        </div>
      </form>
    </PageContainer>
  );
}

// --- Subcomponents (mirrors the settings page) -----------------------------

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <GlassCard interactive={false} className="p-6 sm:p-8">
      <header className="mb-6">
        <h2 className="text-base font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          {title}
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {description}
        </p>
      </header>
      {children}
    </GlassCard>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400"
      >
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string; description?: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={[
              "rounded-lg border px-4 py-3 text-left text-sm",
              tokens.motion,
              active
                ? tokens.primary.softActive
                : "border-black/10 bg-white/60 text-neutral-700 hover:border-black/20 hover:bg-white hover:shadow-sm dark:border-white/10 dark:bg-neutral-900/40 dark:text-neutral-300 dark:hover:border-white/20 dark:hover:bg-neutral-900/60",
            ].join(" ")}
            aria-pressed={active}
          >
            <span className="block font-medium">{opt.label}</span>
            {opt.description && (
              <span
                className={`mt-0.5 block text-[11px] ${
                  active
                    ? "text-blue-700/80 dark:text-blue-200/80"
                    : "text-neutral-500"
                }`}
              >
                {opt.description}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`Toggle ${label}`}
      onClick={onChange}
      className={[
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
        tokens.motion,
        on
          ? "border-blue-500 bg-blue-500"
          : "border-black/10 bg-neutral-200 dark:border-white/10 dark:bg-neutral-700",
      ].join(" ")}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

const inputClass =
  "w-full rounded-lg border border-black/10 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 hover:border-black/20 focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-neutral-950/60 dark:text-neutral-100 dark:hover:border-white/20 dark:focus:border-blue-400/60 dark:focus:ring-blue-400/20";
