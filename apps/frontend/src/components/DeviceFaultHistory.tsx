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

type EventCode = {
  raw: string;
  label: string;
  kind: "fault" | "status";
  value?: "0" | "1";
};

/** S 코드는 `S5-1`처럼 값까지 온다. 1/0 뜻은 자료의 상태 설명이다. */
const STATUS_VALUE_LABEL: Record<string, Record<"0" | "1", string>> = {
  S1: { "1": "commissioning authorized", "0": "commissioning unauthorized" },
  S3: { "1": "authorized", "0": "unauthorized" },
  S4: { "1": "trial operation", "0": "long-term operation" },
  S5: { "1": "user on", "0": "user power off" },
};

function shortDetail(detail: string): string {
  return detail
    .replace(/^bit\d+:\s*/, "")
    .replace(/\s*\((?=[^)]*\b[01]:)[^)]*\)\s*$/, "")
    .trim();
}

function parseEventCodes(text: string): { faults: EventCode[]; statuses: EventCode[] } | null {
  const parts = text.split(/[,;/]+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const codes: EventCode[] = [];
  for (const raw of parts) {
    const match = /^([FS])(\d+)(?:-([01]))?$/i.exec(raw);
    if (!match) return null;
    const code = `${match[1].toUpperCase()}${match[2]}`;
    const value = match[3] === "0" || match[3] === "1" ? match[3] : undefined;
    const detail = GUIDE_BY_CODE.get(code);
    const kind = code.startsWith("S") ? "status" : "fault";
    const valueLabel = value ? STATUS_VALUE_LABEL[code]?.[value] : undefined;
    const label = valueLabel ?? (detail ? shortDetail(detail) : "");
    codes.push({ raw: value ? `${code}-${value}` : code, label, kind, value });
  }
  return {
    faults: codes.filter((code) => code.kind === "fault"),
    statuses: codes.filter((code) => code.kind === "status"),
  };
}

function EventCodes({ text }: { text: string }) {
  const groups = parseEventCodes(text);
  if (!groups) return <>{text}</>;
  return (
    <div className="fault-event-groups" title={text}>
      {groups.faults.length > 0 && (
        <div className="fault-event-group">
          {groups.faults.map((item, index) => (
            <span
              key={`${item.raw}-${index}`}
              className="fault-code-chip fault-code-chip-fault"
            >
              <b>{item.raw}</b>
              {item.label ? <span>{item.label}</span> : null}
            </span>
          ))}
        </div>
      )}
      {groups.statuses.length > 0 && (
        <div className="fault-event-group">
          {groups.statuses.map((item, index) => (
            <span
              key={`${item.raw}-${index}`}
              className={`fault-code-chip fault-code-chip-status${item.value === "0" ? " is-off" : ""}`}
            >
              <b>{item.raw}</b>
              {item.label ? <span>{item.label}</span> : null}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function faultBadgeText(text: string): string {
  const groups = parseEventCodes(text);
  if (!groups) return text;
  const faults = groups.faults.map((item) => item.raw);
  if (faults.length > 0) return faults.join(" ");
  return groups.statuses.map((item) => item.raw).join(" ");
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

/** 발생 → 해제까지 걸린 시간 */
function durationLabel(fromIso: string, toIso: string): string {
  const sec = Math.max(0, Math.floor((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 1000));
  if (sec < 60) return `${sec}초`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 ${min % 60}분`;
  return `${Math.floor(hour / 24)}일 ${hour % 24}시간`;
}

function formatKst(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
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

/** 이벤트 코드와 맞춰 보는 기준표. 문구는 자료 원문 그대로 둔다. */
const FAULT_CODE_GUIDE: { code: string; detail: string }[] = [
  { code: "F0", detail: "Fault(no info)" },
  { code: "S0", detail: "START (COMP ON)" },
  { code: "S1", detail: "bit7: Commissioning authorization status (1: authorized; 0: unauthorized)" },
  { code: "S3", detail: "bit5: Authorization status (1: authorized; 0: unauthorized)" },
  { code: "S4", detail: "bit4: Trial operation status (1: trial operation; 0: long-term operation)" },
  { code: "S5", detail: "bit2: User on/off input status (1: user on; 0: user power off)" },
  { code: "F2", detail: "bit1: Short run fault" },
  { code: "F3", detail: "bit0: Emergency stop" },
  { code: "F4", detail: "bit15: Bus undervoltage A0" },
  { code: "F5", detail: "bit14: Bus undervoltage A1" },
  { code: "F6", detail: "bit13: Bus undervoltage B0" },
  { code: "F7", detail: "bit12: Bus undervoltage B1" },
  { code: "F8", detail: "bit11: Bus undervoltage C0" },
  { code: "F9", detail: "bit10: Bus undervoltage C1" },
  { code: "F10", detail: "bit9: MCU fault" },
  { code: "F11", detail: "bit8: IGBT overheating" },
  { code: "F12", detail: "bit7: Auxiliary power supply loss" },
  { code: "—", detail: "bit6: Reserved" },
  { code: "F13", detail: "bit5: Bus overvoltage A0" },
  { code: "F14", detail: "bit4: Bus overvoltage A1" },
  { code: "F15", detail: "bit3: Bus overvoltage B0" },
  { code: "F16", detail: "bit2: Bus overvoltage B1" },
  { code: "F17", detail: "bit1: Bus overvoltage C0" },
  { code: "F18", detail: "bit0: Bus overvoltage C1" },
  { code: "F19", detail: "bit15: Peak overvoltage A" },
  { code: "F20", detail: "bit14: Peak overvoltage B" },
  { code: "F21", detail: "bit13: Peak overvoltage C" },
  { code: "F22", detail: "bit12: Mains undervoltage A" },
  { code: "F23", detail: "bit11: Mains undervoltage B" },
  { code: "F24", detail: "bit10: Mains undervoltage C" },
  { code: "F25", detail: "bit9: Mains overvoltage A" },
  { code: "F26", detail: "bit8: Mains overvoltage B" },
  { code: "F27", detail: "bit7: Mains overvoltage C" },
  { code: "F28", detail: "bit6: Phase sequence abnormality" },
  { code: "F29", detail: "bit5: Bridge arm overcurrent 0" },
  { code: "F30", detail: "bit4: Bridge arm overcurrent 1" },
  { code: "F31", detail: "bit3: Bridge arm overcurrent 2" },
  { code: "F32", detail: "bit2: Bridge arm overcurrent 3" },
  { code: "F33", detail: "bit1: Bridge arm overcurrent 4" },
  { code: "F34", detail: "bit0: Bridge arm overcurrent 5" },
];

const GUIDE_BY_CODE = new Map(
  FAULT_CODE_GUIDE.filter((row) => row.code !== "—").map((row) => [row.code, row.detail]),
);

export default function DeviceFaultHistory({ installationId, faults }: Props) {
  const router = useRouter();
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
                    {moduleLabel(latestFault.module)}{" "}
                    {faultBadgeText(faultLabel(latestFault))}
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
        </div>

        <details className="fault-code-guide">
          <summary>
            <span className="fault-code-guide-chevron" aria-hidden>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                <path
                  d="M6 9l6 6 6-6"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            오류 코드 표
            <span className="fault-code-guide-hint">
              이벤트 코드와 맞춰 보기
            </span>
          </summary>
          <div className="fault-code-guide-body">
            <div className="fault-table-wrap fault-code-guide-table">
              <table className="fault-table">
                <thead>
                  <tr>
                    <th>오류코드</th>
                    <th>내용</th>
                  </tr>
                </thead>
                <tbody>
                  {FAULT_CODE_GUIDE.map((row) => (
                    <tr key={`${row.code}-${row.detail}`}>
                      <td className="fault-code-cell">{row.code}</td>
                      <td>{row.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>

        {faults.length === 0 ? (
          <p className="fault-empty">최근 fault 이력이 없습니다.</p>
        ) : (
          <div className="fault-table-wrap">
            <table className="fault-table">
              <thead>
                <tr>
                  <th>발생시각</th>
                  <th>해제시각</th>
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
                    <tr
                      key={f.id}
                      className={status === "active" ? "fault-row-active" : ""}
                    >
                      <td className="fault-time">
                        <span className="fault-time-abs">
                          {formatKst(f.occurredAt)}
                        </span>
                        <span className="fault-time-rel">
                          {relativeTime(f.occurredAt)}
                        </span>
                      </td>
                      <td className="fault-time">
                        {f.resolvedAt ? (
                          <>
                            <span className="fault-time-abs">
                              {formatKst(f.resolvedAt)}
                            </span>
                            <span className="fault-time-rel">
                              지속 {durationLabel(f.occurredAt, f.resolvedAt)}
                            </span>
                          </>
                        ) : (
                          <span className="fault-time-rel">—</span>
                        )}
                      </td>
                      <td>
                        <span className="fault-module-badge">
                          {moduleLabel(f.module)}
                        </span>
                      </td>
                      <td className="fault-event-name">
                        <EventCodes text={faultLabel(f)} />
                      </td>
                      <td>
                        <span
                          className={`fault-status-chip fault-status-${status}`}
                        >
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
