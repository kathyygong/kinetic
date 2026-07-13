import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertHealthSyncEnvelope,
  assertReadinessEntry,
  assertReadinessEnvelope,
  assertTombstone,
  resolveReadinessConflict,
  type DailySyncStatus,
  type SyncConflict,
} from "../lib/mobileReadinessContract";
import { coerceRemoteEnvelope } from "../lib/persistence/remoteDocumentValidation";
import type { ManualReadiness } from "../lib/readinessStorage";

type ConflictFixture = {
  name: string;
  existing: ManualReadiness | null;
  incoming: ManualReadiness;
  expected: {
    conflict: SyncConflict;
    status: DailySyncStatus;
    entry_to_write: ManualReadiness | null;
  };
};

export type MobileContractFixtures = {
  readiness_envelope: unknown;
  health_sync_envelope: unknown;
  readiness_tombstone: unknown;
  health_sync_tombstone: unknown;
  conflict_cases: ConflictFixture[];
};

export function loadMobileContractFixtures(): MobileContractFixtures {
  const path = resolve(
    process.cwd(),
    "../ios/KineticCompanion/Tests/Fixtures/mobile-readiness-contract.json",
  );
  return JSON.parse(readFileSync(path, "utf8")) as MobileContractFixtures;
}

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function expectJsonEqual(actual: unknown, expected: unknown, label: string) {
  expect(JSON.stringify(actual) === JSON.stringify(expected), `${label} did not match fixture`);
}

function main() {
  const fixtures = loadMobileContractFixtures();
  assertReadinessEnvelope(fixtures.readiness_envelope);
  assertHealthSyncEnvelope(fixtures.health_sync_envelope);
  assertTombstone(fixtures.readiness_tombstone, "readiness tombstone");
  assertTombstone(fixtures.health_sync_tombstone, "health sync tombstone");
  expect(
    coerceRemoteEnvelope("readiness", fixtures.readiness_envelope) !== null,
    "web persistence must accept the canonical mobile readiness envelope",
  );
  expect(
    coerceRemoteEnvelope("health_sync", fixtures.health_sync_envelope) !== null,
    "web persistence must accept the canonical mobile health sync envelope",
  );

  for (const fixture of fixtures.conflict_cases) {
    if (fixture.existing) assertReadinessEntry(fixture.existing, `${fixture.name}.existing`);
    assertReadinessEntry(fixture.incoming, `${fixture.name}.incoming`);
    const result = resolveReadinessConflict(fixture.existing, fixture.incoming);
    expect(result.conflict === fixture.expected.conflict, `${fixture.name} conflict mismatch`);
    expect(result.status === fixture.expected.status, `${fixture.name} status mismatch`);
    expectJsonEqual(result.entryToWrite, fixture.expected.entry_to_write, fixture.name);
  }

  const unsafeEnvelope = structuredClone(fixtures.readiness_envelope) as {
    payload: { entries: Record<string, Record<string, unknown>> };
  };
  unsafeEnvelope.payload.entries["2026-07-12"].raw_samples = [42];
  let rejected = false;
  try {
    assertReadinessEnvelope(unsafeEnvelope);
  } catch {
    rejected = true;
  }
  expect(rejected, "raw HealthKit samples must fail contract validation");
  expect(
    coerceRemoteEnvelope("readiness", unsafeEnvelope) === null,
    "web persistence must reject readiness envelopes containing raw samples",
  );

  const outOfBoundsEnvelope = structuredClone(fixtures.readiness_envelope) as {
    payload: { entries: Record<string, Record<string, unknown>> };
  };
  outOfBoundsEnvelope.payload.entries["2026-07-12"].hrv = 900;
  rejected = false;
  try {
    assertReadinessEnvelope(outOfBoundsEnvelope);
  } catch {
    rejected = true;
  }
  expect(rejected, "out-of-range readiness metrics must fail contract validation");
  expect(
    coerceRemoteEnvelope("readiness", outOfBoundsEnvelope) === null,
    "web persistence must reject impossible readiness metrics",
  );

  expect(
    coerceRemoteEnvelope("profile", {
      schemaVersion: 1,
      payload: { name: "Remote runner" },
      deleted: false,
      clientUpdatedAt: new Date().toISOString(),
    }) !== null,
    "non-mobile persistence domains should keep generic envelope behavior",
  );

  console.log(
    `OK - mobile readiness contract validated across ${fixtures.conflict_cases.length} deterministic conflict cases`,
  );
}

if (process.argv[1]?.includes("smoke-mobile-readiness-contract")) main();
