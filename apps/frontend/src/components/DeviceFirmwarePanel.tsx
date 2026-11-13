"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * 펌웨어(OTA) 탭 — 관리자 전용.
 *   - 현재 펌웨어 버전 / 화면 데이터 번호 / OTA 상태 (텔레메트리 fw, assetVersion, otaState)
 *   - 업로드된 OTA 패키지를 골라 OTA 명령 전송 (명령 하나로 다운로드 → 검사 → 자동 적용)
 *   - 화면 데이터 번호가 다른 코드 패키지는 화면 데이터 패키지(새 화면 + 보관본)와 함께 보낸다.
 *     보낼 수 없으면(미지원 장비, 서버에 화면 패키지 없음) 흐리게 표시하고 이유를 보여 준다
 *   - HMI 가 보낸 진행/결과 이력 (POST /receiver/ota/status)
 *   - 서버의 패키지 목록과 삭제 (DELETE /receiver/ota/files/:id). 화면 데이터 번호마다 마지막
 *     패키지는 되돌리기용 보관본이라 서버가 거부(409)하므로 버튼을 막아 둔다
 * HMI 쪽 동작: HMI 저장소 docs/OTA_DEVELOPMENT_PLAN.md 12장 단계 7–8, docs/OTA_ASSET_PLAN.md 11.5.
 */

type OtaFile = {
  id: string;
  name: string;
  size: number;
  /** "code" | "asset" | null(일반 파일) */
  kind?: string | null;
  version: string | null;
  productId: number | null;
  assetVersion: number | null;
  uploadedBy?: string | null;
  createdAt: string;
};

type OtaEvent = {
  id: string;
  commandId: string | null;
  state: string;
  percent: number | null;
  fw: string | null;
  target: string | null;
  /** 화면을 바꾸는 OTA 의 단계: backup | screen | code (이전 펌웨어는 없음) */
  stage?: string | null;
  error: string | null;
  createdAt: string;
};

type StatusResponse = {
  device: {
    fwVersion: string | null;
    otaCapable: boolean | null;
    otaState: string | null;
    assetVersion?: number | null;
    assetOta?: boolean | null;
  } | null;
  events: OtaEvent[];
};

type Banner = { tone: "pending" | "ok" | "err"; title: string; detail?: string };

type Props = {
  installationId: string;
  fwVersion?: string | null;
  otaCapable?: boolean | null;
  otaState?: string | null;
  assetVersion?: number | null;
  assetOta?: boolean | null;
  requestedBy?: string;
};

const POLL_MS = 15_000;
/** 진행 중에는 더 자주 본다 */
const POLL_ACTIVE_MS = 5_000;
/** 서버 명령 TTL(COMMAND_TTL_SECONDS 기본 900 s). 이보다 오래 받지 않으면 만료 */
const COMMAND_TTL_MS = 15 * 60_000;
/** 진행 보고가 이보다 오래 없으면 멈춘 것으로 보고 다시 보낼 수 있게 한다 */
const STALE_MS = 30 * 60_000;
/** 진행 단계에서 이보다 오래 다음 보고가 없으면 경고 */
const SLOW_MS = 10 * 60_000;

type Stage = "queued" | "backup" | "screen" | "downloading" | "verified" | "installing" | "confirming";

const STEPS: { key: Stage; label: string }[] = [
  { key: "queued", label: "명령 전달" },
  { key: "downloading", label: "다운로드" },
  { key: "verified", label: "검사·기록" },
  { key: "installing", label: "설치·재부팅" },
  { key: "confirming", label: "새 버전 확인" },
];

/** 화면 데이터도 바꾸는 OTA (HMI 저장소 docs/OTA_ASSET_PLAN.md 11.5 ①–⑥) */
const SCREEN_STEPS: { key: Stage; label: string }[] = [
  { key: "queued", label: "명령 전달" },
  { key: "backup", label: "보관본" },
  { key: "screen", label: "새 화면" },
  { key: "downloading", label: "코드 다운로드" },
  { key: "verified", label: "검사·기록" },
  { key: "installing", label: "설치·재부팅" },
  { key: "confirming", label: "화면 교체·확인" },
];

