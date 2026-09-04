"use client";

import { useEffect, useRef, useState } from "react";
import {
  moduleChipClassName,
  moduleStatusLabel,
  moduleTelemetrySuggestsOn,
} from "../lib/moduleStatus";
import { useWsEvents } from "../hooks/useWsEvents";

const MODULE_SLOT_COUNT = 6;
const COMMAND_ACK_TIMEOUT_MS = 130_000;

type CommandPower = "on" | "off";

type StatusTone = "pending" | "ok" | "err";

type StatusBanner = {
  tone: StatusTone;
  title: string;
  detail?: string;
  commandId?: string;
};

type PendingConfirm = {
  module: number;
  power: CommandPower;
};

type Props = {
  installationId: string;
  /** HMI 텔레메트리 `moduleStatus[]` (없으면 슬롯별 상태는 —) */
  moduleStatus?: number[];
  /** 장치에 연결된 모듈 개수. 없으면 6슬롯 모두 제어 가능(기존 동작). */
  numOfMods?: number;
  requestedBy?: string;
};

function PowerStatusCard({ status }: { status: StatusBanner }) {
  return (
    <div
      className={`device-settings-status device-settings-status--${status.tone}`}
      role="status"
      aria-live="polite"
      aria-busy={status.tone === "pending"}
      title={status.detail ?? status.title}
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
      </div>
    </div>
  );
}

