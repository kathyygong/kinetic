// localStorage helpers for the user profile.
//
// Key: "kinetic_profile" — separate from "kinetic_goal" (training target)
// and "kinetic_plan" (generated plan) so the three concerns can evolve
// independently.
//
// All helpers are SSR-safe — they no-op when window is undefined.

import type { User } from "firebase/auth";

import type {
  ConnectedService,
  ConnectedServices,
  CurrentPRs,
  DayOfWeek,
  ExperienceLevel,
  UserProfile,
  WeeklyAvailability,
} from "./types";
import { mirrorLocalStorageKey } from "./persistence/mirror";

export const PROFILE_STORAGE_KEY = "kinetic_profile";

const EXPERIENCE_LEVELS: ExperienceLevel[] = [
  "beginner",
  "intermediate",
  "advanced",
];
const DAYS: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const PR_KEYS: Array<keyof CurrentPRs> = ["5k", "10k", "half", "marathon"];
const SERVICES: ConnectedService[] = [
  "google_calendar",
  "apple_health",
  "garmin",
  "oura",
];

/** Persist the user's profile to localStorage. */
export function saveUserProfile(profile: UserProfile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    mirrorLocalStorageKey(PROFILE_STORAGE_KEY);
  } catch {
    // Storage might be unavailable (private mode, quota). Ignore.
  }
}

/** Read the saved profile, or null if none / invalid. */
export function getUserProfile(): UserProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isUserProfile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * A baseline profile with all required fields set to safe defaults. Use
 * this as the seed when there's nothing in storage yet — every onboarding
 * step expects every field to be present.
 */
export function emptyProfile(): UserProfile {
  return {
    full_name: "",
    email: "",
    profile_photo: undefined,
    experience_level: "intermediate",
    weekly_mileage: undefined,
    preferred_training_days: [],
    weekly_availability: [],
    personal_bests: {},
    connected_services: {
      google_calendar: { connected: false },
      apple_health: { connected: false },
      garmin: { connected: false },
      oura: { connected: false },
    },
    onboarding_completed: false,
  };
}

/**
 * Merge Firebase auth identity (display name, email, photo) into the
 * stored profile, creating one if it doesn't exist yet.
 *
 * Email is treated as authoritative from the auth provider — if the
 * Firebase user has an email, it always wins over any cached value so
 * stale or placeholder emails (e.g. left over from demo / dev seeds)
 * self-heal on the next sign-in.
 *
 * Display name and photo only fill in when the user hasn't customized
 * them, so a name typed on /profile/edit is never overwritten.
 * Idempotent.
 *
 * Returns the merged profile so callers can use it immediately without
 * a second read.
 */
export function mergeAuthIntoProfile(user: User | null): UserProfile {
  const existing = getUserProfile();
  const base = existing ?? emptyProfile();

  const merged: UserProfile = {
    ...base,
    full_name: base.full_name?.trim() || user?.displayName || base.full_name,
    email: user?.email || base.email || "",
    profile_photo:
      base.profile_photo || (user?.photoURL ?? undefined),
  };

  saveUserProfile(merged);
  return merged;
}

/**
 * Mark onboarding as complete on the user profile. Used by the plan
 * preview screen when the athlete clicks "Start training".
 */
export function markOnboardingComplete(): void {
  const existing = getUserProfile() ?? emptyProfile();
  if (existing.onboarding_completed) return;
  saveUserProfile({ ...existing, onboarding_completed: true });
}

/**
 * True if any field that influences the generated training plan changed
 * between two profile snapshots. Callers use this to decide whether to
 * invalidate the cached plan on save so the dashboard regenerates
 * against the new preferences.
 *
 * Plan-affecting fields:
 *   - experience_level (drives template selection)
 *   - weekly_mileage   (drives volume scaling)
 *   - preferred_training_days (drives day-of-week placement)
 *   - personal_bests   (drives pace targets)
 */
