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

/** v1v2 / v5 common basic (no v200-only keys like k0, thdup). */
export const ALLOWED_KEYS_V1V2_V5: ReadonlySet<string> = new Set([
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

export function isModuleType(value: unknown): value is ModuleType {
  return value === "v1v2" || value === "v3v4" || value === "v5";
}

export function allowedKeysForModuleType(
  moduleType: string | null | undefined,
): ReadonlySet<string> {
  if (moduleType === "v3v4") return ALLOWED_KEYS_V3V4;
  if (moduleType === "v1v2" || moduleType === "v5") return ALLOWED_KEYS_V1V2_V5;
  // Unknown / no snapshot yet: union (still blocks truly foreign keys)
  return new Set([...ALLOWED_KEYS_V3V4, ...ALLOWED_KEYS_V1V2_V5]);
}

/** Legacy settings key `tc` → `tpf`. */
export function canonicalSettingsKey(key: string): string {
  return key === "tc" ? "tpf" : key;
}
