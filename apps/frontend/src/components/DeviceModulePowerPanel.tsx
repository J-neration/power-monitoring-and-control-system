"use client";

import { useEffect, useState } from "react";
import {
  moduleChipClassName,
  moduleStatusLabel,
  moduleTelemetrySuggestsOn,
} from "../lib/moduleStatus";
import { useWsEvents } from "../hooks/useWsEvents";

const MODULE_SLOT_COUNT = 6;
const COMMAND_ACK_TIMEOUT_MS = 130_000;

type CommandPower = "on" | "off" | "refreshSettings";

type Props = {
  installationId: string;
  /** HMI 텔레메트리 `moduleStatus[]` (없으면 슬롯별 상태는 —) */
  moduleStatus?: number[];
  /** 장치에 연결된 모듈 개수. 없으면 6슬롯 모두 제어 가능(기존 동작). */
  numOfMods?: number;
  requestedBy?: string;
  /** Called after successful `refreshSettings` ACK (HMI posted settings + moduleStatus). */
  onSettingsRefreshAcked?: () => void;
};

export default function DeviceModulePowerPanel({
  installationId,
  moduleStatus,
  numOfMods,
  requestedBy,
  onSettingsRefreshAcked,
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
  const [pendingPower, setPendingPower] = useState<CommandPower | null>(null);

  // HMI 폴링 주기(60초) 고려: 최대 130초까지 ACK 대기
  useEffect(() => {
    if (!pendingCommandId) return;
    const timer = setTimeout(() => {
      setPendingCommandId(null);
      setPendingCommandLabel(null);
      setPendingPower(null);
      setMessage({
        type: "err",
        text: "HMI 응답 시간 초과 (최대 130초 대기) — 명령은 등록되었을 수 있으나 실행 여부를 확인할 수 없습니다.",
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
      const label = pendingCommandLabel ?? "명령";
      const wasSettingsRefresh = pendingPower === "refreshSettings";
      setPendingCommandId(null);
      setPendingCommandLabel(null);
      setPendingPower(null);
      setMessage(
        msg.status === "acked"
          ? {
              type: "ok",
              text: `${label} 실행 완료`,
              hint: wasSettingsRefresh
                ? "설정 스냅샷·모듈 상태를 불러옵니다. 반영까지 수 초 걸릴 수 있습니다."
                : "모듈 상태가 곧 갱신될 수 있습니다.",
            }
          : { type: "err", text: `${label} 실행 실패` },
      );
      if (msg.status === "acked" && wasSettingsRefresh) {
        onSettingsRefreshAcked?.();
      }
    }
  });

  const send = async (module: number, power: CommandPower) => {
    const key = `${module}-${power}`;
    const label =
      power === "refreshSettings"
        ? "설정값 갱신"
        : `M${module + 1} 파워 ${power === "on" ? "ON" : "OFF"}`;
    setBusy(key);
    setMessage(null);
    setPendingCommandId(null);
    setPendingCommandLabel(label);
    setPendingPower(power);
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
        setPendingPower(null);
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
          ? `${label} 명령 등록됨 ${id}— HMI 응답 대기 중… (최대 약 130초)`
          : `${label} 명령이 등록되었습니다.`,
      });
    } catch {
      setPendingCommandLabel(null);
      setPendingPower(null);
      setMessage({ type: "err", text: "네트워크 오류" });
    } finally {
      setBusy(null);
    }
  };

  const activeSlots =
    numOfMods == null || Number.isNaN(numOfMods)
      ? MODULE_SLOT_COUNT
      : Math.min(Math.max(0, Math.trunc(numOfMods)), MODULE_SLOT_COUNT);

  const refreshBusy =
    busy === "0-refreshSettings" ||
    (pendingCommandId !== null && pendingPower === "refreshSettings");

  return (
    <section className="device-detail-body">
      <div className="chart-card chart-card-wide device-module-power-panel">
        <h3 className="chart-title">
          모듈 전원 제어
          <span className="chart-title-sub">관리자 · 설정·모듈 상태</span>
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
            aria-busy={refreshBusy}
            onClick={() => void send(0, "refreshSettings")}
          >
            {refreshBusy ? "…" : "↻ 설정값 갱신"}
          </button>
          <span className="device-refresh-hint">
            설정 스냅샷·모듈 상태만 다시 받습니다 (모니터 계측은 모니터 탭)
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
