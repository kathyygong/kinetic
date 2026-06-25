"use client";

export type ProductEventName =
  | "recommendation_response"
  | "recommendation_completion"
  | "post_workout_checkin_saved"
  | "ai_status_checked"
  | "ai_reasoning_completed"
  | "calendar_sync_completed"
  | "stale_data_warning_shown"
  | "weekly_plan_recalibrated"
  | "learned_preference_updated"
  | "demo_data_control_used";

type ProductEventValue = string | number | boolean | null;
type ProductEventProperties = Record<string, ProductEventValue | undefined>;

export type ProductEvent = {
  id: string;
  name: ProductEventName;
  at: string;
  properties: Record<string, ProductEventValue>;
};

type ProductEventLog = {
  version: number;
  events: ProductEvent[];
};

const STORAGE_KEY = "kinetic_product_events";
const LOG_VERSION = 1;
const MAX_EVENTS = 200;

const SENSITIVE_KEY_PATTERNS = [
  /(^|_)email($|_)/i,
  /(^|_)full_?name($|_)/i,
  /(^|_)name($|_)/i,
  /(^|_)note($|_)/i,
  /description/i,
  /calendar_?event/i,
  /event_?text/i,
  /raw/i,
  /token/i,
  /secret/i,
];

export function trackProductEvent(
  name: ProductEventName,
  properties: ProductEventProperties = {},
): ProductEvent | null {
  if (typeof window === "undefined") return null;

  const event: ProductEvent = {
    id: makeEventId(name),
    name,
    at: new Date().toISOString(),
    properties: sanitizeProperties(properties),
  };

  const log = readLog();
  log.events.push(event);
  if (log.events.length > MAX_EVENTS) {
    log.events = log.events.slice(log.events.length - MAX_EVENTS);
  }
  writeLog(log);
  return event;
}

export function listProductEvents(): ProductEvent[] {
  if (typeof window === "undefined") return [];
  return readLog().events;
}

export function clearProductEvents(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function sanitizeProperties(
  properties: ProductEventProperties,
): Record<string, ProductEventValue> {
  const sanitized: Record<string, ProductEventValue> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined) continue;
    if (SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
      continue;
    }
    if (typeof value === "string") {
      sanitized[key] = value.length > 80 ? value.slice(0, 80) : value;
    } else if (typeof value === "number") {
      if (Number.isFinite(value)) sanitized[key] = value;
    } else if (typeof value === "boolean" || value === null) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function readLog(): ProductEventLog {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: LOG_VERSION, events: [] };
    const parsed = JSON.parse(raw) as ProductEventLog;
    if (
      parsed.version !== LOG_VERSION ||
      !Array.isArray(parsed.events)
    ) {
      return { version: LOG_VERSION, events: [] };
    }
    return parsed;
  } catch {
    return { version: LOG_VERSION, events: [] };
  }
}

function writeLog(log: ProductEventLog): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  } catch {
    // ignore; instrumentation must never break the product flow
  }
}

function makeEventId(name: ProductEventName): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${name}_${Date.now()}_${random}`;
}
