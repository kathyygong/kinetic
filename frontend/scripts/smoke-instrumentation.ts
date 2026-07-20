// Smoke test for privacy-conscious product instrumentation.

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

class FailingStorage extends MemoryStorage {
  override removeItem(): void {
    throw new Error("simulated remove failure");
  }

  override setItem(): void {
    throw new Error("simulated write failure");
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

  const errors: string[] = [];
  const expect = (condition: boolean, message: string) => {
    if (!condition) errors.push(message);
  };

  clearProductEvents();

  const requiredEventCases = [
    {
      name: "recommendation_response",
      properties: {
        response: "accepted",
        rejection_reason: "felt_better",
        selected_action: "proceed",
        confidence_bucket: "high",
        staleness_warning_count: 0,
      },
    },
    {
      name: "recommendation_completion",
      properties: {
        status: "completed",
        response_status: "accepted",
        selected_action: "modify",
        accepted_adjustment: true,
      },
    },
    {
      name: "post_workout_checkin_saved",
      properties: {
        completed: true,
        has_effort: true,
        has_user_reflection: true,
        perceived_effort: 7,
        update_succeeded: true,
      },
    },
    {
      name: "ai_status_checked",
      properties: {
        outcome: "success",
        mode: "local_ollama",
        source: "ollama",
        fallback_used: false,
        live_model_enabled: true,
        timeout_seconds: 8,
        latency_ms: 230,
        timed_out: false,
      },
    },
    {
      name: "ai_reasoning_completed",
      properties: {
        surface: "dashboard_daily",
        outcome: "success",
        source: "ollama",
        fallback_used: false,
        ui_fallback_used: false,
        latency_ms: 1200,
        timed_out: false,
        selected_action: "proceed",
        factor_count: 3,
        modified_workout_count: 0,
        dropped_workout_count: 0,
        recommendation_event_count: 6,
        staleness_warning_count: 0,
        preserved_workout_count: 4,
        pattern_count: 1,
        warning_count: 0,
      },
    },
    {
      name: "calendar_sync_completed",
      properties: {
        outcome: "failed",
        availability_ok: false,
        travel_ok: true,
        horizon_days: 14,
        travel_horizon_days: 14,
        week_count: 2,
        has_changes: true,
        total_changes: 2,
        easy_only_day_count: 2,
      },
    },
    {
      name: "stale_data_warning_shown",
      properties: {
        warning_count: 2,
        has_calendar_warning: true,
        has_recovery_warning: true,
        selected_action: "modify",
        confidence_bucket: "moderate",
      },
    },
    {
      name: "weekly_plan_recalibrated",
      properties: {
        surface: "plan_weekly",
        outcome: "accepted",
        total_changes: 2,
        week_adjustment_count: 1,
        easy_only_day_count: 2,
      },
    },
    {
      name: "learned_preference_updated",
      properties: {
        action: "confirmed",
        preference_type: "schedule_preference",
        confidence: "high",
      },
    },
    {
      name: "demo_data_control_used",
      properties: {
        action: "seed",
        plan_weeks: 16,
        readiness_entries: 10,
        recommendation_events: 12,
      },
    },
    {
      name: "intake_lifecycle",
      properties: {
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
        latency_ms: 900,
        timed_out: false,
        change_count: 2,
        warning_count: 0,
      },
    },
    {
      name: "training_review_loaded",
      properties: {
        outcome: "success",
        window_days: 30,
        source: "deterministic",
        fallback_used: false,
        latency_ms: 400,
        timed_out: false,
        warning_count: 0,
        logged_sessions: 8,
      },
    },
    {
      name: "persistence_sync_completed",
      properties: {
        operation: "hydrate",
        outcome: "success",
        domain: "plan",
        cache_changed: true,
        latency_ms: 320,
      },
    },
    {
      name: "mobile_companion_sync_completed",
      properties: {
        platform: "ios",
        sync_type: "healthkit_readiness",
        outcome: "partial",
        permission_state: "partial",
        background_delivery: "enabled",
        coverage_bucket: "partial",
        confidence_bucket: "moderate",
        conflict: "none",
        latency_ms: 450,
      },
    },
    {
      name: "mobile_decision_validated",
      properties: {
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
        latency_ms: 620,
      },
    },
    {
      name: "mobile_intake_lifecycle",
      properties: {
        platform: "ios",
        action: "reviewed",
        outcome: "success",
        status: "ready",
        source: "ollama",
        fallback_used: false,
        latency_ms: 980,
        timed_out: false,
        change_count: 1,
        warning_count: 0,
        deterministic_validation: "not_run",
      },
    },
    {
      name: "mobile_checkin_synced",
      properties: {
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
        latency_ms: 180,
      },
    },
  ] as const;

  const unsafeExtras = {
    note: "raw note should never be persisted",
    email: "runner@example.com",
    uid: "firebase-uid",
    full_name: "Alex Runner",
    access_token: "secret-token",
    raw_calendar_event_text: "Doctor appointment at 2pm",
    workout_text: "raw workout text",
    biometric_sleep_hrv: "private biometrics",
  };

  for (const testCase of requiredEventCases) {
    trackProductEvent(
      testCase.name as never,
      { ...testCase.properties, ...unsafeExtras } as never,
    );
  }

  const coverageEvents = listProductEvents();
  const observedNames = new Set(coverageEvents.map((item) => item.name));
  for (const testCase of requiredEventCases) {
    expect(observedNames.has(testCase.name), `${testCase.name} should be tracked`);
  }
  for (const item of coverageEvents) {
    for (const unsafeKey of Object.keys(unsafeExtras)) {
      expect(
        !(unsafeKey in item.properties),
        `${item.name} should not persist sensitive key ${unsafeKey}`,
      );
    }
  }

  clearProductEvents();

  const event = trackProductEvent(
    "recommendation_response",
    {
      response: "accepted",
      selected_action: "modify",
      confidence_bucket: "moderate",
      staleness_warning_count: 0,
      note: "felt great but do not store raw notes",
      email: "runner@example.com",
      access_token: "secret",
      full_name: "Alex Runner",
      raw_calendar_event_text: "Doctor appointment",
      latency_ms: 123.45,
    } as never,
  );

  expect(event !== null, "expected event to be written");
  const first = listProductEvents()[0];
  expect(first?.name === "recommendation_response", "wrong event name");
  expect(first?.properties.response === "accepted", "safe response missing");
  expect(first?.properties.selected_action === "modify", "safe action missing");
  expect(!("latency_ms" in (first?.properties ?? {})), "unknown field should be dropped");
  expect(!("note" in (first?.properties ?? {})), "raw note should be dropped");
  expect(!("email" in (first?.properties ?? {})), "email should be dropped");
  expect(!("access_token" in (first?.properties ?? {})), "token should be dropped");
  expect(!("full_name" in (first?.properties ?? {})), "full name should be dropped");
  expect(!("raw_calendar_event_text" in (first?.properties ?? {})), "calendar text should be dropped");

  for (let i = 0; i < 205; i += 1) {
    trackProductEvent(
      "ai_status_checked",
      {
        outcome: "success",
        mode: "fallback",
        fallback_used: true,
        live_model_enabled: false,
        latency_ms: i,
        index: i,
      } as never,
    );
  }
  const capped = listProductEvents();
  expect(capped.length === 200, `expected cap of 200 events, got ${capped.length}`);
  expect(capped[0]?.properties.latency_ms === 5, "oldest events should be trimmed");
  expect(
    capped.every((item) => !("index" in item.properties)),
    "unknown fields must be dropped",
  );

  const bounded = trackProductEvent("training_review_loaded", {
    outcome: "success",
    window_days: 30,
    source: "unexpected-provider-name",
    fallback_used: false,
    latency_ms: 999_999,
    timed_out: false,
    warning_count: 999,
    logged_sessions: 99_999,
  });
  expect(bounded?.properties.source === "other", "source should be bucketed");
  expect(bounded?.properties.latency_ms === 120_000, "latency should be capped");
  expect(bounded?.properties.warning_count === 100, "warning count should be capped");
  expect(bounded?.properties.logged_sessions === 1_000, "session count should be capped");

  const mobileBounded = trackProductEvent("mobile_decision_validated", {
    platform: "ios",
    outcome: "success",
    decision_source: "unexpected-source",
    failure_state: "unexpected-failure",
    cache_state: "unexpected-cache",
    availability_source: "unexpected-availability",
    selected_action: "unexpected-action",
    confidence_bucket: "surprisingly-certain",
    calendar_state: "raw-calendar-state",
    readiness_state: "raw-readiness-state",
    deterministic_validation: "maybe",
    has_calendar_warning: true,
    has_recovery_warning: true,
    ai_assisted: true,
    latency_ms: 999_999,
  } as never);
  expect(
    mobileBounded?.properties.selected_action === "other",
    "mobile selected_action should be bucketed",
  );
  expect(
    mobileBounded?.properties.decision_source === "other" &&
      mobileBounded?.properties.failure_state === "other" &&
      mobileBounded?.properties.cache_state === "other" &&
      mobileBounded?.properties.availability_source === "other",
    "mobile source, failure, cache, and availability states should be bucketed",
  );
  expect(
    mobileBounded?.properties.confidence_bucket === "other",
    "mobile confidence should be bucketed",
  );
  expect(
    mobileBounded?.properties.calendar_state === "other",
    "mobile calendar state should be bucketed",
  );
  expect(
    mobileBounded?.properties.deterministic_validation === "other",
    "mobile validation state should be bucketed",
  );
  expect(
    mobileBounded?.properties.latency_ms === 120_000,
    "mobile latency should be capped",
  );

  clearProductEvents();
  expect(listProductEvents().length === 0, "clearProductEvents should empty the log");

  Object.defineProperty(globalThis, "window", {
    value: { localStorage: new FailingStorage() },
    configurable: true,
  });

  const isolated = trackProductEvent("persistence_sync_completed", {
    operation: "mirror",
    outcome: "failed",
    domain: "profile",
    cache_changed: false,
    latency_ms: 25,
  });
  expect(isolated !== null, "telemetry write failures should not block event creation");
  expect(listProductEvents().length === 0, "broken telemetry storage should read as empty");
  clearProductEvents();

  Object.defineProperty(globalThis, "window", {
    value: { localStorage: new MemoryStorage() },
    configurable: true,
  });

  if (errors.length > 0) {
    console.error("FAIL:");
    for (const error of errors) console.error("  -", error);
    process.exit(1);
  }

  console.log(
    "OK - product instrumentation covers all event families and stays local, capped, sanitized, and failure-isolated",
  );
}
