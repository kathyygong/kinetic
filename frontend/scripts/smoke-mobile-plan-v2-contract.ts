import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  parseMobileAccountCleanupResponse,
  parseMobilePlanGenerationResponseV2,
  parseMobilePlanLifecycleRequestV2,
  parseMobilePlanLifecycleResponseV2,
} from "../lib/mobilePlanV2Contract";

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const fixtures = resolve(process.cwd(), "../ios/KineticCompanion/Tests/Fixtures");
const shared = JSON.parse(readFileSync(resolve(fixtures, "mobile-plan-shared-v2-contract.json"), "utf8"));
const lifecycle = JSON.parse(readFileSync(resolve(fixtures, "mobile-plan-lifecycle-contract.json"), "utf8"));
const plan = structuredClone(lifecycle.commit_move_response.commit_plan);
plan.metadata = {
  plan_version: 4,
  weeks: [
    { week_number: 1, phase: "build", start_date: "2026-08-03", end_date: "2026-08-09", workout_ids: ["workout-completed-001"], explanation_codes: ["base_volume", "preferred_days_applied", "weekly_availability_applied"] },
    { week_number: 2, phase: "build", start_date: "2026-08-10", end_date: "2026-08-16", workout_ids: ["workout-future-002"], explanation_codes: ["base_volume", "preferred_days_applied", "weekly_availability_applied"] },
    { week_number: 3, phase: "race", start_date: "2026-09-14", end_date: "2026-09-20", workout_ids: ["workout-race-003"], explanation_codes: ["base_volume", "preferred_days_applied", "weekly_availability_applied", "race_week"] },
  ],
  explanation_codes: ["base_volume", "preferred_days_applied", "weekly_availability_applied", "race_week"],
};

const generation = parseMobilePlanGenerationResponseV2({
  schema_version: "mobile-plan-generation.v2", mode: "initial", source: "deterministic_shared",
  mutation_performed: false, candidate_plan: plan,
});
expect(generation.candidate_plan.metadata.plan_version === generation.candidate_plan.version, "metadata version drifted");

const response = {
  ...lifecycle.commit_move_response,
  schema_version: "mobile-plan-lifecycle.v2",
  commit_plan: plan,
  commit_planning_inputs: shared.planning_inputs,
  persistence: {
    required: true,
    owner_scoped_domains: ["profile", "goal", "plan", "plan_history", "plan_operations"],
    transaction_preconditions: ["authenticated_owner", "current_version_matches", "planning_revision_matches", "operation_id_absent_or_matching"],
  },
};
parseMobilePlanLifecycleRequestV2({
  ...lifecycle.commit_move_request,
  schema_version: "mobile-plan-lifecycle.v2",
  platform: "web",
  proposed_plan: plan,
  current_planning_inputs: shared.planning_inputs,
  proposed_planning_inputs: shared.planning_inputs,
});
parseMobilePlanLifecycleResponseV2(response);

const cleanup = parseMobileAccountCleanupResponse({
  schema_version: "mobile-account-cleanup.v1", result: "progress",
  mutation_performed: true, receipt: shared.ready_receipt,
});
expect(cleanup.receipt.pending_domains.length === 0, "ready receipt still has domains");

let rejected = false;
try {
  const malformed = structuredClone(response);
  malformed.commit_planning_inputs.weekly_availability[0].available_minutes = 241;
  parseMobilePlanLifecycleResponseV2(malformed);
} catch { rejected = true; }
expect(rejected, "availability escaped the 0-240 minute bound");

rejected = false;
try {
  const stale = structuredClone(response);
  stale.commit_plan.metadata.plan_version = 3;
  parseMobilePlanLifecycleResponseV2(stale);
} catch { rejected = true; }
expect(rejected, "stale metadata version was accepted");

console.log("OK - v2 metadata persistence, bounded availability, coordinated transaction, and cleanup receipt parsers");
