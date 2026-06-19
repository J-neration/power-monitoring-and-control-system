"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { FaultEvent } from "../lib/api";

type Props = {
  installationId: string;
  faults: FaultEvent[];
};

function moduleLabel(module: number): string {
  return `M${module + 1}`;
}

function faultLabel(f: { eventName?: string | null; desc: string }): string {
  const name = f.eventName?.trim();
  if (name) return name;
  const d = f.desc.trim();
  return d.length > 0 ? d : "—";
}

/**
 * 상대 시각 — 분·시간·일 단위.
 * occurredAt 이 지금보다 미래로 잡히면(시각 동기·타임존·Unix 해석 차이) "N시간 후"는 의미가 없으므로
 * fault 는 항상 과거 이벤트로 두고 "방금"만 표시한다.
 */
function relativeTime(iso: string): string {
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  const diffMin = Math.floor(diffSec / 60);

  if (diffSec < 0) {
    return "방금";
  }
  if (diffSec < 60) return "1분 미만";
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}시간 전`;
  return `${Math.floor(diffMin / 1440)}일 전`;
}

type FaultStatus = "active" | "acknowledged" | "resolved" | "history";

function faultStatus(f: FaultEvent): FaultStatus {
  if (f.active) return "active";
  if (f.acknowledgedAt) return "acknowledged";
  if (f.resolvedAt) return "resolved";
  return "history";
}

const STATUS_LABEL: Record<FaultStatus, string> = {
  active: "활성",
  acknowledged: "확인됨",
  resolved: "해제됨",
  history: "이력",
};

export default function DeviceFaultHistory({ installationId, faults }: Props) {
  const router = useRouter();
  const [refreshState, setRefreshState] = useState<"idle" | "sending" | "waiting">("idle");
  const [refreshMsg, setRefreshMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [ackingId, setAckingId] = useState<string | null>(null);

  const activeFaults = faults.filter((f) => f.active);
  const latestFault = activeFaults[0] ?? faults[0] ?? null;

  const handleAck = useCallback(
    async (f: FaultEvent) => {
      setAckingId(f.id);
      try {
        const res = await fetch(
          `/api/devices/${encodeURIComponent(installationId)}/faults/ack`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ module: f.module }),
          },
        );
        if (res.ok) {
          router.refresh();
        }
      } catch {
        /* 무시 — 사용자가 다시 시도 가능 */
      } finally {
        setAckingId(null);
      }
    },
    [installationId, router],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshState("sending");
    setRefreshMsg(null);
    try {
      const res = await fetch("/api/receiver/commands/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ installationId, module: 0, power: "refresh" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        code?: string;
      };
      if (!res.ok) {
        setRefreshMsg({ type: "err", text: data.message ?? data.code ?? `요청 실패 (${res.status})` });
        setRefreshState("idle");
        return;
      }
      setRefreshState("waiting");
      setRefreshMsg({ type: "ok", text: "갱신 명령 전송됨 — 15초 후 데이터를 재조회합니다." });
      setTimeout(() => {
        router.refresh();
        setRefreshState("idle");
        setRefreshMsg(null);
      }, 15_000);
    } catch {
      setRefreshMsg({ type: "err", text: "네트워크 오류" });
      setRefreshState("idle");
    }
  }, [installationId, router]);

  return (
    <section className="device-detail-body">
      <div className="chart-card chart-card-wide fault-history-card">
        <div className="fault-history-header">
          <div className="fault-history-title-row">
            <h3 className="chart-title">
              Fault 이력
              <span className="chart-title-sub">최근 50건 · Admin</span>
            </h3>
            {activeFaults.length > 0 ? (
              <span className="fault-latest-badge">
                <span className="fault-badge-dot" />
                활성 fault {activeFaults.length}건
                {latestFault && (
                  <>
                    {" — "}
                    {moduleLabel(latestFault.module)} {faultLabel(latestFault)}
                    {" ("}
                    {relativeTime(latestFault.occurredAt)}
                    {")"}
                  </>
                )}
              </span>
            ) : (
              <span className="fault-latest-badge fault-latest-badge-clear">
                활성 fault 없음
              </span>
            )}
          </div>

          <div className="fault-refresh-row">
            <button
              type="button"
              className="fault-refresh-btn"
              disabled={refreshState !== "idle"}
              onClick={() => void handleRefresh()}
            >
              {refreshState === "sending"
                ? "…"
                : refreshState === "waiting"
                  ? "⏳ 대기 중…"
                  : "↻ 데이터 새로고침"}
            </button>
            {refreshMsg && (
              <span className={`fault-refresh-msg fault-refresh-msg-${refreshMsg.type}`}>
                {refreshMsg.text}
              </span>
            )}
          </div>
        </div>

        {faults.length === 0 ? (
          <p className="fault-empty">최근 fault 이력이 없습니다.</p>
        ) : (
          <div className="fault-table-wrap">
            <table className="fault-table">
              <thead>
                <tr>
                  <th>발생시각</th>
                  <th>모듈</th>
                  <th>이벤트</th>
                  <th>상태</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {faults.map((f) => {
                  const status = faultStatus(f);
                  return (
                    <tr key={f.id} className={status === "active" ? "fault-row-active" : ""}>
                      <td className="fault-time">
                        <span className="fault-time-abs">
                          {new Date(f.occurredAt).toLocaleString("ko-KR", {
                            timeZone: "Asia/Seoul",
                          })}
                        </span>
                        <span className="fault-time-rel">{relativeTime(f.occurredAt)}</span>
                      </td>
                      <td>
                        <span className="fault-module-badge">{moduleLabel(f.module)}</span>
                      </td>
                      <td className="fault-event-name">{faultLabel(f)}</td>
                      <td>
                        <span className={`fault-status-chip fault-status-${status}`}>
                          {STATUS_LABEL[status]}
                        </span>
                      </td>
                      <td>
                        {status === "active" && (
                          <button
                            type="button"
                            className="fault-ack-btn"
                            disabled={ackingId === f.id}
                            onClick={() => void handleAck(f)}
                          >
                            {ackingId === f.id ? "…" : "확인"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
