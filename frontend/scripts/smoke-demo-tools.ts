import { areDemoToolsEnabled } from "../lib/demoTools";

const cases: Array<[string | undefined, boolean]> = [
  [undefined, false],
  ["", false],
  ["false", false],
  ["TRUE", false],
  ["true", true],
];

const failures = cases
  .map(([value, expected]) => ({ value, expected, actual: areDemoToolsEnabled(value) }))
  .filter((result) => result.actual !== result.expected);

if (failures.length > 0) {
  console.error("FAIL - demo tools flag accepted an unsafe value");
  for (const failure of failures) {
    console.error(
      `  value=${JSON.stringify(failure.value)} expected=${failure.expected} actual=${failure.actual}`,
    );
  }
  process.exit(1);
}

console.log("OK - demo tools are hidden unless explicitly enabled");
