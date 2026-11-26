"use client";

import { useEffect, useMemo, useState } from "react";
import ChartCard from "./charts/ChartCard";
import HistoryAreaChart from "./charts/HistoryAreaChart";
import type { FaultEvent } from "../lib/api";
import {
  formatKstMonthDay,
  formatKstMonthDayHour,
  formatKstShortDate,
} from "../lib/kstTime";
import { harmonicsSupported, harmonicsUnsupportedText } from "../lib/harmonicsSupport";

/**
 * 이력 탭 → 고조파: 고른 차수 하나의 기간별 추세.
 * 보상 전 차트 1개, 보상 후 차트 1개. 각 차트에 L1·L2·L3 선 (상끼리 비교).
 * 기간·시작일·집계는 이력 탭 위쪽 버튼(DeviceHistoryCharts)을 그대로 따른다.
 */

type Period = "day" | "week" | "month" | "year";
type Agg = "avg" | "min" | "max";
type Resolution = "raw" | "hourly" | "daily";

/** 상 색: 이력 탭 THD 와 같은 순서(파랑·노랑·분홍). 어두운 배경에서 색약 구분 검사 통과. */
const PHASES = [
  { key: "a", label: "L1", color: "#3987e5" },
  { key: "b", label: "L2", color: "#c98500" },
  { key: "c", label: "L3", color: "#d55181" },
] as const;

/** 자주 보는 차수는 바로 누르고, 나머지는 목록에서 고른다. */
const QUICK_ORDERS = [3, 5, 7, 11, 13];
const DEFAULT_ORDERS = Array.from({ length: 25 }, (_, i) => i * 2 + 1);

const AGG_LABEL: Record<Agg, string> = { min: "최소", avg: "평균", max: "최대" };

type Triple = { a: number | null; b: number | null; c: number | null };

type HarmonicHistoryPayload = {
  order: number;
  orders: number[];
  resolution: Resolution;
  aggregation: Agg;
  points: { recordedAt: string; uncomp: Triple; comp: Triple }[];
  message?: string;
};

function axisTime(iso: string, resolution: Resolution, spansYears: boolean): string {
  if (resolution === "daily") return spansYears ? formatKstShortDate(iso) : formatKstMonthDay(iso);
  return formatKstMonthDayHour(iso);
}

