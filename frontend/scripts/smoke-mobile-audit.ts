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
    decision_source: "live",
    failure_state: "none",
    cache_state: "fresh",
    availability_source: "calendar",
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
    route: "review_draft",
    draft_kind: "availability",
    failure_state: "none",
    parser_source: "ollama",
    mutation_state: "review_only",
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
    checkin_kind: "perceived_recovery",
    status: "checked_in",
    outcome: "success",
    failure_state: "none",
    write_scope: "readiness",
    deterministic_validation: "passed",
    has_effort: false,
    has_user_reflection: false,
    update_succeeded: true,
    latency_ms: 160,
  });
  trackProductEvent("mobile_pattern_result_lifecycle", {
    platform: "web",
    action: "reviewed",
    outcome: "success",
    pattern_family: "specific_day_skips",
    result_kind: "preferred_day_review",
    mutation_state: "review_only",
    deterministic_validation: "not_run",
    source: "deterministic",
  });
  trackProductEvent("mobile_foundation_lifecycle", {
    platform: "ios",
    action: "session_restored",
    outcome: "success",
    account_state: "active",
    permission_state: "partial",
    migration_state: "completed",
    deletion_scope: "none",
    latency_ms: 210,
  });
  trackProductEvent("mobile_plan_lifecycle", {
    platform: "ios",
    action: "move",
    outcome: "success",
    result: "commit_ready",
    mutation_state: "applied",
    deterministic_validation: "passed",
    failure_state: "none",
    version_delta: 1,
    affected_count: 1,
    completed_preserved: 1,
    latency_ms: 330,
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
  expect(summary.total === 7, `expected mobile QA total 7, got ${summary.total}`);
  expect(summary.outcomes.get("success") === 6, "expected six successful mobile events");
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
        event.properties.status === "checked_in" &&
        event.properties.checkin_kind === "perceived_recovery" &&
        event.properties.write_scope === "readiness" &&
        event.properties.deterministic_validation === "passed",
    ),
    "mobile QA should expose bounded check-in lifecycle outcomes",
  );
  expect(
    mobileEvents.some(
      (event) =>
        event.name === "mobile_intake_lifecycle" &&
        event.properties.route === "review_draft" &&
        event.properties.draft_kind === "availability" &&
        event.properties.failure_state === "none" &&
        event.properties.mutation_state === "review_only",
    ),
    "mobile QA should expose bounded intake route and mutation state",
  );
  expect(
    mobileEvents.some(
      (event) =>
        event.name === "mobile_pattern_result_lifecycle" &&
        event.properties.pattern_family === "specific_day_skips" &&
        event.properties.result_kind === "preferred_day_review" &&
        event.properties.mutation_state === "review_only",
    ),
    "mobile QA should expose bounded behavior-pattern result outcomes",
  );
  expect(
    mobileEvents.some(
      (event) =>
        event.name === "mobile_foundation_lifecycle" &&
        event.properties.account_state === "active" &&
        event.properties.migration_state === "completed",
    ),
    "mobile QA should expose bounded foundation state",
  );
  expect(
    mobileEvents.some(
      (event) =>
        event.name === "mobile_plan_lifecycle" &&
        event.properties.result === "commit_ready" &&
        event.properties.completed_preserved === 1,
    ),
    "mobile QA should expose bounded plan lifecycle proof",
  );
  expect(summary.latest !== null, "mobile QA should expose latest event freshness");

  console.log(
    "OK - mobile event log feeds all privacy-safe event families into the shared QA contract",
  );
}

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}
