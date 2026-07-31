"use client";

import { useEffect, useState } from "react";
import { useWsEvents } from "../hooks/useWsEvents";

const COMMAND_ACK_TIMEOUT_MS = 130_000;

type Props = {
  installationId: string;
  requestedBy?: string;
};

/**
 * Monitor-tab button: enqueue HMI `refresh` (telemetry / monitor metrics only).
 * Does not request a settings snapshot.
 */
export default function DeviceDataRefreshButton({
  installationId,
  requestedBy,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    type: "ok" | "err";
    text: string;
    hint?: string;
  } | null>(null);
  const [pendingCommandId, setPendingCommandId] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingCommandId) return;
    const timer = setTimeout(() => {
      setPendingCommandId(null);
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
      setPendingCommandId(null);
      setMessage(
        msg.status === "acked"
          ? {
              type: "ok",
              text: "데이터 갱신 실행 완료",
              hint: "모니터 계측값이 곧 반영됩니다. (설정 스냅샷은 포함되지 않습니다)",
            }
          : { type: "err", text: "데이터 갱신 실행 실패" },
      );
    }
  });

  const send = async () => {
    setBusy(true);
    setMessage(null);
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
          ? `데이터 갱신 명령 등록됨 ${id}— HMI 응답 대기 중… (최대 약 130초)`
          : "데이터 갱신 명령이 등록되었습니다.",
      });
    } catch {
      setMessage({ type: "err", text: "네트워크 오류" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="device-monitor-refresh">
      <div className="device-refresh-row device-refresh-row--flush">
        <button
          type="button"
          className="device-refresh-btn"
          disabled={busy || pendingCommandId !== null}
          aria-busy={busy || pendingCommandId !== null}
          onClick={() => void send()}
        >
          {busy || pendingCommandId !== null ? "…" : "↻ 데이터 갱신"}
        </button>
        <span className="device-refresh-hint">
          모니터 계측값만 HMI에서 다시 받습니다 (설정값 제외)
        </span>
      </div>
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
    </div>
  );
}
