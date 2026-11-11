"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * 펌웨어(OTA) 탭 — 관리자 전용.
 *   - 현재 펌웨어 버전 / 화면 데이터 번호 / OTA 상태 (텔레메트리 fw, assetVersion, otaState)
 *   - 업로드된 OTA 패키지를 골라 OTA 명령 전송 (명령 하나로 다운로드 → 검사 → 자동 적용)
 *   - HMI 가 보낸 진행/결과 이력 (POST /receiver/ota/status)
 * HMI 쪽 동작: HMI 저장소 docs/OTA_DEVELOPMENT_PLAN.md 12장 단계 7–8.
 */

type OtaFile = {
  id: string;
  name: string;
  size: number;
  version: string | null;
  productId: number | null;
  assetVersion: number | null;
  createdAt: string;
};

type OtaEvent = {
  id: string;
  commandId: string | null;
  state: string;
  percent: number | null;
  fw: string | null;
  target: string | null;
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

type Stage = "queued" | "downloading" | "verified" | "installing" | "confirming";

const STEPS: { key: Stage; label: string }[] = [
  { key: "queued", label: "명령 전달" },
  { key: "downloading", label: "다운로드" },
  { key: "verified", label: "검사·기록" },
  { key: "installing", label: "설치·재부팅" },
  { key: "confirming", label: "새 버전 확인" },
];

const STAGE_HINT: Record<Stage, string> = {
  queued: "HMI가 다음 보고 때 명령을 받습니다(최대 약 10분).",
  downloading: "LTE로 펌웨어를 받는 중입니다(약 2분).",
  verified: "서명 검사를 통과했고 외부 플래시에 기록하는 중입니다.",
  installing: "HMI가 재부팅해서 새 펌웨어를 설치하는 중입니다. 약 15초 동안 화면과 제어가 멈춥니다.",
  confirming: "새 버전이 정상 동작하는지 확인하는 중입니다(약 1–5분). 문제가 있으면 이전 버전으로 자동 복구됩니다.",
};

type Sent = { commandId: string | null; version: string; at: number };

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
};

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
}: {
  stage: Stage;
  version: string | null;
  since: number;
  now: number;
  note?: string;
}) {
  const idx = STEPS.findIndex((s) => s.key === stage);
  const elapsed = now - since;
  const slow = elapsed > (stage === "queued" ? COMMAND_TTL_MS : SLOW_MS);
  return (
    <div className="device-firmware-progress" role="status" aria-live="polite" aria-busy="true">
      <div className="device-firmware-progress-head">
        <span className="device-settings-status-spinner" aria-hidden />
        <span className="device-firmware-progress-title">
          {version ? `v${version} ` : ""}업데이트 진행 중 · {STEPS[idx]?.label}
          {note ? ` (${note})` : ""}
        </span>
        <span className="device-firmware-progress-time">{fmtElapsed(elapsed)}</span>
      </div>
      <ol className="device-firmware-steps">
        {STEPS.map((s, i) => (
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

  const stage: Stage | null = queued
    ? "queued"
    : inProgress && latest
      ? latest.state === "downloading"
        ? "downloading"
        : latest.state === "verified"
          ? "verified"
          : recordState === "pending_confirm" || recordState === "rollback"
            ? "confirming"
            : "installing"
      : null;
  const stageSince = queued && sent ? sent.at : latestAt;
  const stageVersion = queued && sent ? sent.version : (latest?.target ?? null);
  const stageNote = stage === "confirming" && recordState === "rollback" ? "이전 버전으로 복구 중" : undefined;
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
        detail: latest.error ? (ERROR_LABEL[latest.error] ?? latest.error) : undefined,
      });
    } else {
      setBanner({
        tone: "err",
        title: `v${sent.version} 업데이트 실패`,
        detail: latest.error ? (ERROR_LABEL[latest.error] ?? latest.error) : undefined,
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

  useEffect(() => {
    void loadStatus();
    void (async () => {
      try {
        const res = await fetch("/api/receiver/ota/files", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { files: OtaFile[] };
        setFiles((body.files ?? []).filter((f) => f.version));
      } catch {
        /* no list */
      }
    })();
  }, [loadStatus]);

  useEffect(() => {
    const t = setInterval(() => void loadStatus(), active ? POLL_ACTIVE_MS : POLL_MS);
    return () => clearInterval(t);
  }, [loadStatus, active]);

  const chosen = files.find((f) => f.id === selected) ?? null;
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
          detail: body.code === "ACTIVE_COMMAND_EXISTS" ? "이미 대기 중인 명령이 있습니다." : body.message ?? `HTTP ${res.status}`,
        });
        return;
      }
      setBanner(null);
      setNow(Date.now());
      setSent({
        commandId: typeof body?.command?.id === "string" ? body.command.id : null,
        version: chosen.version ?? "?",
        at: Date.now(),
      });
    } catch {
      setBanner({ tone: "err", title: "OTA 명령 실패", detail: "서버에 연결할 수 없습니다." });
    } finally {
      setSending(false);
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
          <ProgressCard stage={stage} version={stageVersion} since={stageSince} now={now} note={stageNote} />
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
            {files.map((f) => (
              <option key={f.id} value={f.id}>
                v{f.version} · {f.name} · {Math.round(f.size / 1024)} KB · {fmtTime(f.createdAt)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="module-power-confirm-submit module-power-confirm-submit--on"
            disabled={!chosen || !capable || sending || notNewer || active}
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
                : "명령 하나로 다운로드(약 2분) → 서명 검사 → 자동 적용까지 진행합니다. 적용할 때 약 15초 동안 화면과 제어가 멈춥니다. 새 버전이 정상 동작하지 않으면 이전 버전으로 자동 복구됩니다."}
        </p>

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
                    <td>{STATE_LABEL[e.state] ?? e.state}</td>
                    <td>{e.fw ? `v${e.fw}` : "—"}</td>
                    <td>{attemptedTarget(e) ? `v${attemptedTarget(e)}` : "—"}</td>
                    <td>{e.error ? ERROR_LABEL[e.error] ?? e.error : ""}</td>
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
              HMI가 명령을 받으면 사람 확인 없이 다운로드 후 자동으로 적용합니다. 적용하는 동안 약 15초
              화면과 제어가 멈추고 재부팅됩니다.
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
    </section>
  );
}
