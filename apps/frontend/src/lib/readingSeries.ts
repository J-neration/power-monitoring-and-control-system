import type { TelemetryReading } from "../types/site";

export function sortedReadings(readings: TelemetryReading[]): TelemetryReading[] {
  return [...readings].sort(
    (a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt),
  );
}

export function readingSeries(
  readings: TelemetryReading[],
  pick: (r: TelemetryReading) => number | null | undefined,
  limit = 24,
): number[] {
  return sortedReadings(readings)
    .map(pick)
    .filter((v): v is number => v != null && Number.isFinite(v))
    .slice(-limit);
}
