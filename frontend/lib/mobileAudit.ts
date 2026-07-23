import type {
  ProductEvent,
  ProductEventName,
} from "./instrumentation";

export const MOBILE_EVENT_NAMES = [
  "mobile_companion_sync_completed",
  "mobile_decision_validated",
  "mobile_intake_lifecycle",
  "mobile_checkin_synced",
  "mobile_pattern_result_lifecycle",
] as const satisfies ReadonlyArray<ProductEventName>;

export type MobileEventName = (typeof MOBILE_EVENT_NAMES)[number];

export type MobileAuditSummary = {
  total: number;
  outcomes: Map<string, number>;
  names: Map<string, number>;
  latest: string | null;
};

const MOBILE_EVENT_SET = new Set<ProductEventName>(MOBILE_EVENT_NAMES);

export function selectMobileAuditEvents(
  events: ProductEvent[],
): ProductEvent<MobileEventName>[] {
  return events.filter((event) => MOBILE_EVENT_SET.has(event.name)) as ProductEvent<MobileEventName>[];
}

export function summarizeMobileAuditEvents(
  events: ProductEvent<MobileEventName>[],
): MobileAuditSummary {
  const outcomes = new Map<string, number>();
  const names = new Map<string, number>();
  for (const event of events) {
    const outcome = String(event.properties.outcome ?? "unknown");
    outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + 1);
    names.set(event.name, (names.get(event.name) ?? 0) + 1);
  }
  return {
    total: events.length,
    outcomes,
    names,
    latest: events[events.length - 1]?.at ?? null,
  };
}
