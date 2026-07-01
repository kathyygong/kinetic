// Tiny wrapper around `fetch` that attaches the signed-in Firebase user's
// ID token as a Bearer credential. The backend's auth dependency
// (`backend/app/auth.py`) verifies these tokens when KINETIC_AUTH_REQUIRED
// is set; in permissive mode they're decoded but optional.
//
// Usage:
//   const res = await apiFetch("/decision", { method: "POST", body });
//
// Notes:
//   - `path` may be absolute (http(s)://...) or a leading-slash path; in the
//     latter case we prepend NEXT_PUBLIC_API_BASE_URL.
//   - Setting JSON bodies still requires the caller to set
//     `Content-Type: application/json`. We don't auto-serialize.
//   - Failures to fetch a token (e.g. user signed out, network blip) are
//     non-fatal: the request goes out without an Authorization header and
//     the server decides what to do.

import { auth } from "./firebase";
import { getGoogleCalendarConnection } from "./integrations/googleCalendar";

const DEFAULT_BASE = "http://127.0.0.1:8000";

export const API_BASE: string =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_BASE;

function resolveUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (!path.startsWith("/")) return `${API_BASE}/${path}`;
  return `${API_BASE}${path}`;
}

async function getBearerToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

/**
 * Calendar endpoints that should automatically receive the user's
 * Google OAuth access token (calendar.readonly scope, obtained via
 * Firebase's GoogleAuthProvider). Anything else gets the standard
 * Firebase-only auth.
 *
 * The match is path-only — query strings are ignored — and uses a
 * `startsWith` check so future calendar-namespaced routes inherit
 * the behavior without ceremony.
 */
const CALENDAR_PATH_PREFIXES = [
  "/availability/week",
  "/travel",
  "/integrations/calendar",
];

function shouldAttachGoogleToken(path: string): boolean {
  // Strip query string + protocol+host so we can match on bare path.
  let normalized = path;
  const qIdx = normalized.indexOf("?");
  if (qIdx >= 0) normalized = normalized.slice(0, qIdx);
  if (/^https?:\/\//i.test(normalized)) {
    try {
      normalized = new URL(normalized).pathname;
    } catch {
      // Fall through with the raw value.
    }
  }
  return CALENDAR_PATH_PREFIXES.some((p) => normalized.startsWith(p));
}

export async function apiFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = await getBearerToken();

  // Merge headers without clobbering any the caller passed in.
  const headers = new Headers(init.headers);
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // For calendar-facing endpoints, also forward the user's Google
  // access token so the backend can talk to Google with the runner's
  // own credentials instead of a server-wide `token.json` only the
  // operator can refresh. Same "don't clobber caller" rule.
  if (shouldAttachGoogleToken(path) && !headers.has("X-Google-Access-Token")) {
    const gcal = getGoogleCalendarConnection();
    if (gcal?.accessToken) {
      headers.set("X-Google-Access-Token", gcal.accessToken);
    }
  }

  return fetch(resolveUrl(path), { ...init, headers });
}

// --- Weekly reasoning ------------------------------------------------------

/**
 * Schema for `POST /weekly-reasoning` responses. Matches the backend's
 * `generate_weekly_recalibration_summary` contract. The reasoning
 * module always falls back to deterministic prose on failure, so
 * callers can treat any successful HTTP response as a valid summary.
 */
export type WeeklyReasoningResponse = {
  summary: string;
  changes: { title: string; explanation: string }[];
  preserved: string[];
  tradeoff: string;
  confidence_note: string;
};

/**
 * Call `POST /weekly-reasoning` with a recalibration trace and return
 * the structured explanation. Rejects on network error or non-2xx
 * status so the caller can render its own error state — but a 2xx
 * always contains a usable summary because the backend never lets the
 * reasoning layer throw.
 */
export async function fetchWeeklyReasoning(
  recalibrationTrace: unknown,
  init: RequestInit = {},
): Promise<WeeklyReasoningResponse> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await apiFetch("/weekly-reasoning", {
    ...init,
    method: "POST",
    headers,
    body: JSON.stringify({ recalibration_trace: recalibrationTrace }),
  });
  if (!res.ok) {
    throw new Error(`weekly-reasoning failed: HTTP ${res.status}`);
  }
  return (await res.json()) as WeeklyReasoningResponse;
}

// --- Behavior insights -----------------------------------------------------

/**
 * One pattern surfaced by `POST /behavior-insights`. Matches the
 * contract in `backend/app/behavior_insights.py`. Confidence is
 * always one of three buckets so the UI can map them to a finite set
 * of styles; `preference_type` is constrained so the UI can pair each
 * pattern with a stable icon / label.
 */