export default function HarmonicHistoryCharts({
  installationId,
  period,
  start,
  aggregation,
  faults = [],
  fwVersion,
}: {
  installationId: string;
  period: Period;
  /** DeviceHistoryCharts 의 시작 입력값 그대로 ("" = 최근) */
  start: string;
  aggregation: Agg;
  faults?: FaultEvent[];
  /** HMI 펌웨어 버전. v2.5.1 미만이면 고조파를 보내지 않는다. */
  fwVersion?: string | null;
}) {
  const unsupported = harmonicsSupported(fwVersion) === false;
  const [order, setOrder] = useState(5);
  const [payload, setPayload] = useState<HarmonicHistoryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    const params = new URLSearchParams({ period, aggregation, order: String(order) });
    if (start) {
      params.set("start", period === "day" && start.includes("T") ? new Date(start).toISOString() : start);
    }
    setLoading(true);
    setError(null);
    fetch(`/api/devices/${encodeURIComponent(installationId)}/harmonics/history?${params}`, {
      signal: ac.signal,
      cache: "no-store",
    })
      .then(async (res) => {
        const body = (await res.json()) as HarmonicHistoryPayload;
        if (!res.ok) throw new Error(body.message || "고조파 이력을 불러오지 못했습니다.");
        if (!ac.signal.aborted) setPayload(body);
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        setPayload(null);
        setError(err instanceof Error ? err.message : "고조파 이력을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [installationId, period, start, aggregation, order]);

  const resolution: Resolution = payload?.resolution ?? (period === "day" ? "raw" : period === "week" ? "hourly" : "daily");
  const rangeLabel =
    resolution === "raw"
      ? "1시간 (원본)"
      : `${resolution === "hourly" ? "1시간" : "1일"} ${AGG_LABEL[payload?.aggregation ?? aggregation]}`;

  const orders = payload?.orders.length ? payload.orders : DEFAULT_ORDERS;
  const otherOrders = orders.filter((o) => !QUICK_ORDERS.includes(o));

  const data = useMemo(() => {
    const points = payload?.points ?? [];
    const years = new Set(
      points.map((p) => new Date(new Date(p.recordedAt).getTime() + 9 * 3600_000).getUTCFullYear()),
    );
    const spansYears = years.size > 1;
    return points.map((p) => ({
      time: axisTime(p.recordedAt, resolution, spansYears),
      recordedAt: p.recordedAt,
      bL1: p.uncomp.a,
      bL2: p.uncomp.b,
      bL3: p.uncomp.c,
      aL1: p.comp.a,
      aL2: p.comp.b,
      aL3: p.comp.c,
    }));
  }, [payload, resolution]);

  const hasData = data.some((row) =>
    [row.bL1, row.bL2, row.bL3, row.aL1, row.aL2, row.aL3].some((v) => v != null),
  );

  const series = (prefix: "b" | "a") =>
    PHASES.map((p) => ({
      dataKey: `${prefix}${p.label}`,
      name: p.label,
      stroke: p.color,
      fill: `url(#harm-${prefix}-${p.key})`,
    }));
  const grads = (prefix: "b" | "a") =>
    PHASES.map((p) => ({ id: `harm-${prefix}-${p.key}`, color: p.color, opacity: 0.12 }));

  const orderPicker = (
    <div className="harmonics-history-orders" role="group" aria-label="차수 선택">
      <span className="harmonics-history-orders-label">차수</span>
      <div className="monitor-view-chips">
        {QUICK_ORDERS.map((o) => (
          <button
            key={o}
            type="button"
            className={`monitor-view-chip${order === o ? " active" : ""}`}
            aria-pressed={order === o}
            onClick={() => setOrder(o)}
          >
            {o}차
          </button>
        ))}
      </div>
      <select
        className={`harmonics-order-select${QUICK_ORDERS.includes(order) ? "" : " is-active"}`}
        aria-label="그 외 차수"
        value={QUICK_ORDERS.includes(order) ? "" : String(order)}
        onChange={(e) => e.target.value && setOrder(Number(e.target.value))}
      >
        <option value="">그 외 차수</option>
        {otherOrders.map((o) => (
          <option key={o} value={o}>
            {o}차
          </option>
        ))}
      </select>
    </div>
  );

  if (loading) {
    return (
      <>
        {orderPicker}
        <div className="history-loading" role="status" aria-live="polite" aria-busy="true">
          <span className="history-loading-spinner" aria-hidden />
          <span className="history-loading-label">고조파 이력을 불러오는 중</span>
        </div>
      </>
    );
  }

  if (!hasData) {
    return (
      <>
        {orderPicker}
        <div className="chart-card chart-card-wide history-empty">
          <p>{error ?? (unsupported ? harmonicsUnsupportedText(fwVersion) : "데이터 없음")}</p>
        </div>
      </>
    );
  }

  return (
    <>
      {orderPicker}
      <div className="device-history-body device-charts-grid">
        {(["b", "a"] as const).map((prefix) => (
          <ChartCard
            key={prefix}
            title={`${order}차 고조파 전류 (A)`}
            subtitle={`— ${prefix === "b" ? "보상 전" : "보상 후"} · ${rangeLabel}`}
            titleExtra={
              <span
                className={`unb-leg unb-leg--${prefix === "b" ? "before" : "after"} harmonics-title-leg`}
                aria-hidden
              />
            }
            wide
          >
            <HistoryAreaChart
              data={data}
              grads={grads(prefix)}
              series={series(prefix)}
              yDomain={[0, "auto"]}
              yUnit=" A"
              faults={faults}
            />
          </ChartCard>
        ))}
      </div>
    </>
  );
}
