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

export type SettingFieldDef = {
  key: string;
  label: string;
  kind: SettingFieldKind;
  /** select options when kind=select */
  options?: { value: number; label: string }[];
  step?: number;
  hint?: string;
};

const COMMON_FIELDS: SettingFieldDef[] = [
  { key: "ectp", label: "ECTP", kind: "number", step: 1 },
  { key: "ectrs", label: "ECTRS", kind: "number", step: 1 },
  { key: "pcs", label: "PCS", kind: "number", step: 0.1 },
  { key: "ccr", label: "CCR", kind: "number", step: 0.1 },
  { key: "tc", label: "TC", kind: "number", step: 0.1 },
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

const ICTRS_FIELD: SettingFieldDef = {
  key: "ictrs",
  label: "ICTRS",
  kind: "number",
  step: 1,
};

const V3V4_EXTRA_FIELDS: SettingFieldDef[] = [
  { key: "k0", label: "K0", kind: "number", step: 1 },
  { key: "thdup", label: "THD UP", kind: "number", step: 1 },
  { key: "thermp", label: "THERM P", kind: "number", step: 1 },
  { key: "startupSwitch", label: "Startup", kind: "switch" },
  { key: "resonpSwitch", label: "Reson P", kind: "switch" },
  { key: "thdupSwitch", label: "THD UP SW", kind: "switch" },
  { key: "vbuslowSwitch", label: "Vbus Low", kind: "switch" },
  { key: "vnetphighSwitch", label: "Vnet P High", kind: "switch" },
  { key: "qoffset", label: "Q Offset", kind: "number", step: 1 },
  { key: "iratemode", label: "I Rate Mode", kind: "number", step: 1 },
  { key: "filterWave", label: "Filter Wave", kind: "number", step: 1 },
  { key: "closedLoop", label: "Closed Loop", kind: "switch" },
  { key: "phase", label: "Phase", kind: "number", step: 1 },
];

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

/** Field defs for the given moduleType (omits keys that don't apply). */
export function fieldsForModuleType(moduleType: ModuleType): SettingFieldDef[] {
  if (moduleType === "v3v4") {
    return [...COMMON_FIELDS, ...V3V4_EXTRA_FIELDS];
  }
  // v1v2 / v5: include ictrs after ectrs
  const fields = [...COMMON_FIELDS];
  const ectrsIdx = fields.findIndex((f) => f.key === "ectrs");
  fields.splice(ectrsIdx + 1, 0, ICTRS_FIELD);
  return fields;
}

export function isModuleType(value: unknown): value is ModuleType {
  return value === "v1v2" || value === "v3v4" || value === "v5";
}
