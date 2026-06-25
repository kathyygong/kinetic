// Smoke test for dashboard demo seed/reset helpers.
//
// The helpers are client-side localStorage writers, so this script shims a
// tiny Storage implementation before dynamically importing the modules.

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
  const [
    { seedDemoData, resetDemoData, clearDemoLearning },
    storage,
    profile,
    readiness,
    behavior,
  ] = await Promise.all([
    import("../lib/demoData"),
    import("../lib/storage"),
    import("../lib/profileStorage"),
    import("../lib/readinessStorage"),
    import("../lib/behaviorStorage"),
  ]);

  const fixedNow = new Date("2026-06-25T12:00:00");
  const errors: string[] = [];

  function expect(condition: boolean, message: string): void {
    if (!condition) errors.push(message);
  }

  const seeded = seedDemoData(fixedNow);
  const goal = storage.getGoal();
  const savedPlan = storage.getSavedPlan();
  const userProfile = profile.getUserProfile();
  const readinessEntries = Object.values(readiness.getReadinessLog().entries);
  const events = behavior.listRecommendationEvents();

  expect(seeded.planWeeks >= 4, `expected >=4 plan weeks, got ${seeded.planWeeks}`);
  expect(seeded.recommendationEvents === 6, `expected 6 behavior events, got ${seeded.recommendationEvents}`);
  expect(goal?.race_distance === "half", `expected half marathon goal, got ${goal?.race_distance}`);
  expect(goal?.target_date === "2026-10-15", `expected target date 2026-10-15, got ${goal?.target_date}`);
  expect(savedPlan?.weeks.length === seeded.planWeeks, "saved plan did not match seeded week count");
  expect(userProfile?.onboarding_completed === true, "profile should be onboarding complete");
  expect(userProfile?.connected_services.google_calendar.connected === false, "demo profile should not fake Google Calendar");
  expect(readinessEntries.length === 5, `expected 5 readiness entries, got ${readinessEntries.length}`);
  expect(events.length === 6, `expected 6 recommendation events, got ${events.length}`);
  expect(events.filter((event) => event.context.calendarLoad === "heavy").length >= 4, "expected heavy-calendar behavior history");
  expect(behavior.listLearnedPreferences().length === 0, "seed should leave learned preferences empty");

  behavior.saveLearnedPreference({
    id: "demo_pref",
    type: "busy_day_preference",
    description: "Use shorter workouts on heavy-calendar days.",
    confidence: "moderate",
    userConfirmed: true,
    createdAt: fixedNow.toISOString(),
  });
  expect(behavior.listLearnedPreferences().length === 1, "preference setup failed");
  clearDemoLearning();
  expect(behavior.listLearnedPreferences().length === 0, "clearDemoLearning should clear preferences");
  expect(behavior.listRecommendationEvents().length === 6, "clearDemoLearning should preserve recommendation history");

  const reset = resetDemoData(fixedNow);
  expect(reset.recommendationEvents === 6, `reset expected 6 behavior events, got ${reset.recommendationEvents}`);
  expect(behavior.listRecommendationEvents().length === 6, "reset should replace, not duplicate, behavior history");

  if (errors.length > 0) {
    console.error("FAIL:");
    for (const error of errors) console.error("  -", error);
    process.exit(1);
  }

  console.log("OK - demo seed/reset/clear-learning helpers are repeatable");
}
