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

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}초 전`;
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

export default function DeviceFaultHistory({ installationId, faults }: Props) {
  const router = useRouter();
  const [refreshState, setRefreshState] = useState<"idle" | "sending" | "waiting">("idle");
  const [refreshMsg, setRefreshMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const latestFault = faults[0] ?? null;

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
            {latestFault && (
              <span className="fault-latest-badge">
                <span className="fault-badge-dot" />
                마지막 fault:{" "}
                <strong>{relativeTime(latestFault.occurredAt)}</strong>
                {" — "}
                {moduleLabel(latestFault.module)} {latestFault.desc}
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
                  <th>설명</th>
                </tr>
              </thead>
              <tbody>
                {faults.map((f) => (
                  <tr key={f.id}>
                    <td className="fault-time">
                      <span className="fault-time-abs">
                        {new Date(f.occurredAt).toLocaleString("ko-KR", {
                          timeZone: "Asia/Seoul",
                          year: "2-digit",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                      <span className="fault-time-rel">{relativeTime(f.occurredAt)}</span>
                    </td>
                    <td>
                      <span className="fault-module-badge">{moduleLabel(f.module)}</span>
                    </td>
                    <td className="fault-desc">{f.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
