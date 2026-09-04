/**
 * HMI basic-settings allowed JSON keys by moduleType.
 * Keep in sync with apps/frontend/src/lib/deviceSettingsFields.ts
 */

export type ModuleType = "v1v2" | "v3v4" | "v5";

/** v3v4 (200A) — exactly these 7. */
export const ALLOWED_KEYS_V3V4: ReadonlySet<string> = new Set([
  "reactiveSwitch",
  "harmSwitch",
  "imbSwitch",
  "ectp",
  "k0",
  "ccr",
  "tpf",
]);

/** v1v2 (150A Gray) common basic. */
export const ALLOWED_KEYS_V1V2: ReadonlySet<string> = new Set([
  "ectp",
  "ectrs",
  "ictrs",
  "pcs",
  "ccr",
  "tpf",
  "cm",
  "apro",
  "bpro",
  "cpro",
  "reactiveSwitch",
  "harmSwitch",
  "imbSwitch",
  "reactiveCapacity",
  "numOfMods",
]);

/** v5 SIC sic_mod_setting. No v1v2/v3v4-only switches or ictrs/pcs/cm/pro. */
export const ALLOWED_KEYS_V5: ReadonlySet<string> = new Set([
  "ectp",
  "ectrs",
  "ccr",
  "tpf",
  "numOfMods",
  "compMode",
  "startupMethod",
  "harmonicMode",
  "reactiveRatio",
  "imbalanceRatio",
  "phaseAdaption",
  "wiring",
  "priorityMode",
]);

/** HMI labels in index order. Display/store these strings, not free text. */
export const V5_ENUM_LABELS: Record<string, readonly string[]> = {
  compMode: [
    "Flat",
    "Harmonic",
    "Reactive",
    "Harm+Reactive",
    "Unbalance",
    "Harm+Unbalance",
    "React+Unbalance",
    "All",
  ],
  startupMethod: ["Manual", "Auto"],
  harmonicMode: ["Auto", "Selective"],
  phaseAdaption: ["Close", "On"],
  wiring: ["3P4L", "3P3L"],
  priorityMode: ["None", "Harm", "React", "Unb"],
};

/** wiring 0/1 is not 3P4L/3P3L — never remap. */
const V5_NO_INDEX_MAP = new Set(["wiring"]);

export function isModuleType(value: unknown): value is ModuleType {
  return value === "v1v2" || value === "v3v4" || value === "v5";
}

export function allowedKeysForModuleType(
  moduleType: string | null | undefined,
): ReadonlySet<string> {
  if (moduleType === "v3v4") return ALLOWED_KEYS_V3V4;
  if (moduleType === "v1v2") return ALLOWED_KEYS_V1V2;
  if (moduleType === "v5") return ALLOWED_KEYS_V5;
  // Unknown / no snapshot yet: union (still blocks truly foreign keys)
  return new Set([...ALLOWED_KEYS_V3V4, ...ALLOWED_KEYS_V1V2, ...ALLOWED_KEYS_V5]);
}

function isV5OnlyKey(key: string): boolean {
  return (
    ALLOWED_KEYS_V5.has(key) &&
    !ALLOWED_KEYS_V1V2.has(key) &&
    !ALLOWED_KEYS_V3V4.has(key)
  );
}

function isV3V4OnlyKey(key: string): boolean {
  return (
    ALLOWED_KEYS_V3V4.has(key) &&
    !ALLOWED_KEYS_V1V2.has(key) &&
    !ALLOWED_KEYS_V5.has(key)
  );
}

/** Infer moduleType from setBasic keys when the stored type would drop them all. */
export function inferModuleTypeFromFieldKeys(
  keys: readonly string[],
): ModuleType | null {
  const canon = keys
    .map((key) => canonicalSettingsKey(key))
    .filter((key) => key !== "mod");
  if (canon.length === 0) return null;
  if (canon.some(isV5OnlyKey)) return "v5";
  if (canon.some(isV3V4OnlyKey)) return "v3v4";
  if (canon.every((key) => ALLOWED_KEYS_V5.has(key))) return "v5";
  if (canon.every((key) => ALLOWED_KEYS_V3V4.has(key))) return "v3v4";
  if (canon.every((key) => ALLOWED_KEYS_V1V2.has(key))) return "v1v2";
  return null;
}

/**
 * Prefer the type the settings form was built from. If that (or the DB type)
 * would reject every submitted key, infer from the keys instead of returning empty.
 */
export function resolveModuleTypeForSetBasic(
  stored: string | null | undefined,
  requested: string | null | undefined,
  fieldKeys: readonly string[],
): string | null {
  const requestedType = isModuleType(requested) ? requested : null;
  const storedType = isModuleType(stored) ? stored : null;
  const preferred = requestedType ?? storedType;
  const canon = fieldKeys
    .map((key) => canonicalSettingsKey(key))
    .filter((key) => key !== "mod");
  if (preferred && canon.length > 0) {
    const allowed = allowedKeysForModuleType(preferred);
    if (canon.some((key) => allowed.has(key))) return preferred;
    return inferModuleTypeFromFieldKeys(canon) ?? preferred;
  }
  if (preferred) return preferred;
  return inferModuleTypeFromFieldKeys(canon);
}

/** Legacy settings key `tc` → `tpf`. */
export function canonicalSettingsKey(key: string): string {
  return key === "tc" ? "tpf" : key;
}

function asIntegerIndex(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isInteger(n)) return n;
  }
  return null;
}

/**
 * v5 enums: case-insensitive label match; integer index → HMI string.
 * wiring indexes are left as-is (HMI sends "3P4L" | "3P3L").
 */
export function canonicalizeV5FieldValue(
  key: string,
  value: unknown,
): unknown {
  const labels = V5_ENUM_LABELS[key];
  if (!labels) return value;
  if (typeof value === "string") {
    const hit = labels.find(
      (label) => label.toLowerCase() === value.trim().toLowerCase(),
    );
    if (hit) return hit;
    if (V5_NO_INDEX_MAP.has(key)) return value;
    const idx = asIntegerIndex(value);
    if (idx !== null && idx >= 0 && idx < labels.length) return labels[idx];
    return value;
  }
  if (V5_NO_INDEX_MAP.has(key)) return value;
  const idx = asIntegerIndex(value);
  if (idx !== null && idx >= 0 && idx < labels.length) return labels[idx];
  return value;
}

export function canonicalizeSettingsValue(
  moduleType: string | null | undefined,
  key: string,
  value: unknown,
): unknown {
  if (moduleType === "v5") return canonicalizeV5FieldValue(key, value);
  return value;
}