export function planAffectingFieldsChanged(
  prev: UserProfile,
  next: UserProfile,
): boolean {
  if (prev.experience_level !== next.experience_level) return true;
  if ((prev.weekly_mileage ?? null) !== (next.weekly_mileage ?? null)) {
    return true;
  }
  // Compare days as ordered, sorted lists so toggle order doesn't matter.
  const prevDays = [...prev.preferred_training_days].sort().join(",");
  const nextDays = [...next.preferred_training_days].sort().join(",");
  if (prevDays !== nextDays) return true;
  const prevAvailability = JSON.stringify([...(prev.weekly_availability ?? [])].sort((a, b) => a.day.localeCompare(b.day)));
  const nextAvailability = JSON.stringify([...(next.weekly_availability ?? [])].sort((a, b) => a.day.localeCompare(b.day)));
  if (prevAvailability !== nextAvailability) return true;
  // PRs feed pace targets, which feed plan distances/durations.
  const prevPR = JSON.stringify(prev.personal_bests ?? {});
  const nextPR = JSON.stringify(next.personal_bests ?? {});
  if (prevPR !== nextPR) return true;
  return false;
}

// --- Validation -------------------------------------------------------------

/**
 * Runtime check that an unknown value matches the {@link UserProfile} shape.
 * Defensive against old / foreign blobs in localStorage — rejects rather
 * than rendering corrupt data.
 */
export function isUserProfile(value: unknown): value is UserProfile {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;

  if (typeof p.full_name !== "string") return false;
  if (typeof p.email !== "string") return false;
  if (
    p.profile_photo !== undefined &&
    typeof p.profile_photo !== "string"
  ) {
    return false;
  }
  if (!EXPERIENCE_LEVELS.includes(p.experience_level as ExperienceLevel)) {
    return false;
  }
  if (
    p.weekly_mileage !== undefined &&
    (typeof p.weekly_mileage !== "number" || !Number.isFinite(p.weekly_mileage))
  ) {
    return false;
  }
  if (!isDayList(p.preferred_training_days)) return false;
  if (p.weekly_availability !== undefined && !isWeeklyAvailability(p.weekly_availability)) return false;
  if (!isPersonalBests(p.personal_bests)) return false;
  if (!isConnectedServices(p.connected_services)) return false;
  if (
    p.onboarding_completed !== undefined &&
    typeof p.onboarding_completed !== "boolean"
  ) {
    return false;
  }

  return true;
}

function isWeeklyAvailability(value: unknown): value is WeeklyAvailability[] {
  if (!Array.isArray(value) || value.length > 7) return false;
  const seen = new Set<string>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
    const item = candidate as Record<string, unknown>;
    if (Object.keys(item).sort().join(",") !== "available_minutes,day,easy_only") return false;
    if (!DAYS.includes(item.day as DayOfWeek) || seen.has(String(item.day))) return false;
    if (!Number.isInteger(item.available_minutes) || Number(item.available_minutes) < 0 || Number(item.available_minutes) > 240 || (Number(item.available_minutes) > 0 && Number(item.available_minutes) < 15)) return false;
    if (typeof item.easy_only !== "boolean") return false;
    seen.add(String(item.day));
  }
  return true;
}

function isDayList(value: unknown): value is DayOfWeek[] {
  return (
    Array.isArray(value) &&
    value.every((d) => DAYS.includes(d as DayOfWeek))
  );
}

function isPersonalBests(value: unknown): value is Partial<CurrentPRs> {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!PR_KEYS.includes(key as keyof CurrentPRs)) return false;
    const v = obj[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return false;
  }
  return true;
}

function isConnectedServices(value: unknown): value is ConnectedServices {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  for (const svc of SERVICES) {
    const entry = obj[svc];
    if (typeof entry !== "object" || entry === null) return false;
    const e = entry as Record<string, unknown>;
    if (typeof e.connected !== "boolean") return false;
    if (e.last_synced_at !== undefined && typeof e.last_synced_at !== "string") {
      return false;
    }
  }
  return true;
}
