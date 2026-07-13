import type { CurrentPRs, RaceDistance } from "../lib/types";

type RaceTimesInMinutes = Partial<Record<RaceDistance, number>>;

/** Convert human-readable fixture times into the canonical integer-seconds contract. */
export function prsFromMinutes(
  values: RaceTimesInMinutes,
): Partial<CurrentPRs> {
  const result: Partial<CurrentPRs> = {};
  for (const distance of Object.keys(values) as RaceDistance[]) {
    const minutes = values[distance];
    if (minutes === undefined) continue;
    if (!Number.isFinite(minutes) || minutes <= 0) {
      throw new Error(`Invalid ${distance} fixture time: ${minutes}`);
    }
    result[distance] = Math.round(minutes * 60);
  }
  return result;
}
