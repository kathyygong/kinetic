// Shared domain types for Kinetic.

/** What kind of goal the athlete is training toward. */
export type GoalType = "race";

/** Standard race distances supported by the planner. */
export type RaceDistance = "5k" | "10k" | "half" | "marathon";

/** How experienced the athlete is. Drives plan aggressiveness. */
export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

/**
 * Personal records for each standard race distance, **in seconds**.
 * Used by the planner to set paces and projection targets, and by
 * the user profile as the canonical PR record.
 *
 * Stored as integer seconds rather than decimal minutes so a 4:33 mile
 * (273 s) and a 2:59:48 marathon (10,788 s) keep the same precision.
 */
export type CurrentPRs = {
  "5k": number;
  "10k": number;
  half: number;
  marathon: number;
};

/**
 * A user's training goal.
 *
 * - `goal_type`: currently always "race"
 * - `race_distance`: target race ("5k" | "10k" | "half" | "marathon")
 * - `target_date`: ISO date string, e.g. "2026-09-15"
 * - `experience_level`: beginner | intermediate | advanced
 * - `current_prs`: PRs in seconds for each standard distance.
 *      Partial because new users haven't entered any yet — the
 *      pace calculator falls back to a sensible default when missing.
 * - `weekly_mileage`: average weekly volume in miles
 *      (optional; the planner estimates one if missing)
 */
export type Goal = {
  goal_type: GoalType;
  race_distance: RaceDistance;
  target_date: string;
  experience_level: ExperienceLevel;
  current_prs: Partial<CurrentPRs>;
  weekly_mileage?: number;
};

// --- User profile ----------------------------------------------------------

/** Day of the week the athlete prefers to train. */
export type DayOfWeek =
  | "mon"
  | "tue"
  | "wed"
  | "thu"
  | "fri"
  | "sat"
  | "sun";

/** A privacy-safe recurring constraint. Omitted weekdays are unconstrained. */
export type WeeklyAvailability = {
  day: DayOfWeek;
  /** Zero skips the weekday; positive values cap the workout duration. */
  available_minutes: number;
  /** When true, shared authority may schedule only an easy workout. */
  easy_only: boolean;
};

/** External services the user can link to Kinetic for data ingest. */
export type ConnectedService =
  | "google_calendar"
  | "apple_health"
  | "garmin"
  | "oura";

/**
 * Connection status for a single external service.
 *
 * - `connected`: whether the user has linked the service
 * - `last_synced_at`: ISO timestamp of the last successful sync (optional)
 */
export type ServiceConnection = {
  connected: boolean;
  last_synced_at?: string;
};

/** Map of every supported service to its current connection status. */
export type ConnectedServices = Record<ConnectedService, ServiceConnection>;

/**
 * The athlete's profile. Distinct from `Goal` — `Goal` describes *what*
 * they're training for, `UserProfile` describes *who they are*.
 *
 * `personal_bests` reuses the same `Partial<CurrentPRs>` shape as
 * `Goal.current_prs` (same keys, same unit: integer seconds), so the
 * profile is the source of truth and the goal can read from it.
 */
export type UserProfile = {
  // Identity
  full_name: string;
  email: string;
  profile_photo?: string;

  // Training identity
  experience_level: ExperienceLevel;
  weekly_mileage?: number;
  preferred_training_days: DayOfWeek[];
  weekly_availability?: WeeklyAvailability[];

  // Personal bests (in seconds)
  personal_bests: Partial<CurrentPRs>;

  // External integrations
  connected_services: ConnectedServices;

  /**
   * True once the user has finished the onboarding flow (clicked
   * "Start training" on the plan preview). Optional so older saved
   * profiles continue to validate; the login screen treats `undefined`
   * the same as `false` for routing purposes.
   */
  onboarding_completed?: boolean;
};
