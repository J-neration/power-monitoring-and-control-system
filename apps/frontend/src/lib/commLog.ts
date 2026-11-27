/**
 * HMI 통신 로그 화면용 풀이 — 경로·상태코드·JSON 항목을 사람이 읽는 말로 바꾼다.
 * (백엔드 GET /admin/receiver-logs 의 한 줄 = ReceiverLogRow)
 */

export type ReceiverLogRow = {
  id: number;
  createdAt: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  iccid: string | null;
  ip: string | null;
  requestBody: string | null;
  responseBody: string | null;
  installationId: string | null;
  installationLabel: string | null;
  siteName: string | null;
};

export type CommKind = {
  /** 거르기에 쓰는 경로 (쿼리 제외) */
  path: string;
  label: string;
  hint: string;
};

export const COMM_KINDS: CommKind[] = [
  { path: "/receiver", label: "측정값 보고", hint: "주기적으로 보내는 전압·전류·역률·온도 등" },
  { path: "/receiver/commands", label: "명령 확인", hint: "관제에서 보낸 명령이 있는지 HMI가 물어봄" },
  { path: "/receiver/commands/ack", label: "명령 결과", hint: "받은 명령을 실행한 결과" },
  { path: "/receiver/faults", label: "고장 이력", hint: "모듈 고장 기록" },
  { path: "/receiver/faults/critical", label: "긴급 고장", hint: "즉시 알려야 하는 고장 발생·해제" },
  { path: "/receiver/settings", label: "설정값 보고", hint: "HMI 기본 설정값" },
  { path: "/receiver/ota/status", label: "펌웨어 업데이트", hint: "원격 업데이트(OTA) 진행 상황" },
  { path: "/receiver/harmonics", label: "고조파 보고", hint: "차수별 고조파 전류" },
];

export function pathOnly(path: string): string {
  const i = path.indexOf("?");
  return i >= 0 ? path.slice(0, i) : path;
}

export function kindOf(path: string): CommKind {
  const p = pathOnly(path);
  return COMM_KINDS.find((k) => k.path === p) ?? { path: p, label: p, hint: "" };
}

export type StatusInfo = {
  tone: "ok" | "warn" | "error";
  label: string;
  /** 무슨 뜻인지, 무엇을 확인해야 하는지 */
  detail: string;
};

export function statusInfo(statusCode: number, responseBody: string | null): StatusInfo {
  const msg = responseMessage(responseBody);
  if (statusCode >= 200 && statusCode < 300) {
    return { tone: "ok", label: "정상", detail: "서버가 정상적으로 받았습니다." };
  }
  if (statusCode === 400) {
    if (msg && /json/i.test(msg)) {
      return {
        tone: "error",
        label: "JSON 깨짐",
        detail: "데이터가 깨진 채로 도착했습니다. 전송 중 잘렸거나 펌웨어가 JSON을 잘못 만들었을 수 있습니다.",
      };
    }
    return {
      tone: "error",
      label: "형식 오류",
      detail: `필요한 항목이 빠졌거나 값의 형식이 맞지 않습니다. 받은 데이터를 확인하세요.${msg ? ` (서버 메시지: ${msg})` : ""}`,
    };
  }
  if (statusCode === 401) {
    return {
      tone: "error",
      label: "인증 실패",
      detail: "API 키가 맞지 않습니다. 펌웨어에 들어간 키를 확인하세요.",
    };
  }
  if (statusCode === 404) {
    return { tone: "warn", label: "대상 없음", detail: msg ?? "요청한 대상을 찾지 못했습니다." };
  }
  if (statusCode === 413) {
    return { tone: "error", label: "데이터 너무 큼", detail: "보낸 데이터가 허용 크기(1MB)를 넘었습니다." };
  }
  if (statusCode === 422) {
    return {
      tone: "warn",
      label: "미등록 장비",
      detail: "이 ICCID(유심 번호)가 서버에 등록되어 있지 않습니다. 관리자 > 현장 관리에서 ICCID를 확인하세요.",
    };
  }
  if (statusCode >= 500) {
    return {
      tone: "error",
      label: "서버 오류",
      detail: "서버 쪽에서 처리하다 실패했습니다. 개발팀 확인이 필요합니다.",
    };
  }
  return { tone: "warn", label: `응답 ${statusCode}`, detail: msg ?? "" };
}

