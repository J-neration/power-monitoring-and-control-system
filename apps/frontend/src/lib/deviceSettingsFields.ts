/** Shared types for HMI basic settings (UI engineering units). */

export type ModuleType = "v1v2" | "v3v4" | "v5";

export type BasicSettingRow = Record<string, number | string | boolean | null>;

export type DeviceSettingsSnapshot = {
  installationId: string;
  moduleType: ModuleType;
  numOfMods: number;
  basic: BasicSettingRow[];
  updatedAt: string;
};

export type SettingFieldKind = "number" | "switch" | "select";

export type SettingOption = { value: number | string; label: string };

export type SettingFieldDef = {
  key: string;
  label: string;
  kind: SettingFieldKind;
  /** select options when kind=select */
  options?: SettingOption[];
  step?: number;
  min?: number;
  max?: number;
  hint?: string;
  /**
   * String-enum fields: map integer snapshot/index → option order.
   * Default true. wiring must stay false (do not reinterpret 0/1).
   */
  mapIndex?: boolean;
};

/** v3v4 (200A) — exactly these 7 keys (HMI contract). ectp is not Load/Grid. */
const V3V4_FIELDS: SettingFieldDef[] = [
  { key: "reactiveSwitch", label: "무효전력 보상", kind: "switch" },
  { key: "harmSwitch", label: "고조파 보상", kind: "switch" },
  { key: "imbSwitch", label: "불평형 보상", kind: "switch" },
  {
    key: "ectp",
    label: "ectp",
    kind: "select",
    options: [
      { value: 0, label: "0" },
      { value: 1, label: "1" },
    ],
  },
  { key: "k0", label: "K0", kind: "number", step: 1 },
  {
    key: "ccr",
    label: "Capacity Compensation Ratio",
    kind: "number",
    step: 0.01,
  },
  {
    key: "tpf",
    label: "Target Power Factor",
    kind: "number",
    step: 0.01,
  },
];

const V1V2_FIELDS: SettingFieldDef[] = [
  {
    key: "ectp",
    label: "CT 위치 (ectp)",
    kind: "select",
    options: [
      { value: 0, label: "Load side" },
      { value: 1, label: "Grid side" },
    ],
  },
  { key: "ectrs", label: "ECTRS", kind: "number", step: 1 },
  { key: "ictrs", label: "ICTRS", kind: "number", step: 1 },
  { key: "pcs", label: "PCS", kind: "number", step: 0.1 },
  {
    key: "ccr",
    label: "Capacity Compensation Ratio",
    kind: "number",
    step: 0.1,
  },
  {
    key: "tpf",
    label: "Target Power Factor",
    kind: "number",
    step: 0.1,
  },
  { key: "cm", label: "CM", kind: "number", step: 1 },
  { key: "apro", label: "A PRO", kind: "number", step: 1 },
  { key: "bpro", label: "B PRO", kind: "number", step: 1 },
  { key: "cpro", label: "C PRO", kind: "number", step: 1 },
  { key: "reactiveSwitch", label: "무효전력", kind: "switch" },
  { key: "harmSwitch", label: "고조파", kind: "switch" },
  { key: "imbSwitch", label: "불평형", kind: "switch" },
  { key: "reactiveCapacity", label: "무효전력 용량", kind: "number", step: 1 },
  { key: "numOfMods", label: "모듈 수", kind: "number", step: 1 },
];

/** v5 SIC — sic_mod_setting. Enum labels are HMI source of truth. */
const V5_FIELDS: SettingFieldDef[] = [
  {
    key: "ectp",
    label: "외부 CT 위치",
    kind: "select",
    options: [
      { value: 0, label: "Load Side" },
      { value: 1, label: "Grid Side" },
    ],
  },
  { key: "ectrs", label: "CT비", kind: "number", step: 1 },
  {
    key: "ccr",
    label: "용량 보상 비",
    kind: "number",
    step: 0.01,
    min: 0,
    max: 1,
  },
  {
    key: "tpf",
    label: "목표 역률",
    kind: "number",
    step: 0.01,
  },
  {
    key: "numOfMods",
    label: "장비 대수",
    kind: "number",
    step: 1,
    min: 1,
    max: 6,
    hint: "HMI EEPROM (모듈 슬롯이 아님)",
  },
  {
    key: "compMode",
    label: "보상 모드",
    kind: "select",
    options: [
      { value: "Flat", label: "Flat" },
      { value: "Harmonic", label: "Harmonic" },
      { value: "Reactive", label: "Reactive" },
      { value: "Harm+Reactive", label: "Harm+Reactive" },
      { value: "Unbalance", label: "Unbalance" },
      { value: "Harm+Unbalance", label: "Harm+Unbalance" },
      { value: "React+Unbalance", label: "React+Unbalance" },
      { value: "All", label: "All" },
    ],
  },
  {
    key: "startupMethod",
    label: "startup Method",
    kind: "select",
    options: [
      { value: "Manual", label: "Manual" },
      { value: "Auto", label: "Auto" },
    ],
  },
  {
    key: "harmonicMode",
    label: "harmonic Mode",
    kind: "select",
    options: [
      { value: "Auto", label: "Auto" },
      { value: "Selective", label: "Selective" },
    ],
  },
  { key: "reactiveRatio", label: "reactive Ratio", kind: "number", step: 1 },
  { key: "imbalanceRatio", label: "imbalance Ratio", kind: "number", step: 1 },
  {
    key: "phaseAdaption",
    label: "phase Adaption",
    kind: "select",
    options: [
      { value: "Close", label: "Close" },
      { value: "On", label: "On" },
    ],
  },
  {
    key: "wiring",
    label: "wiring",
    kind: "select",
    mapIndex: false,
    options: [
      { value: "3P4L", label: "3P4L" },
      { value: "3P3L", label: "3P3L" },
    ],
  },
  {
    key: "priorityMode",
    label: "우선 순위",
    kind: "select",
    options: [
      { value: "None", label: "None" },
      { value: "Harm", label: "Harm" },
      { value: "React", label: "React" },
      { value: "Unb", label: "Unb" },
    ],
  },
];

