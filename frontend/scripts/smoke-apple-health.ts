import {
  getReadinessForDate,
  READINESS_STORAGE_KEY,
} from "../lib/readinessStorage";
import { importAppleHealthCsv } from "../lib/integrations/appleHealth";

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

const csv = [
  "date,sleep_hours,hrv_ms,resting_heart_rate,note",
  "2026-07-08,7.5,54,49,private Apple Health note",
  "2026-07-09,6.25,48,53,another private note",
  "not-a-date,7,50,50,skip me",
].join("\n");

const result = importAppleHealthCsv(csv);
const first = getReadinessForDate("2026-07-08");
const second = getReadinessForDate("2026-07-09");
const raw = window.localStorage.getItem(READINESS_STORAGE_KEY) ?? "";

function expect(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL - ${message}`);
    process.exit(1);
  }
}

expect(result.importedCount === 2, "expected two imported readiness rows");
expect(result.skippedRows === 1, "expected one skipped row");
expect(result.latestDate === "2026-07-09", "latest date drifted");
expect(first?.sleep_hours === 7.5, "sleep hours not imported");
expect(first?.hrv === 54, "HRV not imported");
expect(second?.resting_hr === 53, "resting HR not imported");
expect(!raw.includes("private Apple Health note"), "raw note leaked into readiness storage");

console.log("OK - Apple Health CSV import maps bounded metrics and drops notes");
