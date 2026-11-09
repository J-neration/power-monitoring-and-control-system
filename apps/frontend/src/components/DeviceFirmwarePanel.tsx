"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * 펌웨어(OTA) 탭 — 관리자 전용.
 *   - 현재 펌웨어 버전 / OTA 상태 (텔레메트리 fw, otaState)
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
  device: { fwVersion: string | null; otaCapable: boolean | null; otaState: string | null } | null;
  events: OtaEvent[];
};

type Banner = { tone: "pending" | "ok" | "err"; title: string; detail?: string };

type Props = {
  installationId: string;
  fwVersion?: string | null;
  otaCapable?: boolean | null;
  otaState?: string | null;
  requestedBy?: string;
};

const POLL_MS = 15_000;

const STATE_LABEL: Record<string, string> = {
  downloading: "다운로드 중",
  verified: "검사 완료",
  installing: "설치 중(재부팅)",
  confirmed: "업데이트 완료",
  rolled_back: "이전 버전으로 복구",
  failed: "실패",
  // otaState (HMI 레코드)
  idle: "대기",
  pending_confirm: "새 버전 확인 중",
  rollback: "복구 중",
};

const ERROR_LABEL: Record<string, string> = {
  download: "다운로드 실패",
  backup: "백업 생성 실패",
  slot: "외부 플래시 기록 실패",
  record: "상태 기록 실패",
  rollback: "새 버전이 정상 동작하지 않아 이전 버전으로 복구",
  no_backup: "복구할 백업이 없음",
  backup_failed: "복구한 버전도 확인되지 않음",
  signature: "서명 불일치",
  sha256: "파일 손상(SHA-256)",
  "image crc": "파일 손상(CRC)",
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
  requestedBy,
}: Props) {
  const [files, setFiles] = useState<OtaFile[]>([]);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [selected, setSelected] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [sending, setSending] = useState(false);

  const current = status?.device?.fwVersion ?? fwVersion ?? null;
  const capable = (status?.device?.otaCapable ?? otaCapable) === true;
  const recordState = status?.device?.otaState ?? otaState ?? null;
  const events = useMemo(() => status?.events ?? [], [status]);
  const latest = events[0];
  const inProgress = latest ? !FINAL_STATES.has(latest.state) : false;

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
    const t = setInterval(() => void loadStatus(), POLL_MS);
    return () => clearInterval(t);
  }, [loadStatus]);

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
      setBanner({
        tone: "ok",
        title: `v${chosen.version} OTA 명령을 보냈습니다`,
        detail: "HMI가 다음 보고(최대 약 10분) 때 받아 다운로드를 시작합니다. 아래 이력에서 진행을 확인하세요.",
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
            <dt>OTA 상태</dt>
            <dd>
              {!capable
                ? "OTA 미지원 펌웨어"
                : inProgress && latest
                  ? `${STATE_LABEL[latest.state] ?? latest.state}${latest.target ? ` (v${latest.target})` : ""}`
                  : STATE_LABEL[recordState ?? "idle"] ?? recordState ?? "대기"}
            </dd>
          </div>
        </dl>

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
            disabled={!chosen || !capable || sending || notNewer || inProgress}
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
              : inProgress
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
                    <td>{e.target ? `v${e.target}` : "—"}</td>
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