const STAGE_HINT: Record<Stage, string> = {
  queued: "HMI가 다음 보고 때 명령을 받습니다(최대 약 10분).",
  backup:
    "되돌리기에 쓸 지금 화면 데이터(보관본)를 받는 중입니다(처음 한 번만, 약 6분). 받는 동안 화면은 정상이고, 외부 플래시에 기록할 때 약 10초 멈춥니다.",
  screen:
    "새 화면 데이터를 받아 검사하는 중입니다(약 6분). 받는 동안 화면은 정상이고, 외부 플래시에 기록할 때 약 10초 멈춥니다.",
  downloading: "LTE로 펌웨어를 받는 중입니다(약 2분).",
  verified: "서명 검사를 통과했고 외부 플래시에 기록하는 중입니다.",
  installing: "HMI가 재부팅해서 새 펌웨어를 설치하는 중입니다. 약 15초 동안 화면과 제어가 멈춥니다.",
  confirming: "새 버전이 정상 동작하는지 확인하는 중입니다(약 1–5분). 문제가 있으면 이전 버전으로 자동 복구됩니다.",
};

const SCREEN_CONFIRM_HINT =
  "새 펌웨어가 화면 데이터를 바꾸고(약 2분, 화면에 진행 막대만 보임. 제어와 통신은 계속) 정상 동작을 확인하는 중입니다(약 1–5분). 문제가 있으면 이전 버전과 이전 화면으로 자동 복구됩니다.";

const STAGE_NAME: Record<string, string> = { backup: "보관본", screen: "새 화면", code: "코드" };

type Sent = { commandId: string | null; version: string; at: number; withScreen: boolean };

/** HMI 진행/결과 보고 (OtaStatusEvent.state) */
const STATE_LABEL: Record<string, string> = {
  downloading: "다운로드 중",
  verified: "검사 완료",
  installing: "설치 중(재부팅)",
  confirmed: "업데이트 완료",
  rolled_back: "이전 버전으로 복구",
  failed: "실패",
};

/** HMI EEPROM 레코드 상태 (텔레메트리 otaState). "confirmed" 는 롤백 뒤에도 쓰이므로
 *  "업데이트 완료"가 아니라 "정상 동작"으로 읽는다. */
const RECORD_LABEL: Record<string, string> = {
  idle: "대기",
  installing: "설치 중",
  pending_confirm: "새 버전 확인 중",
  confirmed: "정상 동작",
  rollback: "복구 중",
  failed: "실패",
};

const ERROR_LABEL: Record<string, string> = {
  download: "다운로드 실패",
  interrupted: "다운로드 중 전원이 꺼지거나 재시작됨(다시 보내 주세요)",
  backup: "백업 생성 실패",
  slot: "외부 플래시 기록 실패",
  record: "상태 기록 실패",
  rollback: "새 버전이 정상 동작하지 않아 이전 버전으로 복구",
  no_backup: "복구할 백업이 없음",
  backup_failed: "복구한 버전도 확인되지 않음",
  signature: "서명 불일치",
  sha256: "파일 손상(SHA-256)",
  "image crc": "파일 손상(CRC)",
  product: "다른 제품용 펌웨어(거부)",
  asset: "화면 자산 세대가 다름(거부)",
  size: "패키지 크기 이상(거부)",
  not_newer: "현재보다 높은 버전이 아님(거부)",
  install_pending: "이전 설치가 끝나지 않음(거부)",
  bad_command: "명령 형식 오류(거부)",
  busy: "다른 업데이트가 진행 중(거부)",
  // 화면 데이터 패키지 (HMI ota_asset.c)
  "body crc": "파일 손상(CRC)",
  "raw sha256": "화면 데이터 손상(SHA-256)",
  inflate: "압축 해제 실패(파일 손상)",
  "block table": "패키지 형식 오류",
  layout: "패키지 형식 오류",
  "header crc": "패키지 헤더 손상",
  "header format": "패키지 헤더 형식 오류",
  magic: "패키지 종류가 다름",
  "product id": "다른 제품용 패키지(거부)",
  not_live: "보관본이 지금 화면 데이터와 다름",
  no_screen: "검증된 새 화면 데이터가 없어 코드를 받지 않음",
  asset_unsupported: "이 펌웨어는 화면 데이터 교체를 지원하지 않음(거부)",
  live_state: "지난 화면 교체가 아직 끝나지 않음(재부팅 뒤 다시 보내 주세요)",
  no_backup_url: "보관본 주소가 명령에 없음(거부)",
};

