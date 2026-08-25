"use client";

import { useEffect, useState } from "react";
import { useWsEvents } from "../hooks/useWsEvents";

const COMMAND_ACK_TIMEOUT_MS = 130_000;

type Props = {
  installationId: string;
  requestedBy?: string;
  compact?: boolean;
};

type StatusTone = "pending" | "ok" | "err";

type StatusBanner = {
  tone: StatusTone;
  title: string;
  detail?: string;
  commandId?: string;
};

function RefreshStatusCard({ status }: { status: StatusBanner }) {
  return (
    <div
      className={`device-settings-status device-settings-status--${status.tone}`}
      role="status"
      aria-live="polite"
      aria-busy={status.tone === "pending"}
    >
      <div className="device-settings-status-icon" aria-hidden>
        {status.tone === "pending" ? (
          <span className="device-settings-status-spinner" />
        ) : status.tone === "ok" ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <div className="device-settings-status-body">
        <p className="device-settings-status-title">{status.title}</p>
        {status.detail ? (
          <p className="device-settings-status-detail">{status.detail}</p>
        ) : null}
        {status.commandId ? (
          <code className="device-settings-status-cmd">{status.commandId}</code>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Monitor-tab button: enqueue HMI `refresh` (telemetry / monitor metrics only).
 * Does not request a settings snapshot.
 */
export default function DeviceDataRefreshButton({
  installationId,
  requestedBy,
  compact = false,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusBanner | null>(null);
  const [pendingCommandId, setPendingCommandId] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingCommandId) return;
    const timer = setTimeout(() => {
      setPendingCommandId(null);
      setStatus({
        tone: "err",
        title: "HMI 응답 시간 초과",
        detail:
          "최대 130초 대기했습니다. 명령은 등록되었을 수 있으나 실행 여부를 확인할 수 없습니다.",
        commandId: pendingCommandId,
      });
    }, COMMAND_ACK_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pendingCommandId]);

  useWsEvents((msg) => {
    if (
      msg.type === "command_acked" &&
      msg.installationId === installationId &&
      pendingCommandId &&
      msg.commandId === pendingCommandId
    ) {
      const cmdId = msg.commandId;
      setPendingCommandId(null);
      setStatus(
        msg.status === "acked"
          ? {
              tone: "ok",
              title: "데이터 갱신 실행 완료",
              detail:
                "모니터 계측값이 곧 반영됩니다. (설정 스냅샷은 포함되지 않습니다)",
              commandId: cmdId,
            }
          : {
              tone: "err",
              title: "데이터 갱신 실행 실패",
              detail: "HMI가 명령을 거절했거나 실행에 실패했습니다.",
              commandId: cmdId,
            },
      );
    }
  });

  const send = async () => {
    setBusy(true);
    setStatus(null);
    setPendingCommandId(null);
    try {
      const res = await fetch("/api/receiver/commands/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          installationId,
          module: 0,
          power: "refresh",
          ...(requestedBy ? { requestedBy } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        code?: string;
        command?: { id: string };
      };
      if (!res.ok) {
        setStatus({
          tone: "err",
          title: "데이터 갱신 실패",
          detail: data.message ?? data.code ?? `HTTP ${res.status}`,
        });
        return;
      }
      const id = data.command?.id ?? "";
      setPendingCommandId(id || null);
      setStatus({
        tone: "pending",
        title: "데이터 갱신 대기 중",
        detail: "HMI가 다음 명령 폴링에서 모니터 계측값을 올립니다.",
        commandId: id || undefined,
      });
    } catch {
      setStatus({
        tone: "err",
        title: "네트워크 오류",
        detail: "데이터 갱신 명령을 등록하지 못했습니다.",
      });
    } finally {
      setBusy(false);
    }
  };

  const locked = busy || pendingCommandId !== null;

  if (compact) {
    return (
      <div className="device-monitor-refresh device-monitor-refresh--compact">
        <button
          type="button"
          className="device-settings-sync-btn device-settings-sync-btn--compact"
          disabled={locked}
          aria-busy={locked}
          onClick={() => void send()}
        >
          {locked ? "갱신 중…" : "↻ 데이터 갱신"}
        </button>
        {status ? (
          <span
            className={`device-refresh-inline device-refresh-inline--${status.tone}`}
            role="status"
          >
            {status.title}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="device-monitor-refresh">
      <div className="device-monitor-refresh-bar">
        <div className="device-monitor-refresh-copy">
          <p className="device-monitor-refresh-kicker">온디맨드 동기화</p>
          <h3 className="device-monitor-refresh-title">모니터 계측</h3>
          <p className="device-monitor-refresh-desc">
            전압·전류·PF 등 실시간 계측값만 HMI에서 다시 받습니다. 설정값·모듈
            상태는 포함되지 않습니다.
          </p>
        </div>
        <button
          type="button"
          className="device-settings-sync-btn"
          disabled={locked}
          aria-busy={locked}
          onClick={() => void send()}
        >
          <span className="device-settings-sync-btn-main">
            {locked ? "갱신 중…" : "↻ 데이터 갱신"}
          </span>
          <span className="device-settings-sync-btn-sub">모니터 계측값만</span>
        </button>
      </div>
      {status ? <RefreshStatusCard status={status} /> : null}
    </div>
  );
}
