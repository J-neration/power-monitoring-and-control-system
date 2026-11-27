"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWsEvents } from "../hooks/useWsEvents";
import {
  LTE_POST_PERIODS_MIN,
  type DeviceSettingsSnapshot,
} from "../lib/deviceSettingsFields";
import { StatusCard, type StatusBanner } from "./DeviceSettingsPanel";

type Props = {
  installationId: string;
  requestedBy?: string;
};

type LoadState =
  | { status: "loading" }
  /** 설정 스냅샷이 아직 없음 */
  | { status: "empty" }
  /** period null = 펌웨어가 LTE 설정을 보고하지 않음 */
  | { status: "ready"; period: number | null; updatedAt: string };

const isPostPeriod = (v: unknown): v is number =>
  typeof v === "number" &&
  (LTE_POST_PERIODS_MIN as readonly number[]).includes(v);

function formatSnapshotTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * 설정 탭 > LTE 통신 설정: HMI 텔레메트리 전송 주기(10/30/60분) 조회·변경.
 * 변경은 setLte 명령(module 0). HMI 는 적용 후 설정 스냅샷(lte 포함)을 올리고 ACK 한다.
 */
export default function DeviceLteSettingsPanel({
  installationId,
  requestedBy,
}: Props) {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingCommandId, setPendingCommandId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusBanner | null>(null);

  const pendingRef = useRef<string | null>(null);
  pendingRef.current = pendingCommandId;
  /** 사용자가 선택을 바꿨으면 스냅샷 갱신이 선택값을 덮어쓰지 않는다 */
  const touchedRef = useRef(false);
  /** ACK 후 보고값 확인 중인 요청 주기 */
  const confirmingRef = useRef<number | null>(null);
  /** 진행 중인 확인 루프 무효화용 */
  const confirmTokenRef = useRef(0);

  /** 보고된 주기(분), 미보고면 null, 스냅샷 없음·오류면 undefined */
  const fetchLte = useCallback(async (): Promise<number | null | undefined> => {
    try {
      const res = await fetch(
        `/api/devices/${encodeURIComponent(installationId)}/settings?t=${Date.now()}`,
        {
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        settings?: DeviceSettingsSnapshot | null;
        message?: string;
      };
      if (!res.ok) {
        setLoad({ status: "empty" });
        setStatus({
          tone: "err",
          title: "설정 조회 실패",
          detail: data.message ?? `HTTP ${res.status}`,
        });
        return undefined;
      }
      if (!data.settings) {
        setLoad({ status: "empty" });
        return undefined;
      }
      const reported = data.settings.lte?.postPeriodMin;
      const period = isPostPeriod(reported) ? reported : null;
      setLoad({ status: "ready", period, updatedAt: data.settings.updatedAt });
      if (!touchedRef.current) setSelected(period);
      return period;
    } catch {
      setLoad({ status: "empty" });
      setStatus({
        tone: "err",
        title: "네트워크 오류",
        detail: "설정 스냅샷을 불러오지 못했습니다.",
      });
      return undefined;
    }
  }, [installationId]);

  const markApplied = useCallback((period: number) => {
    confirmingRef.current = null;
    touchedRef.current = false;
    setSelected(period);
    setStatus({
      tone: "ok",
      title: "적용 완료",
      detail: `텔레메트리 전송 주기 ${period}분 · HMI 보고값으로 확인했습니다.`,
    });
  }, []);

  /** ACK 후 HMI 보고값이 요청값과 같아질 때까지 잠시 재조회 */
  const confirmAfterAck = useCallback(
    async (requested: number, token: number) => {
      const delaysMs = [0, 1000, 3000, 6000];
      let elapsed = 0;
      for (const at of delaysMs) {
        if (confirmTokenRef.current !== token || confirmingRef.current === null) return;
        if (at > elapsed) {
          await new Promise((r) => window.setTimeout(r, at - elapsed));
          elapsed = at;
        }
        if (confirmTokenRef.current !== token || confirmingRef.current === null) return;
        const period = await fetchLte();
        if (period === requested) {
          markApplied(requested);
          return;
        }
      }
      if (confirmTokenRef.current !== token || confirmingRef.current === null) return;
      confirmingRef.current = null;
      setStatus({
        tone: "err",
        title: "보고값 미갱신",
        detail:
          "HMI가 적용 응답을 보냈으나 설정 스냅샷의 전송 주기가 아직 갱신되지 않았습니다. [갱신]으로 다시 확인하세요.",
      });
    },
    [fetchLte, markApplied],
  );

  useEffect(() => {
    void fetchLte();
  }, [fetchLte]);

  useWsEvents((msg) => {
    if (msg.type === "settings_updated" && msg.installationId === installationId) {
      void fetchLte().then((period) => {
        const requested = confirmingRef.current;
        if (requested !== null && period === requested) markApplied(requested);
      });
      return;
    }
    if (
      msg.type === "command_acked" &&
      msg.installationId === installationId &&
      pendingRef.current &&
      msg.commandId === pendingRef.current
    ) {
      setPendingCommandId(null);
      const requested = confirmingRef.current;
      if (msg.status !== "acked" || requested === null) {
        confirmingRef.current = null;
        setStatus({
          tone: "err",
          title: "적용 실패",
          detail:
            "HMI가 명령을 거절했거나 실행에 실패했습니다. HMI 펌웨어 2.5.2 미만은 이 설정을 지원하지 않습니다.",
        });
        return;
      }
      setStatus({
        tone: "pending",
        title: "HMI 적용 완료",
        detail: "설정 스냅샷의 보고값 확인 중…",
      });
      const token = ++confirmTokenRef.current;
      void confirmAfterAck(requested, token);
    }
  });

  const currentPeriod = load.status === "ready" ? load.period : null;
  const locked = busy || pendingCommandId !== null;

  const apply = async () => {
    if (locked || selected === null) return;
    if (selected === currentPeriod) {
      setStatus({ tone: "info", title: "현재 설정과 같습니다." });
      return;
    }
    const requested = selected;
    setBusy(true);
    setStatus(null);
    confirmTokenRef.current += 1;
    confirmingRef.current = null;
    try {
      const res = await fetch("/api/receiver/commands/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          installationId,
          module: 0,
          power: "setLte",
          fields: { postPeriodMin: requested },
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
          title: "명령 등록 실패",
          detail:
            data.code === "ACTIVE_COMMAND_EXISTS"
              ? "HMI가 처리 중인 다른 명령이 있습니다. 해당 명령의 응답을 받은 뒤 다시 적용하세요."
              : (data.message ?? data.code ?? `HTTP ${res.status}`),
        });
        return;
      }
      const id = data.command?.id ?? "";
      confirmingRef.current = requested;
      setPendingCommandId(id || null);
      setStatus({
        tone: "pending",
        title: "적용 대기 중",
        detail: `전송 주기 ${requested}분 · HMI가 다음 명령 조회(폴링) 시 적용합니다.`,
        commandId: id || undefined,
      });
    } catch {
      setStatus({ tone: "err", title: "네트워크 오류" });
    } finally {
      setBusy(false);
    }
  };

  const currentLabel =
    load.status === "loading"
      ? "불러오는 중…"
      : load.status === "empty"
        ? "확인 불가 — 설정 스냅샷 없음"
        : load.period === null
          ? "확인 불가 — 펌웨어가 LTE 설정을 보고하지 않음"
          : `${load.period}분`;
  const applyLabel = busy
    ? "등록 중…"
    : pendingCommandId
      ? "HMI 응답 대기 중…"
      : "적용";

  return (
    <section className="device-settings-section">
      <div className="chart-card chart-card-wide device-settings-panel">
        <div className="device-settings-panel-head">
          <h3 className="chart-title">LTE 통신 설정</h3>
        </div>

        {status ? <StatusCard status={status} /> : null}

        <div className="device-lte-settings">
          <dl className="device-lte-current">
            <div className="device-lte-current-row">
              <dt className="device-settings-field-label">텔레메트리 전송 주기 (현재)</dt>
              <dd
                className={`device-lte-current-value${currentPeriod === null ? " device-lte-current-value--unknown" : ""}`}
              >
                {currentLabel}
              </dd>
            </div>
            {load.status === "ready" ? (
              <div className="device-lte-current-row">
                <dt className="device-settings-field-label">설정 스냅샷 시각</dt>
                <dd className="device-lte-current-time">
                  <time dateTime={load.updatedAt}>{formatSnapshotTime(load.updatedAt)}</time>
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="device-settings-field device-lte-period-field">
            <span className="device-settings-field-label">전송 주기 변경</span>
            <div
              className="device-settings-segment device-settings-segment--3"
              role="radiogroup"
              aria-label="텔레메트리 전송 주기"
            >
              {LTE_POST_PERIODS_MIN.map((min) => {
                const active = selected === min;
                return (
                  <button
                    key={min}
                    type="button"
                    role="radio"
                    className={`device-settings-segment-btn${active ? " active" : ""}`}
                    aria-checked={active}
                    disabled={locked}
                    onClick={() => {
                      touchedRef.current = true;
                      setSelected(min);
                    }}
                  >
                    {min}분
                  </button>
                );
              })}
            </div>
          </div>

          <div className="device-settings-actions">
            <button
              type="button"
              className="device-settings-save"
              disabled={locked || selected === null}
              aria-busy={locked}
              onClick={() => void apply()}
            >
              {applyLabel}
            </button>
          </div>

          <ul className="device-lte-help">
            <li>
              HMI가 측정값(텔레메트리)을 서버로 보내는 주기입니다. 주기가 길수록
              LTE 데이터 사용량이 줄고, 화면 갱신 간격은 길어집니다.
            </li>
            <li>
              HMI는 정기 보고 때 원격 연결을 확인하므로, 원격 명령(고조파 갱신·설정
              변경·펌웨어 업데이트)의 첫 반영이 최대 전송 주기만큼 늦어집니다(60분이면 최대 약
              1시간). 서버는 명령 유효시간을 전송 주기 + 5분으로 맞춥니다.
            </li>
            <li>
              설정값은 HMI에 저장되어 재시작 후에도 유지됩니다. HMI 펌웨어 2.5.2
              이상에서 지원합니다.
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
