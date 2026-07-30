import fs from "node:fs";
import path from "node:path";
import {
  parseMobilePlanLifecycleRequest,
  parseMobilePlanLifecycleResponse,
} from "../lib/mobilePlanLifecycleContract";

type Fixture = {
  schema_version: string;
  commit_move_request: unknown;
  commit_move_response: unknown;
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

export function loadMobilePlanLifecycleFixture(): Fixture {
  const fixturePath = path.resolve(
    process.cwd(),
    "../ios/KineticCompanion/Tests/Fixtures/mobile-plan-lifecycle-contract.json",
  );
  return JSON.parse(fs.readFileSync(fixturePath, "utf8")) as Fixture;
}

function main(): void {
  const fixture = loadMobilePlanLifecycleFixture();
  expect(fixture.schema_version === "mobile-plan-lifecycle.v1", "schema drift");
  const request = parseMobilePlanLifecycleRequest(fixture.commit_move_request);
  const response = parseMobilePlanLifecycleResponse(fixture.commit_move_response);
  expect(request.mode === "commit", "canonical mutation must exercise commit");
  expect(response.result === "commit_ready", "canonical mutation was rejected");
  expect(response.mutation_performed === false, "API must remain storage-neutral");
  expect(
    response.impact.completed_workouts_preserved === 1,
    "completed history was not preserved",
  );
  expect(
    response.persistence.transaction_preconditions.includes("current_version_matches"),
    "optimistic concurrency requirement missing",
  );
  expect(
    response.persistence.transaction_preconditions.includes("operation_id_absent_or_matching"),
    "idempotency requirement missing",
  );

  const requestObject = request as unknown as Record<string, unknown>;
  expectRejected(
    () =>
      parseMobilePlanLifecycleRequest({
        ...requestObject,
        raw_health_data: { hrv: 45 },
      }),
    "sensitive request extension was accepted",
  );
  const responseObject = response as unknown as Record<string, unknown>;
  expectRejected(
    () =>
      parseMobilePlanLifecycleResponse({
        ...responseObject,
        result: "rejected",
        persistence: { ...response.persistence, required: true },
      }),
    "rejected response requested persistence",
  );
  const proposed = request.proposed_plan;
  expectRejected(
    () =>
      parseMobilePlanLifecycleRequest({
        ...request,
        proposed_plan: {
          ...proposed,
          workouts: [...proposed.workouts, proposed.workouts[0]],
        },
      }),
    "duplicate workout identity was accepted",
  );
  console.log(
    "OK - mobile plan lifecycle contract covers commit packaging, history, versioning, idempotency, and privacy",
  );
}

main();
