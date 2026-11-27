"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { FaultEvent } from "../lib/api";

type Props = {
  installationId: string;
  faults: FaultEvent[];
  /** 확인(Ack) 버튼 표시 — 관리자만. 영업 열람은 보기만 한다 */
  canAck?: boolean;
};

/** -1 = HMI 자체 이벤트 (H…) */
function moduleLabel(module: number): string {
  return module < 0 ? "HMI" : `M${module + 1}`;
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
  value?: string;
};

/**
 * S·H 코드는 `S5-1`, `H1-2`처럼 값까지 온다.
 * S 의 1/0 은 자료의 상태 설명, S0 은 보상 운전 시작/정지, H1 의 값은 HMI 리셋 원인(RCC CSR)이다.
 */
const STATUS_VALUE_LABEL: Record<string, Record<string, string>> = {
  S0: { "1": "comp on", "0": "comp off" },
  S1: { "1": "commissioning authorized", "0": "commissioning unauthorized" },
  S3: { "1": "authorized", "0": "unauthorized" },
  S4: { "1": "trial operation", "0": "long-term operation" },
  S5: { "1": "user on", "0": "user power off" },
  H1: { "1": "power-on reset", "2": "watchdog reset", "3": "software reset", "4": "reset pin" },
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
    const match = /^([FSH])(\d+)(?:-(\d+))?$/i.exec(raw);
    if (!match) return null;
    const code = `${match[1].toUpperCase()}${match[2]}`;
    const value = match[3];
    const detail = GUIDE_BY_CODE.get(code);
    // S(상태)·H(HMI 자체 이벤트)는 고장이 아니므로 상태 칩으로 표시
    const kind = code.startsWith("F") ? "fault" : "status";
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
              className={`fault-code-chip fault-code-chip-status${item.value === "0" && item.raw.startsWith("S") ? " is-off" : ""}`}
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

type FaultStatus = "active" | "acknowledged" | "updated" | "resolved" | "history" | "event";

function faultStatus(f: FaultEvent): FaultStatus {
  if (f.kind === "event") return "event";
  if (f.active) return "active";
  if (f.acknowledgedAt) return "acknowledged";
  if (f.resolvedAt && f.endReason === "updated") return "updated";
  if (f.resolvedAt) return "resolved";
  return "history";
}

const STATUS_LABEL: Record<FaultStatus, string> = {
  active: "활성",
  acknowledged: "확인됨",
  updated: "갱신됨",
  resolved: "해제됨",
  history: "이력",
  event: "기록",
};

/** 이벤트 코드와 맞춰 보는 기준표. 문구는 자료 원문 그대로 둔다. */
const FAULT_CODE_GUIDE: { code: string; detail: string }[] = [
  { code: "F0", detail: "Fault(no info)" },
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

/**
 * 상태·이벤트 코드 표: 고장이 아닌 1회성 기록 (장애 표 상태 '기록').
 * - S: 200A 모듈 상태 워드(word24 하위 바이트) 변화. 값(-1/-0)이 바뀔 때마다 HMI 가 보낸다
 * - H: HMI 자체 이벤트. H1-x = HMI 재시작, x = 리셋 원인 (MCU RCC CSR)
 */
const STATUS_EVENT_GUIDE: { code: string; group: string; detail: string }[] = [
  { code: "S0-1", group: "보상 운전", detail: "보상 운전 시작 (START, COMP ON)" },
  { code: "S0-0", group: "보상 운전", detail: "보상 운전 정지 (COMP OFF)" },
  { code: "S1-1", group: "시운전 승인 (bit7)", detail: "Commissioning authorized" },
  { code: "S1-0", group: "시운전 승인 (bit7)", detail: "Commissioning unauthorized" },
  { code: "S3-1", group: "운전 승인 (bit5)", detail: "Authorized" },
  { code: "S3-0", group: "운전 승인 (bit5)", detail: "Unauthorized" },
  { code: "S4-1", group: "운전 모드 (bit4)", detail: "Trial operation (시운전)" },
  { code: "S4-0", group: "운전 모드 (bit4)", detail: "Long-term operation (상시 운전)" },
  { code: "S5-1", group: "사용자 운전 입력 (bit2)", detail: "User on" },
  { code: "S5-0", group: "사용자 운전 입력 (bit2)", detail: "User power off" },
  { code: "H1-1", group: "HMI 재시작", detail: "전원 투입 리셋 (Power-on reset): 정전 후 복전, 전원 재투입" },
  { code: "H1-2", group: "HMI 재시작", detail: "워치독 리셋 (Watchdog reset): 펌웨어 응답 정지로 자동 재시작" },
  { code: "H1-3", group: "HMI 재시작", detail: "소프트웨어 리셋 (Software reset): 펌웨어 업데이트(OTA), 재시작 명령" },
  { code: "H1-4", group: "HMI 재시작", detail: "외부 리셋 핀 (Reset pin): 디버거, 리셋 버튼" },
  { code: "H1", group: "HMI 재시작", detail: "리셋 원인 미상 (리셋 원인을 보내기 전 펌웨어 포함)" },
];

const GUIDE_BY_CODE = new Map([
  ...FAULT_CODE_GUIDE.filter((row) => row.code !== "—").map((row) => [row.code, row.detail] as const),
  // 값 없이 온 S·H 코드 (예전 펌웨어의 H1): 묶음 이름
  ...STATUS_EVENT_GUIDE.map((row) => [row.code.split("-")[0], row.group] as const),
]);

export default function DeviceFaultHistory({ installationId, faults, canAck = true }: Props) {
  const router = useRouter();
  const [ackingId, setAckingId] = useState<string | null>(null);

  const activeFaults = faults.filter((f) => f.active);
  const activeModules = [...new Set(activeFaults.map((f) => f.module))]
    .sort((a, b) => a - b)
    .map(moduleLabel);

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
              <span className="chart-title-sub">최근 50건</span>
            </h3>
            {activeFaults.length > 0 ? (
              <span className="fault-latest-badge">
                <span className="fault-badge-dot" />
                {activeModules.join(", ")} fault 활성
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
              고장 코드 (F)
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
            상태·이벤트 코드 표
            <span className="fault-code-guide-hint">
              모듈 상태 (S) · HMI 이벤트 (H) — 상태 &apos;기록&apos;
            </span>
          </summary>
          <div className="fault-code-guide-body">
            <div className="fault-table-wrap fault-code-guide-table">
              <table className="fault-table">
                <thead>
                  <tr>
                    <th>코드</th>
                    <th>구분</th>
                    <th>내용</th>
                  </tr>
                </thead>
                <tbody>
                  {STATUS_EVENT_GUIDE.map((row) => (
                    <tr key={row.code}>
                      <td className="fault-code-cell">{row.code}</td>
                      <td>{row.group}</td>
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
                  <th>해제·갱신 시각</th>
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
                      {/* td 에 display:flex 를 주면 표 칸이 아니게 되어 이웃한 두 시각 칸이
                          한 칸으로 합쳐지고 뒤 칸이 한 칸씩 밀린다. flex 는 안쪽 div 에만 준다. */}
                      <td>
                        <div className="fault-time">
                          <span className="fault-time-abs">
                            {formatKst(f.occurredAt)}
                          </span>
                          <span className="fault-time-rel">
                            {relativeTime(f.occurredAt)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="fault-time">
                          {f.resolvedAt ? (
                            <>
                              <span className="fault-time-abs">
                                {formatKst(f.resolvedAt)}
                              </span>
                              <span className="fault-time-rel">
                                {f.endReason === "updated" ? "새 코드로 갱신 · " : ""}
                                지속 {durationLabel(f.occurredAt, f.resolvedAt)}
                              </span>
                            </>
                          ) : (
                            <span className="fault-time-rel">—</span>
                          )}
                        </div>
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
                        {canAck && status === "active" && (
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
