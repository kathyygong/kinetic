import {
  saveReadinessForDate,
  type FatigueLevel,
  type ManualReadiness,
  type SorenessLevel,
} from "@/lib/readinessStorage";

export type AppleHealthImportResult = {
  importedCount: number;
  skippedRows: number;
  latestDate?: string;
  warnings: string[];
};

type ReadinessPatch = Omit<Partial<ManualReadiness>, "date" | "updated_at">;
type CsvReadinessField = Exclude<keyof ReadinessPatch, "source">;

const HEADER_ALIASES: Record<CsvReadinessField, string[]> = {
  sleep_hours: ["sleep_hours", "sleep", "asleep_hours", "time_asleep_hours"],
  hrv: ["hrv", "hrv_ms", "heart_rate_variability", "heart_rate_variability_ms"],
  resting_hr: ["resting_hr", "resting_heart_rate", "rhr", "resting_bpm"],
  fatigue_level: ["fatigue_level", "fatigue"],
  soreness_level: ["soreness_level", "soreness"],
};

export function importAppleHealthCsv(text: string): AppleHealthImportResult {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return {
      importedCount: 0,
      skippedRows: 0,
      warnings: ["No Apple Health rows found."],
    };
  }

  const header = rows[0].map(normalizeHeader);
  const dateIndex = header.findIndex((name) =>
    ["date", "start_date", "day"].includes(name),
  );
  if (dateIndex < 0) {
    return {
      importedCount: 0,
      skippedRows: rows.length - 1,
      warnings: ["CSV must include a date column."],
    };
  }

  const fieldIndexes = Object.fromEntries(
    (Object.keys(HEADER_ALIASES) as CsvReadinessField[]).map((field) => [
      field,
      findHeaderIndex(header, HEADER_ALIASES[field]),
    ]),
  ) as Record<CsvReadinessField, number>;

  let importedCount = 0;
  let skippedRows = 0;
  let latestDate: string | undefined;

  for (const row of rows.slice(1)) {
    const date = normalizeDate(row[dateIndex]);
    if (!date) {
      skippedRows += 1;
      continue;
    }

    const patch: ReadinessPatch = {};
    const sleep = readNumber(row, fieldIndexes.sleep_hours, 0, 24);
    const hrv = readNumber(row, fieldIndexes.hrv, 1, 300);
    const restingHr = readNumber(row, fieldIndexes.resting_hr, 20, 220);
    const fatigue = readLevel(row, fieldIndexes.fatigue_level);
    const soreness = readLevel(row, fieldIndexes.soreness_level);

    if (sleep !== undefined) patch.sleep_hours = sleep;
    if (hrv !== undefined) patch.hrv = hrv;
    if (restingHr !== undefined) patch.resting_hr = restingHr;
    if (fatigue !== undefined) patch.fatigue_level = fatigue;
    if (soreness !== undefined) patch.soreness_level = soreness;
    patch.source = "apple_health_csv";

    if (Object.keys(patch).length <= 1) {
      skippedRows += 1;
      continue;
    }

    saveReadinessForDate(date, patch);
    importedCount += 1;
    if (!latestDate || date > latestDate) latestDate = date;
  }

  return {
    importedCount,
    skippedRows,
    latestDate,
    warnings:
      importedCount > 0
        ? []
        : ["No supported Apple Health metrics were found."],
  };
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  row.push(cell.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function findHeaderIndex(header: string[], aliases: string[]): number {
  return header.findIndex((name) => aliases.includes(name));
}

function normalizeDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const iso = raw.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (iso) return iso;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function readNumber(
  row: string[],
  index: number,
  min: number,
  max: number,
): number | undefined {
  if (index < 0) return undefined;
  const value = Number(row[index]);
  if (!Number.isFinite(value) || value < min || value > max) return undefined;
  return Number(value.toFixed(2));
}

function readLevel(
  row: string[],
  index: number,
): FatigueLevel | SorenessLevel | undefined {
  const value = readNumber(row, index, 1, 5);
  if (value === undefined || !Number.isInteger(value)) return undefined;
  return value as FatigueLevel | SorenessLevel;
}