export const ALLOWED_KEYS_V3V4: ReadonlySet<string> = new Set(
  V3V4_FIELDS.map((f) => f.key),
);

export const ALLOWED_KEYS_V1V2: ReadonlySet<string> = new Set(
  V1V2_FIELDS.map((f) => f.key),
);

export const ALLOWED_KEYS_V5: ReadonlySet<string> = new Set(
  V5_FIELDS.map((f) => f.key),
);

export function allowedKeysForModuleType(
  moduleType: ModuleType,
): ReadonlySet<string> {
  if (moduleType === "v3v4") return ALLOWED_KEYS_V3V4;
  if (moduleType === "v5") return ALLOWED_KEYS_V5;
  return ALLOWED_KEYS_V1V2;
}

export function moduleTypeLabel(moduleType: ModuleType): string {
  switch (moduleType) {
    case "v1v2":
      return "v1v2 · 150A Gray";
    case "v3v4":
      return "v3v4 · 200A";
    case "v5":
      return "v5 · SIC";
    default:
      return moduleType;
  }
}

/** Allowed field catalog for the moduleType (not yet filtered by payload). */
export function fieldsForModuleType(moduleType: ModuleType): SettingFieldDef[] {
  if (moduleType === "v3v4") return [...V3V4_FIELDS];
  if (moduleType === "v5") return [...V5_FIELDS];
  return [...V1V2_FIELDS];
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Normalize a snapshot value for display / setBasic.
 * String enums: case-insensitive match to HMI labels; integer index → label
 * (except wiring, which is never remapped from 0/1).
 */
export function canonicalizeFieldValue(
  field: SettingFieldDef,
  raw: unknown,
): number | string {
  if (field.kind === "switch") {
    if (typeof raw === "boolean") return raw ? 1 : 0;
    const n = asFiniteNumber(raw);
    return n !== null && n !== 0 ? 1 : 0;
  }
  if (field.kind === "number") {
    const n = asFiniteNumber(raw);
    return n !== null ? n : 0;
  }
  const options = field.options ?? [];
  if (typeof raw === "string") {
    const hit = options.find(
      (o) => String(o.value).toLowerCase() === raw.trim().toLowerCase(),
    );
    if (hit) return hit.value;
    const n = asFiniteNumber(raw);
    if (n !== null && Number.isInteger(n)) {
      const byNum = options.find((o) => o.value === n);
      if (byNum) return byNum.value;
      if (field.mapIndex !== false && n >= 0 && n < options.length) {
        const byIndex = options[n];
        if (byIndex && typeof byIndex.value === "string") return byIndex.value;
      }
    }
    return raw;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const byNum = options.find((o) => o.value === raw);
    if (byNum) return byNum.value;
    if (
      field.mapIndex !== false &&
      Number.isInteger(raw) &&
      raw >= 0 &&
      raw < options.length
    ) {
      const byIndex = options[raw];
      if (byIndex && typeof byIndex.value === "string") return byIndex.value;
    }
    return raw;
  }
  return options[0]?.value ?? 0;
}

export function matchSelectOption(
  field: SettingFieldDef,
  raw: unknown,
): SettingOption | undefined {
  const canonical = canonicalizeFieldValue(field, raw);
  return field.options?.find((o) => o.value === canonical);
}

/**
 * Catalog ∩ keys present in snapshot rows.
 * Do not render fields HMI did not send.
 */
export function fieldsFromPayload(
  moduleType: ModuleType,
  basic: BasicSettingRow[],
): SettingFieldDef[] {
  const catalog = fieldsForModuleType(moduleType);
  const present = new Set<string>();
  for (const row of basic) {
    for (const key of Object.keys(row)) {
      if (key === "mod") continue;
      // Legacy alias — treat as tpf for display filtering
      if (key === "tc") present.add("tpf");
      else present.add(key);
    }
  }
  return catalog.filter((f) => present.has(f.key));
}

/** Migrate legacy `tc` → `tpf` on a single basic row (in place copy). */
export function migrateBasicRowKeys(row: BasicSettingRow): BasicSettingRow {
  const next: BasicSettingRow = { ...row };
  if ("tc" in next) {
    if (next.tpf === undefined || next.tpf === null) {
      next.tpf = next.tc;
    }
    delete next.tc;
  }
  return next;
}

export function isModuleType(value: unknown): value is ModuleType {
  return value === "v1v2" || value === "v3v4" || value === "v5";
}
