import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  EVENING_CHECKIN_BODY,
  EVENING_CHECKIN_TITLE,
  MOBILE_NOTIFICATION_FIXTURE_SCHEMA,
  MOBILE_NOTIFICATION_SCHEMA,
  decideMobileNotification,
  type MobileNotificationAction,
  type MobileNotificationReason,
  type MobileNotificationRequest,
} from "../lib/mobileNotificationContract";

type SuccessCase = {
  id: string;
  request: MobileNotificationRequest;
  expected_action: MobileNotificationAction;
  expected_reason: MobileNotificationReason;
};

type FailureCase = {
  id: string;
  request: unknown;
};

type MobileNotificationFixture = {
  schema_version: string;
  contract_schema: string;
  success_cases: SuccessCase[];
  failure_cases: FailureCase[];
  forbidden_lock_screen_terms: string[];
};

const fixture = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      "../ios/KineticCompanion/Tests/Fixtures/mobile-notification-contract.json",
    ),
    "utf8",
  ),
) as MobileNotificationFixture;

assert.equal(fixture.schema_version, MOBILE_NOTIFICATION_FIXTURE_SCHEMA);
assert.equal(fixture.contract_schema, MOBILE_NOTIFICATION_SCHEMA);

for (const testCase of fixture.success_cases) {
  const before = JSON.stringify(testCase.request);
  const result = decideMobileNotification(testCase.request);
  assert.equal(
    JSON.stringify(testCase.request),
    before,
    `${testCase.id} mutated its request`,
  );
  assert.equal(result.action, testCase.expected_action, testCase.id);
  assert.equal(result.reason, testCase.expected_reason, testCase.id);
  assert.equal(result.lock_screen_copy, "generic", testCase.id);

  if (result.action === "schedule") {
    assert.equal(result.title, EVENING_CHECKIN_TITLE);
    assert.equal(result.body, EVENING_CHECKIN_BODY);
    assert.equal(result.target_at, testCase.request.target_at);
    assert.equal(
      result.notification_identifier,
      `kinetic.evening-checkin.${testCase.request.local_day}`,
    );
    const lockScreenCopy = `${result.title} ${result.body}`.toLowerCase();
    for (const term of fixture.forbidden_lock_screen_terms) {
      assert.equal(
        lockScreenCopy.includes(term.toLowerCase()),
        false,
        `lock-screen copy exposed ${term}`,
      );
    }
  } else {
    assert.equal(result.title, null);
    assert.equal(result.body, null);
    assert.equal(result.target_at, null);
  }
}

for (const testCase of fixture.failure_cases) {
  assert.throws(
    () => decideMobileNotification(testCase.request),
    Error,
    testCase.id,
  );
}

assert.deepEqual(
  new Set(fixture.success_cases.map((item) => item.expected_action)),
  new Set(["request_permission", "schedule", "cancel", "none"]),
);

console.log(
  "mobile notification contract smoke checks passed: opt-in, permission, eligibility, cancellation, and lock-screen privacy",
);
