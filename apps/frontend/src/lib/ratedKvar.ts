/**
 * Temporary. HMI sends moduleCapacity as 3*V*I/1000 instead of the rated table.
 * Snap a nearby value to the integer kvar from amp_to_kvar_from_table.
 * 15A→10, 25A→17, 50A→35, 75A→50, 100A→65, 125A→85, 150A→100, 200A→135.
 */
export const RATED_KVAR_TABLE = [10, 17, 35, 50, 65, 85, 100, 135] as const;

function halfwayLimit(index: number): number {
  const rated = RATED_KVAR_TABLE[index];
  const prev = index > 0 ? RATED_KVAR_TABLE[index - 1] : null;
  const next =
    index < RATED_KVAR_TABLE.length - 1 ? RATED_KVAR_TABLE[index + 1] : null;
  const toPrev = prev == null ? Number.POSITIVE_INFINITY : (rated - prev) / 2;
  const toNext = next == null ? Number.POSITIVE_INFINITY : (next - rated) / 2;
  return Math.min(toPrev, toNext);
}

/** Closest table kvar when the value sits nearer that rating than the next one. */
export function snapNearRatedKvar(value: number): number {
  if (!Number.isFinite(value)) return value;
  let bestIndex = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < RATED_KVAR_TABLE.length; i++) {
    const dist = Math.abs(value - RATED_KVAR_TABLE[i]);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
  }
  if (bestDist <= halfwayLimit(bestIndex)) return RATED_KVAR_TABLE[bestIndex];
  return value;
}

export function displayModuleCapacity(value: number, capUnit?: string): number {
  if (capUnit === "A") return value;
  return snapNearRatedKvar(value);
}

export function sumModuleCapacity(
  values?: number[] | null,
  capUnit?: string,
): number | null {
  if (!values?.length) return null;
  let sum = 0;
  let count = 0;
  for (const value of values) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    sum += displayModuleCapacity(value, capUnit);
    count += 1;
  }
  return count > 0 ? sum : null;
}