function responseMessage(responseBody: string | null): string | null {
  const parsed = tryParse(responseBody);
  if (parsed.ok && parsed.value && typeof parsed.value === "object") {
    const m = (parsed.value as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return null;
}

export type Parsed = { ok: true; value: unknown } | { ok: false };

export function tryParse(text: string | null): Parsed {
  if (text == null || text === "") return { ok: false };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/** JSON 항목 이름 → 한글 이름 (모르는 항목은 원래 이름 그대로) */
export const FIELD_LABELS: Record<string, string> = {
  iccid: "유심 번호(ICCID)",
  device_id: "장비 ID",
  installationId: "설치지점 ID",
  model: "모델",
  timestamp: "측정 시각",
  ts: "측정 시각",
  moduleStatus: "모듈 상태",
  numOfMods: "모듈 수",
  vL1: "전압 L1 (V)",
  vL2: "전압 L2 (V)",
  vL3: "전압 L3 (V)",
  gridCurrentL1: "보상 후 전류 L1 (A)",
  gridCurrentL2: "보상 후 전류 L2 (A)",
  gridCurrentL3: "보상 후 전류 L3 (A)",
  gridCurrentN: "보상 후 전류 N (A)",
  loadCurrentL1: "부하 전류 L1 (A)",
  loadCurrentL2: "부하 전류 L2 (A)",
  loadCurrentL3: "부하 전류 L3 (A)",
  loadCurrentN: "부하 전류 N (A)",
  loadCurrentTHDL1: "부하 전류 THD L1 (%)",
  loadCurrentTHDL2: "부하 전류 THD L2 (%)",
  loadCurrentTHDL3: "부하 전류 THD L3 (%)",
  gridCurrentTHDL1: "보상 후 THD L1 (%)",
  gridCurrentTHDL2: "보상 후 THD L2 (%)",
  gridCurrentTHDL3: "보상 후 THD L3 (%)",
  uncompS: "보상 전 피상전력 S",
  uncompP: "보상 전 유효전력 P",
  uncompQ: "보상 전 무효전력 Q",
  uncompH: "보상 전 고조파 H",
  compS: "보상 후 피상전력 S",
  compP: "보상 후 유효전력 P",
  compQ: "보상 후 무효전력 Q",
  compH: "보상 후 고조파 H",
  tpf1: "보상 전 종합역률",
  tpf2: "보상 후 종합역률",
  dpf1: "보상 전 기본파역률",
  dpf2: "보상 후 기본파역률",
  areaTemp: "주변 온도 (°C)",
  moduleTemp: "모듈 온도 (°C)",
  fanSpeed: "팬 속도",
  totalCapacity: "총 용량",
  operatingCapacity: "운전 용량",
  reactivePowerCapacity: "무효전력 용량",
  availableMargin: "여유 용량",
  csq: "LTE 신호 세기 (CSQ 0~31)",
  rsrp: "LTE 수신 전력 (dBm)",
  faults: "고장 목록",
  faultCode: "고장 코드",
  event: "이벤트 (RAISE 발생 / CLEAR 해제)",
  eventName: "이벤트 이름",
  module: "모듈 번호",
  channel: "채널",
  moduleType: "모듈 종류",
  moduleCapacity: "모듈 용량",
  basic: "기본 설정",
  id: "ID",
  ok: "성공 여부",
  message: "메시지",
  state: "상태",
  percent: "진행률 (%)",
  fw: "펌웨어 버전",
  target: "대상",
  stage: "단계",
  error: "오류 내용",
  source: "보낸 이유",
  unit: "단위",
  orders: "고조파 차수",
  uncomp: "보상 전",
  comp: "보상 후",
  adminSessionActive: "원격 관제 연결 중",
  webSettingsActive: "(사용 안 함)",
  received_at: "서버 수신 시각",
  identity: "장비 확인 결과",
  device: "서버에 저장된 장비 정보",
  lastSeenAt: "마지막 수신",
  capacity: "용량",
  resolvedVia: "확인 방법",
  power: "명령 내용",
  fields: "변경 항목",
  statusCode: "상태 코드",
};

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

/** 측정값 보고에 꼭 있어야 하는 항목. 없으면 화면에 "빠진 항목"으로 표시한다. */
export const TELEMETRY_REQUIRED = [
  "iccid",
  "moduleStatus",
  "numOfMods",
  "vL1",
  "vL2",
  "vL3",
  "gridCurrentL1",
  "gridCurrentL2",
  "gridCurrentL3",
  "loadCurrentL1",
  "loadCurrentL2",
  "loadCurrentL3",
  "tpf1",
  "tpf2",
] as const;

/** 값이 비어 있는지 (null, 빈 글자, 숫자 아님) */
export function isEmptyValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "" || value.trim().toLowerCase() === "nan";
  if (typeof value === "number") return !Number.isFinite(value);
  return false;
}

/** 측정값 보고에서 빠졌거나 비어 있는 꼭 필요한 항목 */
export function missingTelemetryFields(row: ReceiverLogRow): string[] {
  if (pathOnly(row.path) !== "/receiver" || row.method !== "POST") return [];
  const parsed = tryParse(row.requestBody);
  if (!parsed.ok || !parsed.value || typeof parsed.value !== "object") return [];
  const body = parsed.value as Record<string, unknown>;
  return TELEMETRY_REQUIRED.filter((key) => isEmptyValue(body[key]));
}

function num(value: unknown, digits = 1): string | null {
  if (typeof value === "string" && value.trim() === "") return null;
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Number.isInteger(n) ? String(n) : n.toFixed(digits);
}

function triple(body: Record<string, unknown>, keys: [string, string, string], unit: string): string | null {
  const vals = keys.map((k) => num(body[k]) ?? "–");
  if (vals.every((v) => v === "–")) return null;
  return `${vals.join(" / ")}${unit}`;
}

/** 목록 한 줄에 보여줄 핵심 값 요약 */
export function summarize(row: ReceiverLogRow): string {
  const p = pathOnly(row.path);
  const req = tryParse(row.requestBody);
  const res = tryParse(row.responseBody);
  const body = req.ok && req.value && typeof req.value === "object" ? (req.value as Record<string, unknown>) : null;
  const reply = res.ok && res.value && typeof res.value === "object" ? (res.value as Record<string, unknown>) : null;

  if (row.requestBody && !req.ok && row.method !== "GET") {
    return `읽을 수 없는 데이터 ${row.requestBody.length}자`;
  }

  if (p === "/receiver" && body) {
    const parts: string[] = [];
    const v = triple(body, ["vL1", "vL2", "vL3"], "V");
    if (v) parts.push(`전압 ${v}`);
    const load = triple(body, ["loadCurrentL1", "loadCurrentL2", "loadCurrentL3"], "A");
    if (load) parts.push(`부하 ${load}`);
    const mods = num(body.numOfMods, 0);
    if (mods) parts.push(`모듈 ${mods}대`);
    const rsrp = num(body.rsrp, 0);
    const csq = num(body.csq, 0);
    if (rsrp) parts.push(`신호 ${rsrp}dBm`);
    else if (csq) parts.push(`신호 CSQ ${csq}`);
    return parts.join(" · ") || "측정값 없음";
  }
  if (p === "/receiver/commands") {
    if (reply && typeof reply.id === "string" && reply.id) {
      return `명령 전달함 (모듈 ${String(reply.module ?? "-")})`;
    }
    return "대기 중인 명령 없음";
  }
  if (p === "/receiver/commands/ack" && body) {
    const ok = body.ok === true ? "성공" : body.ok === false ? "실패" : "결과 미상";
    return `명령 ${ok}${typeof body.message === "string" && body.message ? ` · ${body.message}` : ""}`;
  }
  if (p === "/receiver/faults" && body) {
    const faults = Array.isArray(body.faults) ? body.faults : [];
    return faults.length ? `고장 ${faults.length}건` : "고장 없음";
  }
  if (p === "/receiver/faults/critical" && body) {
    const ev = body.event === "RAISE" ? "발생" : body.event === "CLEAR" ? "해제" : String(body.event ?? "");
    return `모듈 ${String(body.module ?? "-")} · 코드 ${String(body.faultCode ?? "-")} ${ev}`;
  }
  if (p === "/receiver/ota/status" && body) {
    const pct = num(body.percent, 0);
    return [body.state, pct ? `${pct}%` : null, body.fw ? `v${String(body.fw)}` : null, body.error]
      .filter(Boolean)
      .join(" · ");
  }
  if (p === "/receiver/harmonics" && body) {
    const orders = Array.isArray(body.orders) ? body.orders.length : 0;
    return `${orders}개 차수 · ${body.source === "command" ? "요청받아 측정" : "정기 측정"}`;
  }
  if (p === "/receiver/settings" && body) {
    return [body.moduleType, body.numOfMods != null ? `모듈 ${String(body.numOfMods)}대` : null]
      .filter(Boolean)
      .join(" · ");
  }
  return "";
}

/** "방금", "3분 전", "2시간 전", "어제" … */
export function relativeTime(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  return `${day}일 전`;
}

const KST = "Asia/Seoul";

export function kstTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    timeZone: KST,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function kstDayLabel(iso: string, now = new Date()): string {
  const fmt = (d: Date) => d.toLocaleDateString("ko-KR", { timeZone: KST, month: "long", day: "numeric", weekday: "short" });
  const key = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: KST });
  const d = new Date(iso);
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (key(d) === key(now)) return `오늘 · ${fmt(d)}`;
  if (key(d) === key(yesterday)) return `어제 · ${fmt(d)}`;
  return fmt(d);
}

export function kstDayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: KST });
}

/** 표에 넣을 값 문자열 */
export function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "";
  if (typeof value === "boolean") return value ? "예 (true)" : "아니오 (false)";
  if (Array.isArray(value)) {
    if (value.every((v) => v == null || typeof v !== "object")) return value.map((v) => String(v)).join(", ");
    return JSON.stringify(value);
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
