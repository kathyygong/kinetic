import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  MOBILE_CHECKIN_FIXTURE_SCHEMA,
  MOBILE_CHECKIN_SCHEMA,
  applyMobileCheckin,
  assertMobileCheckinRequest,
  assertRecommendationLog,
  assertWorkoutLog,
  buildMobileCheckinAudit,
  type MobileCheckinRequest,
  type MobileCheckinState,
} from "../lib/mobileCheckinContract";

type SuccessCase = {
  id: string;
  request: MobileCheckinRequest;
  expected_write_domains: string[];
  expected_readiness?: Record<string, unknown>;
  expected_event_id?: string;
  expected_status?: string;
  expected_effort?: number;
  expected_reflection?: string;
  expected_skip_reason?: string;
};

type FailureCase = {
  id: string;
  request: unknown;
  expected_failure: "invalid_payload" | "state_conflict";
};

export type MobileCheckinFixture = {
  schema_version: string;
  contract_schema: string;
  now: string;
  state: MobileCheckinState;
  success_cases: SuccessCase[];
  failure_cases: FailureCase[];
  privacy_forbidden_keys: string[];
};

export function loadMobileCheckinFixture(): MobileCheckinFixture {
  return JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "../ios/KineticCompanion/Tests/Fixtures/mobile-checkin-contract.json",
      ),
      "utf8",
    ),
  ) as MobileCheckinFixture;
}

const fixture = loadMobileCheckinFixture();
assert.equal(fixture.schema_version, MOBILE_CHECKIN_FIXTURE_SCHEMA);
assert.equal(fixture.contract_schema, MOBILE_CHECKIN_SCHEMA);
const now = new Date(fixture.now);

for (const testCase of fixture.success_cases) {
  const stateBefore = JSON.stringify(fixture.state);
  const requestBefore = JSON.stringify(testCase.request);
  const first = applyMobileCheckin(testCase.request, fixture.state, now);
  assert.equal(JSON.stringify(fixture.state), stateBefore, `${testCase.id} mutated state`);
  assert.equal(
    JSON.stringify(testCase.request),
    requestBefore,
    `${testCase.id} mutated request`,
  );
  assert.deepEqual(first.write_domains, testCase.expected_write_domains);
  assert.equal(first.audit.outcome, "success");
  assert.equal(first.audit.failure_state, "none");
  assert.equal(first.audit.deterministic_validation, "passed");

  if (testCase.expected_readiness) {
    assert.deepEqual(
      first.readiness?.entries[testCase.request.local_day],
      testCase.expected_readiness,
    );
    assert.equal(first.workouts, fixture.state.workouts);
    assert.equal(first.recommendations, fixture.state.recommendations);
  }

  if (testCase.expected_event_id) {
    assertWorkoutLog(first.workouts);
    assertRecommendationLog(first.recommendations);
    const entry = first.workouts.entries.find(
      (item) =>
        item.weekNumber === 3 &&
        item.day === "Mon",
    );
    assert.equal(entry?.status, testCase.expected_status);
    const event = first.recommendations.events[testCase.expected_event_id];
    assert.ok(event);
    assert.equal(event.actualWorkout?.perceivedEffort, testCase.expected_effort);
    assert.equal(
      event.actualWorkout?.reflectionCategory,
      testCase.expected_reflection,
    );
    assert.equal(event.actualWorkout?.skipReason, testCase.expected_skip_reason);

    const replayState: MobileCheckinState = {
      ...fixture.state,
      workouts: first.workouts,
      recommendations: first.recommendations,
    };
    const replay = applyMobileCheckin(testCase.request, replayState, now);
    assert.deepEqual(replay.workouts, first.workouts, `${testCase.id} is not idempotent`);
    assert.deepEqual(
      replay.recommendations,
      first.recommendations,
      `${testCase.id} recommendation is not idempotent`,
    );
  }
}

for (const testCase of fixture.failure_cases) {
  assert.throws(
    () => applyMobileCheckin(testCase.request, fixture.state, now),
    Error,
    testCase.id,
  );
}

const goalConflictState: MobileCheckinState = {
  ...fixture.state,
  workouts: { goalSig: "different-goal", entries: [] },
};
const workoutRequest = fixture.success_cases.find(
  (item) => item.request.kind === "workout_outcome",
)?.request;
assert.ok(workoutRequest);
assert.throws(() => applyMobileCheckin(workoutRequest, goalConflictState, now));

const recoveryRequest = fixture.success_cases[0].request;
assertMobileCheckinRequest(recoveryRequest);
const audit = buildMobileCheckinAudit(recoveryRequest, {
  outcome: "failed",
  failure_state: "permission_denied",
  write_scope: "none",
  deterministic_validation: "passed",
  update_succeeded: false,
  latency_ms: 999_999,
});
assert.equal(audit.latency_ms, 120_000);
assert.deepEqual(Object.keys(audit).sort(), [
  "checkin_kind",
  "deterministic_validation",
  "failure_state",
  "has_effort",
  "has_user_reflection",
  "latency_ms",
  "outcome",
  "platform",
  "status",
  "update_succeeded",
  "write_scope",
]);
const auditJson = JSON.stringify(audit).toLowerCase();
for (const forbidden of fixture.privacy_forbidden_keys) {
  assert.equal(
    Object.prototype.hasOwnProperty.call(audit, forbidden),
    false,
    `audit exposed ${forbidden}`,
  );
}
assert.equal(auditJson.includes("private prose"), false);

for (const failureState of [
  "auth_required",
  "offline",
  "timeout",
  "invalid_payload",
  "state_conflict",
  "permission_denied",
  "unknown",
] as const) {
  const failureAudit = buildMobileCheckinAudit(recoveryRequest, {
    outcome: failureState === "timeout" ? "timeout" : "failed",
    failure_state: failureState,
    write_scope: "none",
    deterministic_validation:
      failureState === "invalid_payload" || failureState === "state_conflict"
        ? "failed"
        : "not_run",
    update_succeeded: false,
    latency_ms: 25,
  });
  assert.equal(failureAudit.failure_state, failureState);
  assert.equal(failureAudit.write_scope, "none");
  assert.equal(failureAudit.update_succeeded, false);
}

console.log("mobile check-in contract smoke checks passed");
