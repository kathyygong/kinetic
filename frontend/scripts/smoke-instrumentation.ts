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

  clearProductEvents();
  expect(listProductEvents().length === 0, "clearProductEvents should empty the log");

  if (errors.length > 0) {
    console.error("FAIL:");
    for (const error of errors) console.error("  -", error);
    process.exit(1);
  }

  console.log("OK - product instrumentation is local, capped, and sanitized");
}
