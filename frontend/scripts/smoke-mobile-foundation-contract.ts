import fs from "node:fs";
import path from "node:path";
import {
  buildAccountDeletionBoundary,
  parseMobileFoundationState,
  type MobileFoundationState,
} from "../lib/mobileFoundationContract";

type Fixture = {
  schema_version: string;
  active_state: unknown;
  new_runner_state: unknown;
};

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectRejected(action: () => unknown, message: string): void {
  try {
    action();
  } catch {
    return;
  }
  throw new Error(message);
}

export function loadMobileFoundationFixture(): Fixture {
  const fixturePath = path.resolve(
    process.cwd(),
    "../ios/KineticCompanion/Tests/Fixtures/mobile-foundation-contract.json",
  );
  return JSON.parse(fs.readFileSync(fixturePath, "utf8")) as Fixture;
}

function main(): void {
  const fixture = loadMobileFoundationFixture();
  expect(fixture.schema_version === "mobile-foundation.v1", "schema drift");
  const active = parseMobileFoundationState(fixture.active_state);
  const newRunner = parseMobileFoundationState(fixture.new_runner_state);
  expect(active.route === "today", "returning runner route drift");
  expect(newRunner.route === "onboarding", "new runner route drift");
  expect(
    newRunner.onboarding.deferred_permissions.length === 3,
    "permissions must remain progressive and deferrable",
  );

  const deletion = buildAccountDeletionBoundary(
    active,
    "2026-07-30T16:00:00.000Z",
  );
  parseMobileFoundationState(deletion);
  expect(!deletion.settings.evening_checkin_reminder.enabled, "deletion disables reminders");
  expect(
    deletion.deletion.pending_domains.includes("plan_history") &&
      deletion.deletion.pending_domains.includes("plan_operations"),
    "account deletion must cover lifecycle history",
  );

  expectRejected(
    () =>
      parseMobileFoundationState({
        ...active,
        settings: {
          ...active.settings,
          evening_checkin_reminder: {
            ...active.settings.evening_checkin_reminder,
            enabled: true,
          },
        },
        permissions: { ...active.permissions, notifications: "denied" },
      }),
    "denied notifications enabled a reminder",
  );
  expectRejected(
    () =>
      parseMobileFoundationState({
        ...active,
        onboarding: { ...active.onboarding, raw_medical_note: "private" },
      } as unknown as MobileFoundationState),
    "sensitive extension key was accepted",
  );
  expectRejected(
    () =>
      parseMobileFoundationState({
        ...newRunner,
        route: "today",
      }),
    "incomplete onboarding escaped to the product shell",
  );
  console.log(
    "OK - mobile foundation contract covers onboarding, progressive permissions, migration, reminder settings, and deletion",
  );
}

main();
