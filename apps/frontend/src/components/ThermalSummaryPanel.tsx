"use client";

import type { DeviceWithInstallation, TelemetryReading } from "../types/site";
import { TEMP_THRESHOLDS } from "../lib/chartTheme";
import { isCommLost } from "../lib/commStatus";

type Props = {
  device: DeviceWithInstallation;
  readings?: TelemetryReading[];
};

function finiteNums(values?: number[] | null): number[] {
  return (values ?? []).filter((v) => Number.isFinite(v));
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function maxOf(values: number[]): number | null {
  return values.length ? Math.max(...values) : null;
}

type SeriesStats = {
  lastMax: number | null;
  lastAvg: number | null;
  avg24: number | null;
  max24: number | null;
  maxAt: string | null;
  maxCh: number | null;
  samples: number;
};

function seriesStats(
  live: number[] | undefined,
  readings: TelemetryReading[],
  pick: (r: TelemetryReading) => number[] | null | undefined,
): SeriesStats {
  const lastVals = finiteNums(live);
  let max24 = -Infinity;
  let maxAt: string | null = null;
  let maxCh: number | null = null;
  const all: number[] = [];

  for (const r of readings) {
    const arr = pick(r) ?? [];
    arr.forEach((v, i) => {
      if (!Number.isFinite(v)) return;
      all.push(v);
      if (v > max24) {
        max24 = v;
        maxAt = r.recordedAt;
        maxCh = i + 1;
      }
    });
  }

  return {
    lastMax: maxOf(lastVals),
    lastAvg: mean(lastVals),
    avg24: mean(all),
    max24: Number.isFinite(max24) ? max24 : null,
    maxAt,
    maxCh,
    samples: all.length,
  };
}

function fmtNum(v: number) {
  return v.toFixed(1);
}

function fmtWhen(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function windowLabel(readings: TelemetryReading[]): string {
  if (!readings.length) return "이력 없음";
  let minT = Infinity;
  let maxT = -Infinity;
  for (const r of readings) {
    const t = new Date(r.recordedAt).getTime();
    if (!Number.isFinite(t)) continue;
    if (t < minT) minT = t;
    if (t > maxT) maxT = t;
  }
  if (!Number.isFinite(minT)) return "이력";
  const hours = Math.max(1, Math.round((maxT - minT) / 3_600_000));
  return hours >= 20 && hours <= 28 ? "최근 24시간" : `최근 ${hours}시간`;
}

function tone(value: number | null, warn?: number, alarm?: number) {
  if (value == null || warn == null || alarm == null) return "ok";
  if (value >= alarm) return "danger";
  if (value >= warn) return "warn";
  return "ok";
}

function statusLabel(t: "ok" | "warn" | "danger", hasThreshold: boolean) {
  if (!hasThreshold) return null;
  if (t === "danger") return "경보";
  if (t === "warn") return "주의";
  return "정상";
}

function Metric({
  label,
  value,
  unit,
  peak,
}: {
  label: string;
  value: number | null;
  unit: string;
  peak?: boolean;
}) {
  return (
    <div className={`thermal-metric${peak ? " thermal-metric--peak" : ""}`}>
      <span className="thermal-metric-label">{label}</span>
      <strong className="thermal-metric-value">
        {value == null ? (
          "—"
        ) : (
          <>
            {fmtNum(value)}
            <span className="thermal-metric-unit">
              {unit === "°C" ? "°C" : ` ${unit}`}
            </span>
          </>
        )}
      </strong>
    </div>
  );
}

function Block({
  title,
  unit,
  stats,
  warn,
  alarm,
  channelLabel,
  showWarnLabel = true,
  historyLabel,
}: {
  title: string;
  unit: string;
  stats: SeriesStats;
  warn?: number;
  alarm?: number;
  channelLabel: string;
  showWarnLabel?: boolean;
  historyLabel: string;
}) {
  const hasThreshold = warn != null && alarm != null;
  const t = tone(stats.lastMax, warn, alarm);
  const when = fmtWhen(stats.maxAt);
  const status = statusLabel(t, hasThreshold);

  return (
    <article className={`thermal-stat thermal-stat--${t}`}>
      <header className="thermal-stat-head">
        <h3>{title}</h3>
        {status ? (
          <span className={`thermal-stat-status thermal-stat-status--${t}`}>
            {status}
          </span>
        ) : null}
      </header>

      <div className="thermal-stat-block">
        <div className="thermal-stat-pair">
          <Metric label="최고" value={stats.lastMax} unit={unit} peak />
          <Metric label="평균" value={stats.lastAvg} unit={unit} />
        </div>
      </div>

      <div className="thermal-stat-block">
        <p className="thermal-stat-block-label">{historyLabel}</p>
        <div className="thermal-stat-pair">
          <Metric label="평균" value={stats.avg24} unit={unit} />
          <Metric label="최고" value={stats.max24} unit={unit} />
        </div>
      </div>

      <footer className="thermal-stat-foot">
        <span>
          {stats.max24 != null
            ? [
                stats.maxCh != null ? `${channelLabel} ${stats.maxCh}` : null,
                when,
              ]
                .filter(Boolean)
                .join(" · ") || "최고 시각 없음"
            : "기간 이력 없음"}
        </span>
        {alarm != null ? (
          <span>
            {showWarnLabel && warn != null ? `주의 ${warn}${unit} · ` : null}
            경보 {alarm}
            {unit}
          </span>
        ) : null}
      </footer>
    </article>
  );
}

export default function ThermalSummaryPanel({ device, readings = [] }: Props) {
  const area = seriesStats(device.areaTemp, readings, (r) => r.areaTemp);
  const module = seriesStats(device.moduleTemp, readings, (r) => r.moduleTemp);
  const fan = seriesStats(device.fanSpeed, readings, (r) => r.fanSpeed);
  const commLost = isCommLost(device.lastSeenAt);
  const historyLabel = windowLabel(readings);

  return (
    <aside className="thermal-summary" aria-label="열관리 요약">
      <Block
        title="주위 온도"
        unit="°C"
        stats={area}
        warn={TEMP_THRESHOLDS.areaWarn}
        alarm={TEMP_THRESHOLDS.areaAlarm}
        channelLabel="센서"
        historyLabel={historyLabel}
      />
      <Block
        title="모듈 온도"
        unit="°C"
        stats={module}
        warn={TEMP_THRESHOLDS.moduleWarn}
        alarm={TEMP_THRESHOLDS.moduleAlarm}
        channelLabel="모듈"
        showWarnLabel={false}
        historyLabel={historyLabel}
      />
      <Block
        title="팬 속도"
        unit="m/s"
        stats={fan}
        channelLabel="팬"
        historyLabel={historyLabel}
      />
    </aside>
  );
}
