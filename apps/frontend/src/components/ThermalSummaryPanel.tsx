import type { DeviceWithInstallation, TelemetryReading } from "../types/site";
import { TEMP_THRESHOLDS } from "../lib/chartTheme";

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
  now: number | null;
  nowAvg: number | null;
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
  const nowVals = finiteNums(live);
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
    now: maxOf(nowVals),
    nowAvg: mean(nowVals),
    avg24: mean(all),
    max24: Number.isFinite(max24) ? max24 : null,
    maxAt,
    maxCh,
    samples: all.length,
  };
}

function fmtTemp(v: number | null) {
  return v == null ? "—" : v.toFixed(1);
}

function fmtFan(v: number | null) {
  return v == null ? "—" : v.toFixed(1);
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

function windowNote(readings: TelemetryReading[]): string {
  if (!readings.length) return "최근 이력 없음";
  let minT = Infinity;
  let maxT = -Infinity;
  for (const r of readings) {
    const t = new Date(r.recordedAt).getTime();
    if (!Number.isFinite(t)) continue;
    if (t < minT) minT = t;
    if (t > maxT) maxT = t;
  }
  if (!Number.isFinite(minT)) return "최근 이력";
  const hours = Math.max(1, Math.round((maxT - minT) / 3_600_000));
  return `최근 ${hours}시간`;
}

function tone(value: number | null, warn: number, alarm: number) {
  if (value == null) return "ok";
  if (value >= alarm) return "danger";
  if (value >= warn) return "warn";
  return "ok";
}

function Block({
  title,
  unit,
  stats,
  warn,
  alarm,
  channelLabel,
}: {
  title: string;
  unit: string;
  stats: SeriesStats;
  warn?: number;
  alarm?: number;
  channelLabel: string;
}) {
  const t = warn != null && alarm != null ? tone(stats.now, warn, alarm) : "ok";
  const when = fmtWhen(stats.maxAt);
  const fmt = unit === "m/s" ? fmtFan : fmtTemp;

  return (
    <article className={`thermal-stat thermal-stat--${t}`}>
      <header className="thermal-stat-head">
        <h3>{title}</h3>
        <span className="thermal-stat-unit">{unit}</span>
      </header>
      <div className="thermal-stat-now">
        <span className="thermal-stat-kicker">지금</span>
        <strong>{fmt(stats.now)}</strong>
      </div>
      <dl className="thermal-stat-grid">
        <div>
          <dt>지금 평균</dt>
          <dd>{fmt(stats.nowAvg)}</dd>
        </div>
        <div>
          <dt>24h 평균</dt>
          <dd>{fmt(stats.avg24)}</dd>
        </div>
        <div className="thermal-stat-max">
          <dt>24h 최고</dt>
          <dd>{fmt(stats.max24)}</dd>
        </div>
      </dl>
      {stats.max24 != null ? (
        <p className="thermal-stat-note">
          {stats.maxCh != null ? `${channelLabel} ${stats.maxCh} · ` : null}
          {when ?? "시각 없음"}
          {stats.samples ? ` · ${stats.samples}점` : null}
        </p>
      ) : (
        <p className="thermal-stat-note">24시간 이력 없음</p>
      )}
      {warn != null && alarm != null ? (
        <p className="thermal-stat-limit">
          주의 {warn}
          {unit === "°C" ? "°C" : ` ${unit}`} · 경보 {alarm}
          {unit === "°C" ? "°C" : ` ${unit}`}
        </p>
      ) : null}
    </article>
  );
}

export default function ThermalSummaryPanel({ device, readings = [] }: Props) {
  const area = seriesStats(device.areaTemp, readings, (r) => r.areaTemp);
  const module = seriesStats(device.moduleTemp, readings, (r) => r.moduleTemp);
  const fan = seriesStats(device.fanSpeed, readings, (r) => r.fanSpeed);

  return (
    <aside className="thermal-summary" aria-label="열관리 요약">
      <div className="thermal-summary-head">
        <span className="hmi-compare-ch">05</span>
        <span className="thermal-summary-title">열 요약</span>
        <span className="thermal-summary-window">{windowNote(readings)}</span>
      </div>
      <Block
        title="주위 온도"
        unit="°C"
        stats={area}
        warn={TEMP_THRESHOLDS.areaWarn}
        alarm={TEMP_THRESHOLDS.areaAlarm}
        channelLabel="센서"
      />
      <Block
        title="모듈 온도"
        unit="°C"
        stats={module}
        warn={TEMP_THRESHOLDS.moduleWarn}
        alarm={TEMP_THRESHOLDS.moduleAlarm}
        channelLabel="모듈"
      />
      <Block title="팬 속도" unit="m/s" stats={fan} channelLabel="팬" />
    </aside>
  );
}