export default function DeviceModulePowerPanel({
  installationId,
  moduleStatus,
  numOfMods,
  requestedBy,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusBanner | null>(null);
  const [pendingCommandId, setPendingCommandId] = useState<string | null>(null);
  const [pendingCommandLabel, setPendingCommandLabel] = useState<string | null>(
    null,
  );
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const confirmRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pendingCommandId) return;
    const timer = setTimeout(() => {
      setPendingCommandId(null);
      setPendingCommandLabel(null);
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

  useEffect(() => {
    if (!confirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirm(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirm]);

  useWsEvents((msg) => {
    if (
      msg.type === "command_acked" &&
      msg.installationId === installationId &&
      pendingCommandId &&
      msg.commandId === pendingCommandId
    ) {
      const label = pendingCommandLabel ?? "명령";
      const cmdId = msg.commandId;
      setPendingCommandId(null);
      setPendingCommandLabel(null);
      setStatus(
        msg.status === "acked"
          ? {
              tone: "ok",
              title: `${label} 실행 완료`,
              detail:
                "모듈 상태는 위쪽 「설정값 갱신」으로 다시 받을 수 있습니다.",
              commandId: cmdId,
            }
          : {
              tone: "err",
              title: `${label} 실행 실패`,
              detail: "HMI가 명령을 거절했거나 실행에 실패했습니다.",
              commandId: cmdId,
            },
      );
    }
  });

  const requestConfirm = (module: number, power: CommandPower) => {
    if (busy !== null || pendingCommandId !== null) return;
    setConfirm({ module, power });
  };

  const send = async (module: number, power: CommandPower) => {
    const key = `${module}-${power}`;
    const label = `M${module + 1} 파워 ${power === "on" ? "ON" : "OFF"}`;
    setConfirm(null);
    setBusy(key);
    setStatus(null);
    setPendingCommandId(null);
    setPendingCommandLabel(label);
    try {
      const res = await fetch("/api/receiver/commands/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          installationId,
          module,
          power,
          ...(requestedBy ? { requestedBy } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        code?: string;
        command?: { id: string };
      };
      if (!res.ok) {
        setPendingCommandLabel(null);
        setStatus({
          tone: "err",
          title: "명령 등록 실패",
          detail: data.message ?? data.code ?? `HTTP ${res.status}`,
        });
        return;
      }
      const id = data.command?.id ?? "";
      setPendingCommandId(id || null);
      setStatus({
        tone: "pending",
        title: `${label} 대기 중`,
        detail: "HMI가 다음 명령 폴링에서 전원을 적용합니다.",
        commandId: id || undefined,
      });
    } catch {
      setPendingCommandLabel(null);
      setStatus({
        tone: "err",
        title: "네트워크 오류",
        detail: "전원 명령을 등록하지 못했습니다.",
      });
    } finally {
      setBusy(null);
    }
  };

  const activeSlots =
    numOfMods == null || Number.isNaN(numOfMods)
      ? MODULE_SLOT_COUNT
      : Math.min(Math.max(0, Math.trunc(numOfMods)), MODULE_SLOT_COUNT);

  const locked = busy !== null || pendingCommandId !== null;
  const confirmLabel = confirm
    ? `M${confirm.module + 1} 파워 ${confirm.power === "on" ? "ON" : "OFF"}`
    : "";

  return (
    <section className="device-settings-section">
      <div className="chart-card chart-card-wide device-module-power-panel">
        <div className="device-module-power-head">
          <h3 className="chart-title">모듈 전원</h3>
          {status ? <PowerStatusCard status={status} /> : null}
        </div>

        <div className="device-module-power-grid">
          {Array.from({ length: MODULE_SLOT_COUNT }, (_, i) => {
            const code = moduleStatus?.[i];
            const telemetryOn = moduleTelemetrySuggestsOn(code);
            const slotActive = i < activeSlots;
            const switchClass = telemetryOn
              ? "module-power-switch module-power-switch--telemetry-on"
              : "module-power-switch module-power-switch--telemetry-off";

            return (
              <div
                key={i}
                className={
                  slotActive
                    ? "device-module-power-cell"
                    : "device-module-power-cell device-module-power-cell--no-module"
                }
                title={
                  slotActive
                    ? undefined
                    : `이 장치는 모듈 ${activeSlots}개만 사용합니다 (M${i + 1} 비활성)`
                }
              >
                <span className="device-module-power-label">M{i + 1}</span>
                <span
                  className={`device-module-power-chip ${moduleChipClassName(code)}`}
                  title={
                    code === undefined
                      ? "이 슬롯에 대한 moduleStatus 없음"
                      : `moduleStatus[${i}] = ${code}`
                  }
                >
                  {moduleStatusLabel(code)}
                </span>
                <div
                  className={switchClass}
                  role="group"
                  aria-label={`모듈 ${i + 1} 전원`}
                  aria-disabled={!slotActive}
                >
                  <button
                    type="button"
                    className="module-power-switch-seg module-power-switch-seg-off"
                    disabled={locked || !slotActive}
                    aria-busy={busy === `${i}-off`}
                    onClick={() => requestConfirm(i, "off")}
                  >
                    {busy === `${i}-off` ? "…" : "OFF"}
                  </button>
                  <button
                    type="button"
                    className="module-power-switch-seg module-power-switch-seg-on"
                    disabled={locked || !slotActive}
                    aria-busy={busy === `${i}-on`}
                    onClick={() => requestConfirm(i, "on")}
                  >
                    {busy === `${i}-on` ? "…" : "ON"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {confirm ? (
        <div
          className="module-power-confirm-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirm(null);
          }}
        >
          <div
            ref={confirmRef}
            className={`module-power-confirm module-power-confirm--${confirm.power}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="module-power-confirm-title"
            aria-describedby="module-power-confirm-desc"
          >
            <p className="module-power-confirm-kicker">전원 명령 확인</p>
            <h4 id="module-power-confirm-title" className="module-power-confirm-title">
              「{confirmLabel}」 명령을 전송할까요?
            </h4>
            <p id="module-power-confirm-desc" className="module-power-confirm-desc">
              {confirm.power === "off"
                ? "해당 모듈 전원이 꺼질 수 있습니다. HMI가 명령을 받을 때까지 대기합니다."
                : "해당 모듈 전원이 켜질 수 있습니다. HMI가 명령을 받을 때까지 대기합니다."}
            </p>
            <div className="module-power-confirm-actions">
              <button
                type="button"
                className="module-power-confirm-cancel"
                onClick={() => setConfirm(null)}
              >
                취소
              </button>
              <button
                type="button"
                className={`module-power-confirm-submit module-power-confirm-submit--${confirm.power}`}
                onClick={() => void send(confirm.module, confirm.power)}
              >
                {confirm.power === "off" ? "OFF 전송" : "ON 전송"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