/** 오류 문구. 화면 단계(보관본, 새 화면)에서 난 오류는 앞에 단계를 붙인다. */
function errorText(e: { error: string | null; stage?: string | null }): string {
  if (!e.error) return "";
  const label = ERROR_LABEL[e.error] ?? e.error;
  return e.stage && e.stage !== "code" && STAGE_NAME[e.stage] ? `${STAGE_NAME[e.stage]}: ${label}` : label;
}

const FINAL_STATES = new Set(["confirmed", "rolled_back", "failed"]);

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** "2.3.10" > "2.3.9" */
function versionNewer(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  }
  return false;
}

function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}분 ${s % 60}초` : `${s}초`;
}

function ProgressCard({
  stage,
  version,
  since,
  now,
  note,
  withScreen,
}: {
  stage: Stage;
  version: string | null;
  since: number;
  now: number;
  note?: string;
  withScreen: boolean;
}) {
  const steps = withScreen ? SCREEN_STEPS : STEPS;
  const idx = steps.findIndex((s) => s.key === stage);
  const elapsed = now - since;
  const slow = elapsed > (stage === "queued" ? COMMAND_TTL_MS : SLOW_MS);
  return (
    <div className="device-firmware-progress" role="status" aria-live="polite" aria-busy="true">
      <div className="device-firmware-progress-head">
        <span className="device-settings-status-spinner" aria-hidden />
        <span className="device-firmware-progress-title">
          {version ? `v${version} ` : ""}업데이트 진행 중 · {steps[idx]?.label}
          {note ? ` (${note})` : ""}
        </span>
        <span className="device-firmware-progress-time">{fmtElapsed(elapsed)}</span>
      </div>
      <ol className="device-firmware-steps">
        {steps.map((s, i) => (
          <li
            key={s.key}
            className={
              i < idx ? "is-done" : i === idx ? "is-active" : undefined
            }
          >
            <span className="device-firmware-step-dot" aria-hidden>
              {i < idx ? "✓" : i + 1}
            </span>
            <span className="device-firmware-step-label">{s.label}</span>
          </li>
        ))}
      </ol>
      <p className="device-firmware-hint">
        {slow
          ? stage === "queued"
            ? "15분 동안 HMI가 명령을 받지 않았습니다. 명령이 만료되었을 수 있으니 HMI 통신 상태를 확인한 뒤 다시 보내세요."
            : "10분 넘게 새 보고가 없습니다. HMI 통신 상태를 확인하세요."
          : withScreen && stage === "confirming"
            ? SCREEN_CONFIRM_HINT
            : STAGE_HINT[stage]}
      </p>
    </div>
  );
}

function StatusCard({ banner }: { banner: Banner }) {
  return (
    <div
      className={`device-settings-status device-settings-status--${banner.tone}`}
      role="status"
      aria-live="polite"
      aria-busy={banner.tone === "pending"}
    >
      <div className="device-settings-status-icon" aria-hidden>
        {banner.tone === "pending" ? <span className="device-settings-status-spinner" /> : banner.tone === "ok" ? "✓" : "!"}
      </div>
      <div className="device-settings-status-body">
        <span className="device-settings-status-title">{banner.title}</span>
        {banner.detail ? <span className="device-settings-status-detail">{banner.detail}</span> : null}
      </div>
    </div>
  );
}

export default function DeviceFirmwarePanel({
  installationId,
  fwVersion,
  otaCapable,
  otaState,
  assetVersion,
  assetOta,
  requestedBy,
}: Props) {
  const [files, setFiles] = useState<OtaFile[]>([]);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [selected, setSelected] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [deleteTarget, setDeleteTarget] = useState<OtaFile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const current = status?.device?.fwVersion ?? fwVersion ?? null;
  const capable = (status?.device?.otaCapable ?? otaCapable) === true;
  const recordState = status?.device?.otaState ?? otaState ?? null;
  /** 화면 데이터 번호. 보내지 않는 OTA 펌웨어(2.4.0)는 1번이다(HMI 저장소 docs/OTA_ASSET_PLAN.md 7.1) */
  const reportedAsset = status?.device?.assetVersion ?? assetVersion ?? null;
  const assetNo = reportedAsset ?? (capable ? 1 : null);
  const assetRemote = (status?.device?.assetOta ?? assetOta) === true;
  const events = useMemo(() => status?.events ?? [], [status]);
  const latest = events[0];
  const latestAt = latest ? new Date(latest.createdAt).getTime() : 0;
  /** "설치 중" 다음 보고가 없어도, 기기가 이미 목표 버전으로 돌고 있고 확인 단계가
   *  아니면 끝난 것으로 본다 (완료 보고가 없는 펌웨어, 보고 유실, ST-Link 재기록 등) */
  const installedByFw =
    latest?.state === "installing" &&
    !!latest.target &&
    current === latest.target &&
    recordState !== "pending_confirm" &&
    recordState !== "rollback";
  /** 마지막 보고가 진행 단계이고 너무 오래되지 않았을 때만 진행 중 */
  const inProgress = latest
    ? !FINAL_STATES.has(latest.state) && !installedByFw && now - latestAt < STALE_MS
    : false;

  /** 방금 보낸 명령에 대한 보고가 아직 없으면 "명령 전달" 단계 */
  const sentHasEvent = sent
    ? events.some((e) =>
        sent.commandId ? e.commandId === sent.commandId : new Date(e.createdAt).getTime() >= sent.at,
      )
    : false;
  const queued = sent !== null && !sentHasEvent && now - sent.at < COMMAND_TTL_MS + SLOW_MS;

  /** 진행 중인 명령이 화면 데이터도 바꾸는지: 보낸 명령이거나, 같은 명령의 보고에 화면 단계가 있음 */
  const withScreen =
    (queued && sent?.withScreen === true) ||
    (!!latest &&
      events.some(
        (e) =>
          e.commandId &&
          e.commandId === latest.commandId &&
          (e.stage === "backup" || e.stage === "screen"),
      ));

  const stage: Stage | null = queued
    ? "queued"
    : inProgress && latest
      ? latest.stage === "backup"
        ? "backup"
        : latest.stage === "screen"
          ? "screen"
          : latest.state === "downloading"
            ? "downloading"
            : latest.state === "verified"
              ? "verified"
              : recordState === "pending_confirm" || recordState === "rollback"
                ? "confirming"
                : "installing"
      : null;
  const stageSince = queued && sent ? sent.at : latestAt;
  const stageVersion = queued && sent ? sent.version : (latest?.target ?? null);
  const stageNote =
    stage === "confirming" && recordState === "rollback"
      ? "이전 버전으로 복구 중"
      : (stage === "backup" || stage === "screen" || stage === "downloading") &&
          !queued &&
          typeof latest?.percent === "number" &&
          latest.percent > 0
        ? `${latest.percent}%`
        : undefined;
  const active = stage !== null;

  /** 진행 중에는 1초마다 경과 시간을 갱신 */
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  /** 보낸 명령의 최종 결과가 오면 결과 배너로 바꾼다 */
  useEffect(() => {
    if (!sent || !latest || !FINAL_STATES.has(latest.state)) return;
    const mine = sent.commandId ? latest.commandId === sent.commandId : latestAt >= sent.at;
    if (!mine) return;
    setSent(null);
    if (latest.state === "confirmed") {
      setBanner({ tone: "ok", title: `v${latest.target ?? sent.version} 업데이트 완료` });
    } else if (latest.state === "rolled_back") {
      setBanner({
        tone: "err",
        title: `v${sent.version} 적용 실패, v${latest.fw ?? "?"}(으)로 자동 복구`,
        detail: latest.error ? errorText(latest) : undefined,
      });
    } else {
      setBanner({
        tone: "err",
        title: `v${sent.version} 업데이트 실패`,
        detail: latest.error ? errorText(latest) : undefined,
      });
    }
  }, [sent, latest, latestAt]);

  /** Version the command tried to install. After a rollback the result report
   *  carries the restored version as target, so look at the earlier reports
   *  of the same command (downloading / verified / installing). */
  const attemptedTarget = (e: OtaEvent): string | null => {
    if (e.state !== "rolled_back") return e.target;
    const tried = events.find(
      (x) => x.commandId && x.commandId === e.commandId && x.state !== "rolled_back" && x.target,
    );
    return tried?.target ?? null;
  };

  const stateText = (() => {
    if (!latest) return RECORD_LABEL[recordState ?? "idle"] ?? recordState ?? "대기";
    const label = STATE_LABEL[latest.state] ?? latest.state;
    if (latest.state === "rolled_back") {
      const tried = attemptedTarget(latest);
      return `${label}${tried ? ` (v${tried} → v${latest.fw ?? "?"})` : ""}`;
    }
    return `${label}${latest.target ? ` (v${latest.target})` : ""}`;
  })();

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/receiver/ota/status?installationId=${encodeURIComponent(installationId)}`, {
        cache: "no-store",
      });
      if (res.ok) setStatus((await res.json()) as StatusResponse);
    } catch {
      /* keep the last view */
    }
  }, [installationId]);

  /** 서버의 패키지 전부(헤더 없는 일반 파일 포함). 보내기 목록은 아래에서 종류별로 거른다 */
  const loadFiles = useCallback(async () => {
    try {
      const res = await fetch("/api/receiver/ota/files", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { files: OtaFile[] };
      setFiles(body.files ?? []);
    } catch {
      /* no list */
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    void loadFiles();
  }, [loadStatus, loadFiles]);

  useEffect(() => {
    const t = setInterval(() => void loadStatus(), active ? POLL_ACTIVE_MS : POLL_MS);
    return () => clearInterval(t);
  }, [loadStatus, active]);

  const codeFiles = useMemo(() => files.filter((f) => f.kind !== "asset" && f.version), [files]);
  /** 화면 데이터 패키지: 번호마다 가장 최근 것 (서버가 명령에 넣는 것과 같음) */
  const assetFiles = useMemo(() => {
    const byNo = new Map<number, OtaFile>();
    for (const f of files) {
      if (f.kind !== "asset" || f.assetVersion == null) continue;
      const prev = byNo.get(f.assetVersion);
      if (!prev || f.createdAt > prev.createdAt) byNo.set(f.assetVersion, f);
    }
    return [...byNo.values()].sort((a, b) => (a.assetVersion ?? 0) - (b.assetVersion ?? 0));
  }, [files]);
  const hasAsset = (no: number) => assetFiles.some((f) => f.assetVersion === no);
  /** 화면 데이터 번호별 패키지 수. 1개뿐이면 서버가 지우지 않는다(보관본) */
  const assetCount = useMemo(() => {
    const n = new Map<number, number>();
    for (const f of files) {
      if (f.kind === "asset" && f.assetVersion != null) n.set(f.assetVersion, (n.get(f.assetVersion) ?? 0) + 1);
    }
    return n;
  }, [files]);
  const lastOfItsNumber = (f: OtaFile) =>
    f.kind === "asset" && f.assetVersion != null && (assetCount.get(f.assetVersion) ?? 0) <= 1;
  /** 목록: 최근에 올린 것부터 */
  const allFiles = useMemo(() => [...files].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)), [files]);
  const kindText = (f: OtaFile) =>
    f.kind === "asset"
      ? `화면 데이터 ${f.assetVersion}번`
      : f.version
        ? `코드 v${f.version} · 화면 ${f.assetVersion ?? 1}번`
        : "일반 파일";

  /** 코드 패키지가 장비의 화면 데이터와 다른 번호를 요구할 때, 보낼 수 없는 이유 (보낼 수 있으면 null) */
  const blockedReason = (f: OtaFile): string | null => {
    const need = f.assetVersion ?? 1;
    if (assetNo === null || need === assetNo) return null;
    if (!assetRemote) return `화면 ${need}번 필요, 이 장비는 화면 원격 교체 미지원(2.5.0 이상 필요)`;
    if (!hasAsset(need)) return `서버에 화면 ${need}번 패키지 없음`;
    if (!hasAsset(assetNo)) return `서버에 보관본(화면 ${assetNo}번) 패키지 없음`;
    return null;
  };
  const changesScreen = (f: OtaFile) => assetNo !== null && (f.assetVersion ?? 1) !== assetNo;

  const chosen = codeFiles.find((f) => f.id === selected) ?? null;
  const chosenBlocked = chosen ? blockedReason(chosen) : null;
  const chosenScreen = chosen ? changesScreen(chosen) && !chosenBlocked : false;
  const notNewer = chosen && current ? !versionNewer(chosen.version ?? "", current) : false;

  const send = async () => {
    if (!chosen) return;
    setConfirmOpen(false);
    setSending(true);
    setBanner({ tone: "pending", title: `v${chosen.version} OTA 명령 전송 중…` });
    try {
      const res = await fetch("/api/receiver/commands/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installationId,
          module: 0,
          power: "ota",
          fields: { fileId: chosen.id },
          requestedBy,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBanner({
          tone: "err",
          title: "OTA 명령 실패",
          detail:
            body.code === "ACTIVE_COMMAND_EXISTS"
              ? "이미 대기 중인 명령이 있습니다."
              : body.code === "OTA_ASSET_NOT_SUPPORTED"
                ? "이 장비는 화면 데이터 원격 교체를 지원하지 않습니다."
                : body.code === "OTA_ASSET_FILE_MISSING" || body.code === "OTA_ASSET_BACKUP_MISSING"
                  ? "필요한 화면 데이터 패키지가 서버에 없습니다."
                  : (body.message ?? `HTTP ${res.status}`),
        });
        return;
      }
      setBanner(null);
      setNow(Date.now());
      setSent({
        commandId: typeof body?.command?.id === "string" ? body.command.id : null,
        version: chosen.version ?? "?",
        at: Date.now(),
        withScreen: chosenScreen,
      });
    } catch {
      setBanner({ tone: "err", title: "OTA 명령 실패", detail: "서버에 연결할 수 없습니다." });
    } finally {
      setSending(false);
    }
  };

  const removeFile = async () => {
    const f = deleteTarget;
    if (!f) return;
    setDeleteTarget(null);
    setDeleting(true);
    try {
      const res = await fetch(`/api/receiver/ota/files/${encodeURIComponent(f.id)}`, { method: "DELETE" });
      if (res.status === 204 || res.status === 404) {
        if (selected === f.id) setSelected("");
        setBanner({ tone: "ok", title: `${f.name} 삭제됨` });
      } else {
        const body = await res.json().catch(() => ({}));
        setBanner({ tone: "err", title: "패키지 삭제 실패", detail: body.message ?? `HTTP ${res.status}` });
      }
    } catch {
      setBanner({ tone: "err", title: "패키지 삭제 실패", detail: "서버에 연결할 수 없습니다." });
    } finally {
      setDeleting(false);
      void loadFiles();
    }
  };

  return (
    <section className="device-settings-section">
      <div className="chart-card chart-card-wide device-firmware-panel">
        <div className="device-module-power-head">
          <h3 className="chart-title">펌웨어</h3>
          {banner ? <StatusCard banner={banner} /> : null}
        </div>

        <dl className="device-firmware-facts">
          <div>
            <dt>현재 버전</dt>
            <dd>{current ? `v${current}` : "알 수 없음"}</dd>
          </div>
          <div>
            <dt>화면 데이터</dt>
            <dd>
              {assetNo !== null ? `${assetNo}번` : "알 수 없음"}
              {assetNo !== null && assetRemote ? " (원격 교체 가능)" : ""}
            </dd>
          </div>
          <div>
            <dt>OTA 상태</dt>
            <dd>{!capable ? "OTA 미지원 펌웨어" : stateText}</dd>
          </div>
        </dl>

        {stage ? (
          <ProgressCard
            stage={stage}
            version={stageVersion}
            since={stageSince}
            now={now}
            note={stageNote}
            withScreen={withScreen}
          />
        ) : null}

        <div className="device-firmware-send">
          <label htmlFor="ota-file">업데이트할 패키지</label>
          <select
            id="ota-file"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={!capable || sending}
          >
            <option value="">선택하세요</option>
            {codeFiles.map((f) => {
              const blocked = blockedReason(f);
              return (
                <option key={f.id} value={f.id} disabled={blocked !== null}>
                  v{f.version} · 화면 {f.assetVersion ?? 1}번 · {f.name} · {Math.round(f.size / 1024)} KB ·{" "}
                  {fmtTime(f.createdAt)}
                  {blocked ? ` — 보낼 수 없음: ${blocked}` : changesScreen(f) ? " — 화면 데이터도 바뀜" : ""}
                </option>
              );
            })}
          </select>
          <button
            type="button"
            className="module-power-confirm-submit module-power-confirm-submit--on"
            disabled={!chosen || !capable || sending || notNewer || active || chosenBlocked !== null}
            onClick={() => setConfirmOpen(true)}
          >
            OTA 보내기
          </button>
        </div>
        <p className="device-firmware-hint">
          {!capable
            ? "이 기기는 OTA를 지원하지 않는 펌웨어입니다. 현장에서 ST-Link로 OTA 펌웨어를 먼저 설치해야 합니다."
            : notNewer
              ? "현재 버전보다 높은 버전만 보낼 수 있습니다(HMI가 거절합니다)."
              : active
                ? "업데이트가 진행 중입니다. 끝난 뒤 다시 보낼 수 있습니다."
                : chosenScreen
                  ? `화면 데이터도 바뀝니다(화면 ${assetNo}번 → ${chosen?.assetVersion ?? 1}번). 보관본과 새 화면을 받은 뒤 코드를 받습니다(전체 약 15분). 화면 데이터를 기록할 때 약 10초씩, 설치할 때 약 15초 멈추고, 새 펌웨어가 화면을 바꾸는 약 2분 동안 화면에는 진행 막대만 보입니다(제어와 통신은 계속). 문제가 있으면 이전 버전과 이전 화면으로 자동 복구됩니다.`
                  : "명령 하나로 다운로드(약 2분) → 서명 검사 → 자동 적용까지 진행합니다. 적용할 때 약 15초 동안 화면과 제어가 멈춥니다. 새 버전이 정상 동작하지 않으면 이전 버전으로 자동 복구됩니다."}
        </p>
        {codeFiles.some((f) => blockedReason(f) !== null) ? (
          <p className="device-firmware-hint">
            흐리게 표시된 패키지는 이 장비의 화면 데이터({assetNo}번)와 맞지 않아 지금은 보낼 수 없습니다. 이유는 목록에
            적혀 있습니다.
          </p>
        ) : null}

        <h4 className="device-firmware-subtitle">화면 데이터 패키지</h4>
        {assetFiles.length === 0 ? (
          <p className="device-firmware-hint">
            서버에 화면 데이터 패키지가 없습니다. 화면 데이터가 바뀌는 펌웨어를 보내려면 새 화면과 이 장비의 지금 화면
            패키지(보관본)가 모두 있어야 합니다.
          </p>
        ) : (
          <div className="fault-table-wrap">
            <table className="fault-table">
              <thead>
                <tr>
                  <th>화면 번호</th>
                  <th>파일</th>
                  <th>크기</th>
                  <th>올린 시각</th>
                </tr>
              </thead>
              <tbody>
                {assetFiles.map((f) => (
                  <tr key={f.id}>
                    <td>
                      {f.assetVersion}번{f.assetVersion === assetNo ? " (이 장비의 지금 화면)" : ""}
                    </td>
                    <td>{f.name}</td>
                    <td>{Math.round(f.size / 1024).toLocaleString("ko-KR")} KB</td>
                    <td>{fmtTime(f.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h4 className="device-firmware-subtitle">서버의 패키지</h4>
        {allFiles.length === 0 ? (
          <p className="device-firmware-hint">서버에 올린 패키지가 없습니다.</p>
        ) : (
          <>
            <p className="device-firmware-hint">
              패키지는 모든 장비가 같이 씁니다. 지우면 어느 장비에도 보낼 수 없습니다. 화면 데이터 번호마다 마지막
              패키지는 되돌리기용 보관본이라 지울 수 없습니다.
            </p>
            <div className="fault-table-wrap">
              <table className="fault-table">
                <thead>
                  <tr>
                    <th>종류</th>
                    <th>파일</th>
                    <th>크기</th>
                    <th>올린 시각</th>
                    <th>올린 사람</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {allFiles.map((f) => {
                    const locked = lastOfItsNumber(f);
                    return (
                      <tr key={f.id}>
                        <td>{kindText(f)}</td>
                        <td>{f.name}</td>
                        <td>{Math.round(f.size / 1024).toLocaleString("ko-KR")} KB</td>
                        <td>{fmtTime(f.createdAt)}</td>
                        <td>{f.uploadedBy ?? "—"}</td>
                        <td>
                          <button
                            type="button"
                            className="module-power-confirm-cancel"
                            disabled={locked || deleting || active}
                            title={
                              locked
                                ? `화면 데이터 ${f.assetVersion}번의 마지막 패키지(보관본)라 지울 수 없습니다`
                                : active
                                  ? "업데이트가 진행 중에는 지울 수 없습니다"
                                  : undefined
                            }
                            onClick={() => setDeleteTarget(f)}
                          >
                            {locked ? "보관본" : "삭제"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        <h4 className="device-firmware-subtitle">진행 이력</h4>
        {events.length === 0 ? (
          <p className="device-firmware-hint">아직 기록이 없습니다.</p>
        ) : (
          <div className="fault-table-wrap">
            <table className="fault-table">
              <thead>
                <tr>
                  <th>시각</th>
                  <th>상태</th>
                  <th>실행 버전</th>
                  <th>대상 버전</th>
                  <th>내용</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td>{fmtTime(e.createdAt)}</td>
                    <td>
                      {STATE_LABEL[e.state] ?? e.state}
                      {e.stage && e.stage !== "code" && STAGE_NAME[e.stage] ? ` · ${STAGE_NAME[e.stage]}` : ""}
                      {e.state === "downloading" && typeof e.percent === "number" && e.percent > 0
                        ? ` ${e.percent}%`
                        : ""}
                    </td>
                    <td>{e.fw ? `v${e.fw}` : "—"}</td>
                    <td>{attemptedTarget(e) ? `v${attemptedTarget(e)}` : "—"}</td>
                    <td>{errorText(e)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirmOpen && chosen ? (
        <div
          className="module-power-confirm-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmOpen(false);
          }}
        >
          <div
            className="module-power-confirm module-power-confirm--on"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ota-confirm-title"
            aria-describedby="ota-confirm-desc"
          >
            <p className="module-power-confirm-kicker">펌웨어 업데이트 확인</p>
            <h4 id="ota-confirm-title" className="module-power-confirm-title">
              v{current ?? "?"} → v{chosen.version} 로 업데이트할까요?
            </h4>
            <p id="ota-confirm-desc" className="module-power-confirm-desc">
              {chosenScreen
                ? `화면 데이터도 ${assetNo}번에서 ${chosen.assetVersion ?? 1}번으로 바뀝니다. HMI가 명령을 받으면 사람 확인 없이 보관본·새 화면·코드를 차례로 받아(약 15분) 자동으로 적용합니다. 설치할 때 약 15초 화면과 제어가 멈추고, 이어서 약 2분 동안 화면을 바꿉니다(제어와 통신은 계속).`
                : "HMI가 명령을 받으면 사람 확인 없이 다운로드 후 자동으로 적용합니다. 적용하는 동안 약 15초 화면과 제어가 멈추고 재부팅됩니다."}
            </p>
            <div className="module-power-confirm-actions">
              <button type="button" className="module-power-confirm-cancel" onClick={() => setConfirmOpen(false)}>
                취소
              </button>
              <button
                type="button"
                className="module-power-confirm-submit module-power-confirm-submit--on"
                onClick={() => void send()}
              >
                업데이트 전송
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div
          className="module-power-confirm-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteTarget(null);
          }}
        >
          <div
            className="module-power-confirm module-power-confirm--off"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ota-delete-title"
            aria-describedby="ota-delete-desc"
          >
            <p className="module-power-confirm-kicker">패키지 삭제 확인</p>
            <h4 id="ota-delete-title" className="module-power-confirm-title">
              {deleteTarget.name} 을(를) 지울까요?
            </h4>
            <p id="ota-delete-desc" className="module-power-confirm-desc">
              {kindText(deleteTarget)} · {Math.round(deleteTarget.size / 1024).toLocaleString("ko-KR")} KB ·{" "}
              {fmtTime(deleteTarget.createdAt)}. 서버에서 지워지며 되돌릴 수 없습니다. 모든 장비의 목록에서 사라집니다.
            </p>
            <div className="module-power-confirm-actions">
              <button type="button" className="module-power-confirm-cancel" onClick={() => setDeleteTarget(null)}>
                취소
              </button>
              <button
                type="button"
                className="module-power-confirm-submit module-power-confirm-submit--off"
                onClick={() => void removeFile()}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
