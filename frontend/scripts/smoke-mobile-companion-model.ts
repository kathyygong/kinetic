import {
  buildMobileDecision,
  CALENDAR_CONTEXTS,
  confidenceBucketFor,
  INTAKE_COPY,
  readinessStateFor,
  SCENARIOS,
  selectedActionFor,
  STATUS_COPY,
  type CalendarState,
  type SyncState,
} from "../lib/mobileCompanionModel";

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function expectDecision(
  syncState: SyncState,
  calendarState: CalendarState,
  expected: {
    action: ReturnType<typeof selectedActionFor>;
    confidence: ReturnType<typeof confidenceBucketFor>;
    primary: string;
    readiness: ReturnType<typeof readinessStateFor>;
    title: string;
  },
) {
  const decision = buildMobileDecision(syncState, calendarState);
  expect(decision.title === expected.title, `${syncState}/${calendarState} title mismatch`);
  expect(decision.primary === expected.primary, `${syncState}/${calendarState} primary mismatch`);
  expect(
    selectedActionFor(syncState, calendarState) === expected.action,
    `${syncState}/${calendarState} action mismatch`,
  );
  expect(
    confidenceBucketFor(syncState) === expected.confidence,
    `${syncState}/${calendarState} confidence mismatch`,
  );
  expect(
    readinessStateFor(syncState) === expected.readiness,
    `${syncState}/${calendarState} readiness mismatch`,
  );
  expect(
    decision.reasons.length >= 3,
    `${syncState}/${calendarState} should explain the recommendation`,
  );
}

function main() {
  expect(Object.keys(SCENARIOS).length === 3, "expected three HealthKit states");
  expect(Object.keys(CALENDAR_CONTEXTS).length === 3, "expected three calendar states");
  expect(STATUS_COPY.skipped === "Skipped without changing the plan", "skip copy must stay safe");
  expect(
    INTAKE_COPY.applied === "Draft applied after deterministic validation",
    "intake confirmation must name deterministic validation",
  );

  expectDecision("synced", "clear", {
    action: "proceed",
    confidence: "high",
    primary: "Run the planned session",
    readiness: "ready",
    title: "Tempo intervals",
  });
  expectDecision("stale", "clear", {
    action: "modify",
    confidence: "moderate",
    primary: "Use the scaled option",
    readiness: "stale",
    title: "Short aerobic run",
  });
  expectDecision("denied", "clear", {
    action: "unknown",
    confidence: "low",
    primary: "Log readiness",
    readiness: "unknown",
    title: "Manual check-in first",
  });
  expectDecision("denied", "conflict", {
    action: "unknown",
    confidence: "low",
    primary: "Log readiness",
    readiness: "unknown",
    title: "Manual check-in first",
  });
  expectDecision("synced", "conflict", {
    action: "modify",
    confidence: "high",
    primary: "Apply safe adjustment",
    readiness: "ready",
    title: "Scale to 30 min easy",
  });
  expectDecision("synced", "stale", {
    action: "modify",
    confidence: "high",
    primary: "Review schedule",
    readiness: "ready",
    title: "Confirm schedule first",
  });

  console.log("OK - mobile companion state model preserves safety-first Today decisions");
}

void main();