export type BehaviorPattern = {
  title: string;
  description: string;
  confidence: "low" | "moderate" | "high";
  suggested_adjustment: string;
  preference_type:
    | "busy_day_preference"
    | "rest_day_preference"
    | "intensity_tolerance"
    | "schedule_preference";
};

/**
 * Schema for `POST /behavior-insights` responses. The backend always
 * returns a valid object on 2xx — on any internal failure path it
 * substitutes a deterministic fallback — so callers can treat the
 * response as authoritative.
 */
export type BehaviorInsightsResponse = {
  patterns: BehaviorPattern[];
  warnings: string[];
};

/**
 * Call `POST /behavior-insights` with the runner's `RecommendationEvent`
 * history and return the analyser's patterns + warnings. The endpoint
 * is purely advisory — calling it never mutates server-side state,
 * and consuming the response never changes the runner's plan unless
 * the UI explicitly confirms a pattern.
 */
export async function fetchBehaviorInsights(
  recommendationEvents: unknown[],
  init: RequestInit = {},
): Promise<BehaviorInsightsResponse> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await apiFetch("/behavior-insights", {
    ...init,
    method: "POST",
    headers,
    body: JSON.stringify({ recommendation_events: recommendationEvents }),
  });
  if (!res.ok) {
    throw new Error(`behavior-insights failed: HTTP ${res.status}`);
  }
  return (await res.json()) as BehaviorInsightsResponse;
}

// --- Read-only What-if reasoning -------------------------------------------

export type WhatIfResponse = {
  mode: AIRuntimeMode;
  source: string;
  schema_version: "what-if.v1";
  grounding: {
    deterministic_authority: true;
    fields: string[];
  };
  fallback_used: boolean;
  warnings: string[];
  simulation: import("@/lib/whatIf").WhatIfSimulation;
  explanation: import("@/lib/whatIf").WhatIfExplanation;
};

export async function fetchWhatIfExplanation(
  simulation: import("@/lib/whatIf").WhatIfSimulation,
): Promise<WhatIfResponse> {
  const response = await apiFetch("/ai/what-if", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ simulation }),
  });
  if (!response.ok) {
    throw new Error(`what-if failed: HTTP ${response.status}`);
  }
  return (await response.json()) as WhatIfResponse;
}

// --- Bounded natural-language intake ---------------------------------------

export type IntakeDay =
  | "mon"
  | "tue"
  | "wed"
  | "thu"
  | "fri"
  | "sat"
  | "sun";

export type IntakeDraft = {
  status: "ready" | "needs_clarification" | "unsupported";
  summary: string;
  goal_changes: {
    id: string;
    field: "race_distance" | "target_date" | "weekly_mileage";
    value: string | number;
  }[];
  schedule_changes: {
    id: string;
    field: "preferred_training_days";
    value: IntakeDay[];
  }[];
  availability_changes: {
    id: string;
    day: IntakeDay;
    available_minutes: number | null;
    easy_only: boolean;
  }[];
  preference_changes: {
    id: string;
    field: "experience_level";
    value: "beginner" | "intermediate" | "advanced";
  }[];
  grounding: { change_id: string; evidence: string }[];
  warnings: string[];
};

export type IntakeParseResponse = {
  mode: AIRuntimeMode;
  source: string;
  schema_version: "intake.v1";
  fallback_used: boolean;
  warnings: string[];
  grounding: {
    deterministic_authority: true;
    source_text_required: true;
    apply_requires_confirmation: true;
    allowed_fields: string[];
  };
  draft: IntakeDraft;
};

export async function fetchIntakeDraft(
  text: string,
  context: {
    today: string;
    current_goal: unknown;
    current_profile: unknown;
  },
  timeoutMs = 30_000,
): Promise<IntakeParseResponse> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await apiFetch("/ai/parse-intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, context }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`parse-intake failed: HTTP ${response.status}`);
    }
    const body: unknown = await response.json();
    if (!isIntakeParseResponse(body)) {
      throw new Error("parse-intake returned an invalid response envelope");
    }
    return body;
  } finally {
    window.clearTimeout(timer);
  }
}

