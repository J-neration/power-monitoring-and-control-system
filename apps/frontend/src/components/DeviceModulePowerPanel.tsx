"use client";

import { useEffect, useState } from "react";
import {
  moduleChipClassName,
  moduleStatusLabel,
  moduleTelemetrySuggestsOn,
} from "../lib/moduleStatus";
import { useWsEvents } from "../hooks/useWsEvents";

const MODULE_SLOT_COUNT = 6;

type Props = {
  installationId: string;
  /** HMI 텔레메트리 `moduleStatus[]` (없으면 슬롯별 상태는 —) */
  moduleStatus?: number[];
  /** 장치에 연결된 모듈 개수. 없으면 6슬롯 모두 제어 가능(기존 동작). */
  numOfMods?: number;
  requestedBy?: string;
};

export default function DeviceModulePowerPanel({
  installationId,
  moduleStatus,
  numOfMods,
  requestedBy,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "ok" | "err";
    text: string;
    hint?: string;
  } | null>(null);
  const [pendingCommandId, setPendingCommandId] = useState<string | null>(null);
  const [pendingCommandLabel, setPendingCommandLabel] = useState<string | null>(
    null,
  );

  // 60초 안에 HMI ACK가 오지 않으면 대기 상태를 해제
  useEffect(() => {
    if (!pendingCommandId) return;
    const timer = setTimeout(() => {
      setPendingCommandId(null);
      setPendingCommandLabel(null);
      setMessage({
        type: "err",
        text: "HMI 응답 시간 초과 (60초) — 명령은 등록되었을 수 있으나 실행 여부를 확인할 수 없습니다.",
      });
    }, 60_000);
    return () => clearTimeout(timer);
  }, [pendingCommandId]);

  // Update message when HMI ACKs the pending command
  useWsEvents((msg) => {
    if (
      msg.type === "command_acked" &&
      msg.installationId === installationId &&
      pendingCommandId &&
      msg.commandId === pendingCommandId
    ) {
      const label = pendingCommandLabel ?? "명령";
      setPendingCommandId(null);
      setPendingCommandLabel(null);
      setMessage(
        msg.status === "acked"
          ? {
              type: "ok",
              text: `${label} 실행 완료`,
              hint: "약 15~20초 후 데이터가 갱신됩니다. 잠시 기다려주세요.",
            }
          : { type: "err", text: `${label} 실행 실패` },
      );
    }
  });

  const send = async (module: number, power: "on" | "off" | "refresh") => {
    const key = `${module}-${power}`;
    const label =
      power === "refresh"
        ? "데이터 갱신"
        : `M${module + 1} 파워 ${power === "on" ? "ON" : "OFF"}`;
    setBusy(key);
    setMessage(null);
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
        setMessage({
          type: "err",
          text: data.message ?? data.code ?? `요청 실패 (${res.status})`,
        });
        return;
      }
      const id = data.command?.id ?? "";
      setPendingCommandId(id || null);
      setMessage({
        type: "ok",
        text: id
          ? `${label} 명령 등록됨 ${id}— HMI 응답 대기 중…`
          : `${label} 명령이 등록되었습니다.`,
      });
    } catch {
      setPendingCommandLabel(null);
      setMessage({ type: "err", text: "네트워크 오류" });
    } finally {
      setBusy(null);
    }
  };

  const activeSlots =
    numOfMods == null || Number.isNaN(numOfMods)
      ? MODULE_SLOT_COUNT
      : Math.min(Math.max(0, Math.trunc(numOfMods)), MODULE_SLOT_COUNT);

  return (
    <section className="device-detail-body">
      <div className="chart-card chart-card-wide device-module-power-panel">
        <h3 className="chart-title">
          모듈 전원 제어
          <span className="chart-title-sub">관리자 · 장치 폴링 후 실행</span>
        </h3>

        {message ? (
          <div role="status" className="device-module-power-msg-wrap">
            <p
              className={
                message.type === "ok"
                  ? "device-module-power-msg device-module-power-msg-ok"
                  : "device-module-power-msg device-module-power-msg-err"
              }
            >
              {message.text}
            </p>
            {message.hint ? (
              <p className="device-module-power-msg device-module-power-msg-hint">
                {message.hint}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="device-refresh-row">
          <button
            type="button"
            className="device-refresh-btn"
            disabled={busy !== null || pendingCommandId !== null}
            aria-busy={busy === "0-refresh" || pendingCommandId !== null}
            onClick={() => void send(0, "refresh")}
          >
            {busy === "0-refresh" || pendingCommandId !== null
              ? "…"
              : "↻ 데이터 갱신"}
          </button>
          <span className="device-refresh-hint">
            HMI에 갱신 명령을 전송합니다
          </span>
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
                    disabled={
                      busy !== null || pendingCommandId !== null || !slotActive
                    }
                    aria-busy={busy === `${i}-off`}
                    onClick={() => void send(i, "off")}
                  >
                    {busy === `${i}-off` ? "…" : "OFF"}
                  </button>
                  <button
                    type="button"
                    className="module-power-switch-seg module-power-switch-seg-on"
                    disabled={
                      busy !== null || pendingCommandId !== null || !slotActive
                    }
                    aria-busy={busy === `${i}-on`}
                    onClick={() => void send(i, "on")}
                  >
                    {busy === `${i}-on` ? "…" : "ON"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
