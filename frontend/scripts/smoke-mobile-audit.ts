// Integration smoke for the local mobile event log consumed by /qa/mobile.

export {};

class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

Object.defineProperty(globalThis, "window", {
  value: { localStorage: new MemoryStorage() },
  configurable: true,
});

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

async function main(): Promise<void> {
  const {
    clearProductEvents,
    listProductEvents,
    trackProductEvent,
  } = await import("../lib/instrumentation");
  const {
    MOBILE_EVENT_NAMES,
    selectMobileAuditEvents,
    summarizeMobileAuditEvents,
  } = await import("../lib/mobileAudit");

  clearProductEvents();
  trackProductEvent("calendar_sync_completed", {
    outcome: "success",
    availability_ok: true,
  });
  trackProductEvent("mobile_companion_sync_completed", {
    platform: "ios",
    sync_type: "healthkit_readiness",
    outcome: "partial",
    permission_state: "partial",
    background_delivery: "enabled",
    coverage_bucket: "partial",
    confidence_bucket: "moderate",
    conflict: "none",
    latency_ms: 420,
  });
  trackProductEvent("mobile_decision_validated", {
    platform: "ios",
    outcome: "success",
    selected_action: "modify",
    confidence_bucket: "moderate",
    calendar_state: "conflict",
    readiness_state: "caution",
    deterministic_validation: "passed",
    has_calendar_warning: true,
    has_recovery_warning: false,
    ai_assisted: true,
    latency_ms: 680,
  });
  trackProductEvent("mobile_intake_lifecycle", {
    platform: "ios",
    action: "reviewed",
    outcome: "success",
    status: "ready",
    source: "ollama",
    fallback_used: false,
    latency_ms: 940,
    timed_out: false,
    change_count: 1,
    warning_count: 0,
    deterministic_validation: "not_run",
  });
  trackProductEvent("mobile_checkin_synced", {
    platform: "ios",
    status: "checked_in",
    outcome: "success",
    has_effort: false,
    has_user_reflection: false,
    update_succeeded: true,
    latency_ms: 160,
  });

  const mobileEvents = selectMobileAuditEvents(listProductEvents());
  const summary = summarizeMobileAuditEvents(mobileEvents);

  expect(
    mobileEvents.length === MOBILE_EVENT_NAMES.length,
    `expected ${MOBILE_EVENT_NAMES.length} mobile events, got ${mobileEvents.length}`,
  );
  for (const name of MOBILE_EVENT_NAMES) {
    expect(summary.names.get(name) === 1, `${name} should appear once in mobile QA`);
  }
  expect(summary.total === 4, `expected mobile QA total 4, got ${summary.total}`);
  expect(summary.outcomes.get("success") === 3, "expected three successful mobile events");
  expect(summary.outcomes.get("partial") === 1, "expected one partial sync event");
  expect(
    mobileEvents.some(
      (event) =>
        event.name === "mobile_decision_validated" &&
        event.properties.deterministic_validation === "passed",
    ),
    "mobile QA should expose deterministic validation proof",
  );
  expect(
    mobileEvents.some(
      (event) =>
        event.name === "mobile_checkin_synced" &&
        event.properties.status === "checked_in",
    ),
    "mobile QA should expose check-in outcomes",
  );
  expect(summary.latest !== null, "mobile QA should expose latest event freshness");

  console.log(
    "OK - mobile event log feeds all privacy-safe event families into the shared QA contract",
  );
}

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}
