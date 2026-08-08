import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  generationResponseToPlanWeeks,
  parseMobilePlanGenerationResponse,
} from "../lib/mobilePlanGenerationContract";

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const fixture = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      "../ios/KineticCompanion/Tests/Fixtures/mobile-plan-generation-contract.json",
    ),
    "utf8",
  ),
) as { initial_response: unknown };

const parsed = parseMobilePlanGenerationResponse(fixture.initial_response);
const weeks = generationResponseToPlanWeeks(parsed);
expect(parsed.source === "deterministic_shared", "shared source drifted");
expect(weeks.length === 4, "canonical week count drifted");
expect(weeks[0]?.phase === "build", "build metadata drifted");
expect(weeks.at(-1)?.phase === "race", "race metadata drifted");
expect(weeks.at(-1)?.workouts.at(-1)?.type === "race", "race workout conversion drifted");

const malformed = structuredClone(fixture.initial_response) as Record<string, unknown>;
malformed.email = "runner@example.com";
let rejected = false;
try {
  parseMobilePlanGenerationResponse(malformed);
} catch {
  rejected = true;
}
expect(rejected, "generation parser accepted a private/extra field");

console.log(
  "OK - mobile plan generation fixture, strict parser, authoritative phases, and web conversion",
);