function isIntakeParseResponse(value: unknown): value is IntakeParseResponse {
  if (typeof value !== "object" || value === null) return false;
  const envelope = value as Record<string, unknown>;
  if (
    envelope.schema_version !== "intake.v1" ||
    !["fallback", "local_ollama", "disabled"].includes(String(envelope.mode)) ||
    typeof envelope.source !== "string" ||
    typeof envelope.fallback_used !== "boolean" ||
    !Array.isArray(envelope.warnings) ||
    typeof envelope.grounding !== "object" ||
    envelope.grounding === null ||
    typeof envelope.draft !== "object" ||
    envelope.draft === null
  ) {
    return false;
  }
  const grounding = envelope.grounding as Record<string, unknown>;
  const draft = envelope.draft as Record<string, unknown>;
  return (
    grounding.deterministic_authority === true &&
    grounding.source_text_required === true &&
    grounding.apply_requires_confirmation === true &&
    ["ready", "needs_clarification", "unsupported"].includes(
      String(draft.status),
    ) &&
    typeof draft.summary === "string" &&
    Array.isArray(draft.goal_changes) &&
    Array.isArray(draft.schedule_changes) &&
    Array.isArray(draft.availability_changes) &&
    Array.isArray(draft.preference_changes) &&
    Array.isArray(draft.grounding) &&
    Array.isArray(draft.warnings)
  );
}

// --- AI runtime ------------------------------------------------------------

export type AIRuntimeMode = "fallback" | "local_ollama" | "disabled";

export type AIStatusResponse = {
  mode: AIRuntimeMode;
  source: "deterministic" | "ollama" | string;
  configured: boolean;
  live_model_enabled: boolean;
  fallback_used: boolean;
  provider: string | null;
  model: string | null;
  intake_model: string | null;
  timeout_seconds: number;
  message: string;
};

export async function fetchAIStatus(
  init: RequestInit = {},
): Promise<AIStatusResponse> {
  const res = await apiFetch("/ai/status", {
    ...init,
    method: "GET",
  });
  if (!res.ok) {
    throw new Error(`ai-status failed: HTTP ${res.status}`);
  }
  return (await res.json()) as AIStatusResponse;
}

export type DailyReasoning = {
  summary: string;
  factors: {
    title: string;
    explanation: string;
    impact: "positive" | "negative" | "neutral";
  }[];
  tradeoff: string;
  confidence_note: string;
};

export async function fetchDailyReasoning(
  decision: unknown,
  init: RequestInit = {},
): Promise<DailyReasoning> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await apiFetch("/decision/reasoning", {
    ...init,
    method: "POST",
    headers,
    body: JSON.stringify({ decision }),
  });
  if (!res.ok) {
    throw new Error(`decision-reasoning failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as { ai_reasoning: DailyReasoning };
  return body.ai_reasoning;
}

// --- Calendar health -------------------------------------------------------

/**
 * Shape of the `/integrations/calendar/health` response. Always 200
 * — the failure mode is encoded in `status` rather than the HTTP code
 * so the caller doesn't need a separate error path for "the server
 * has no Google credentials yet".
 *
 * Possible status values:
 *
 * - `ok` — backend can talk to Google right now (token valid, or just
 *   refreshed successfully). The misleading-but-green pill on Profile
 *   is correct in this case.
 * - `not_configured` — no `credentials.json` on the server. Operator
 *   fix; the runner can't help.
 * - `not_authorized` — server has credentials.json but no `token.json`
 *   (initial consent flow never completed). Operator fix.
 * - `expired` — token expired and there's no refresh token. Operator
 *   needs to re-authorize.
 * - `revoked` — refresh attempt got `invalid_grant`. The user
 *   revoked the server's access from Google's account page; operator
 *   needs to re-authorize.
 * - `error` — anything else (disk read failure, malformed token.json,
 *   unexpected refresh error).
 */
export type CalendarHealthStatus =
  | "ok"
  | "not_configured"
  | "not_authorized"
  | "expired"
  | "revoked"
  | "error";

export type CalendarHealthResponse = {
  status: CalendarHealthStatus;
  /**
   * True when the Profile's "Reconnect" button would plausibly help.
   * Currently always false because Realm A (frontend Firebase OAuth)
   * and Realm B (backend `token.json`) are disjoint — but we keep
   * the field so the UI can branch on it without re-checking the
   * status enum. Future work: a server-side reauth flow that the
   * runner can trigger from the UI would set this true.
   */
  user_actionable: boolean;
  /** One short sentence safe to show in the UI verbatim. */
  message: string;
};

/**
 * Call `GET /integrations/calendar/health` and return the structured
 * status. Resolves on any 2xx; rejects on network failure or non-2xx
 * so the caller can decide whether to fall back to the client-side
 * "last attempt failed" heuristic.
 */
export async function fetchCalendarHealth(
  init: RequestInit = {},
): Promise<CalendarHealthResponse> {
  const res = await apiFetch("/integrations/calendar/health", {
    ...init,
    method: "GET",
  });
  if (!res.ok) {
    throw new Error(`calendar-health failed: HTTP ${res.status}`);
  }
  return (await res.json()) as CalendarHealthResponse;
}
