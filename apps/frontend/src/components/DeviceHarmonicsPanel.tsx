"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
} from "recharts";
import ChartCard from "./charts/ChartCard";
import {
  AXIS,
  GRID,
  TOOLTIP_CURSOR,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
} from "../lib/chartTheme";
import { formatKstMonthDayTime } from "../lib/kstTime";
import { useWsEvents } from "../hooks/useWsEvents";

// Command TTL (900 s) + margin, same as the data refresh button.
const COMMAND_ACK_TIMEOUT_MS = 930_000;

type Phase = "a" | "b" | "c";

/** 상 색: 이력 탭(파랑·노랑·분홍)과 같은 순서. 어두운 배경에서 색약 구분 검사 통과. */
const PHASES: { key: Phase; label: string; color: string }[] = [
  { key: "a", label: "L1", color: "#3987e5" },
  { key: "b", label: "L2", color: "#c98500" },
  { key: "c", label: "L3", color: "#d55181" },
];

type Side = "uncomp" | "comp";

/** 막대 차트 색: 보상 전 = 빨강 계열, 보상 후 = 초록 계열. L1→L3 은 같은 색의 밝기만 다르다
 *  (막대가 L1·L2·L3 순서로 서 있어서 자리로도 구분된다). */
const SPECTRUM_COLORS: Record<Side, Record<Phase, string>> = {
  uncomp: { a: "#fca5a5", b: "#ef4444", c: "#b91c1c" },
  comp: { a: "#86efac", b: "#22c55e", c: "#15803d" },
};
const SIDES: { key: Side; label: string; tone: "before" | "after" }[] = [
  { key: "uncomp", label: "보상 전", tone: "before" },
  { key: "comp", label: "보상 후", tone: "after" },
];

/** 값이 0인 막대: 높이(px)와 투명도. 측정 분해능(약 0.06 A) 아래라 0으로 온 상도 자리가 보이게 한다. */
const ZERO_BAR_PX = 4;
const ZERO_BAR_OPACITY = 0.6;

type Phases = { a: number[]; b: number[]; c: number[] };

type HarmonicRecord = {
  id: string;
  recordedAt: string;
  source: string;
  orders: number[];
  uncomp: Phases;
  comp: Phases;
};

/** HMI 가 아직 응답하지 않은 module 0 명령 (관리자에게만 온다). 있으면 새 명령을 만들 수 없다(409). */
type ActiveCommand = {
  id: string;
  power: string;
  status: string;
  createdAt: string;
  expiresAt: string | null;
};

type HarmonicsResponse = {
  latest: HarmonicRecord | null;
  /** 모니터는 latest 만 쓴다. 추세는 이력 탭 → 고조파 */
  records: HarmonicRecord[];
  activeCommand?: ActiveCommand | null;
};

type View = "chart" | "table";

/** A = 전류 그대로, % = 같은 상·같은 쪽(보상 전/후) 기본파(1차) 대비. 고조파 기준(IEC·IEEE 519)은 % 로 정한다. */
type Unit = "A" | "%";

type CommandState =
  | { tone: "idle" }
  /** 고조파 갱신 대기. restoredAt = 탭을 다시 열었을 때 서버에서 찾은 명령의 요청 시각 */
  | { tone: "pending"; commandId: string; deadline: number; restoredAt?: string }
  /** 다른 module 0 명령(데이터 갱신 등)을 HMI 가 처리 중이라 지금은 요청할 수 없음 */
  | { tone: "busy"; power: string }
  | { tone: "ok" | "err"; text: string };

const COMMAND_LABEL: Record<string, string> = {
  refresh: "데이터 갱신",
  refreshSettings: "설정 불러오기",
  setBasic: "설정 변경",
  ota: "펌웨어 업데이트",
  on: "켜기",
  off: "끄기",
};

/** 서버 명령의 응답 기한: 만료 시각(없으면 요청 + TTL) + 여유 */
const commandDeadline = (c: ActiveCommand) =>
  (c.expiresAt ? new Date(c.expiresAt).getTime() : new Date(c.createdAt).getTime() + 900_000) + 30_000;

/** 0.01 A 정수 → A */
const toAmp = (v: number | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v / 100 : null;

const fmtNum = (v: number | null) => (v == null ? "-" : v.toFixed(2));

/** 표·툴팁 값: A 는 소수 둘째 자리, % 는 첫째 자리 */
const fmtValue = (v: number | null, unit: Unit) =>
  v == null ? "-" : unit === "A" ? v.toFixed(2) : v.toFixed(1);
const fmtWithUnit = (v: number | null, unit: Unit) =>
  v == null ? "-" : unit === "A" ? `${v.toFixed(2)} A` : `${v.toFixed(1)} %`;

/** 전류(A) → 단위 변환. % 는 기본파(A)가 0 이하이면 계산할 수 없어 null. */
const convert = (amp: number | null, fund: number | null, unit: Unit): number | null => {
  if (amp == null) return null;
  if (unit === "A") return amp;
  if (fund == null || fund <= 0) return null;
  return (amp / fund) * 100;
};

const reductionPct = (before: number | null, after: number | null): string => {
  if (before == null || after == null || before <= 0) return "-";
  return `${Math.round((1 - after / before) * 100)}%`;
};

/** y축 눈금: 0부터 1·2·5×10ⁿ 간격으로 4칸 안팎. 최대값이 0이면 0~1 A. */
const niceTicks = (max: number): number[] => {
  if (!(max > 0)) return [0, 0.5, 1];
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
};

const fmtTick = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** 막대 모양: 값이 0이면 minPointSize 높이로 흐리게 그린다 */
const zeroAwareBar = (props: BarShapeProps) => (
  <Rectangle {...props} fillOpacity={props.value === 0 ? ZERO_BAR_OPACITY : 1} />
);

type Row = Record<string, number | string | null>;

/** rows 안의 L1~L3 값 중 최대 */
const rowsMax = (rows: Row[]) => {
  let max = 0;
  for (const row of rows) {
    for (const { key } of PHASES) {
      const v = row[key];
      if (typeof v === "number") max = Math.max(max, v);
    }
  }
  return max;
};

/** 막대 차트용 소제목: 보상 전/후 이름 + 그 차트의 L1·L2·L3 색 견본 */
function SpectrumTitle({ side, label }: { side: Side; label: string }) {
  return (
    <div className="harmonics-side-title">
      <span>{label}</span>
      <ul className="harmonics-side-legend">
        {PHASES.map((p) => (
          <li key={p.key}>
            <span
              className="harmonics-swatch"
              style={{ background: SPECTRUM_COLORS[side][p.key] }}
              aria-hidden
            />
            {p.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

const tooltipProps = {
  contentStyle: TOOLTIP_STYLE,
  labelStyle: TOOLTIP_LABEL_STYLE,
  itemStyle: TOOLTIP_ITEM_STYLE,
};

export default function DeviceHarmonicsPanel({
  installationId,
  isAdmin = false,
  requestedBy,
}: {
  installationId: string;
  isAdmin?: boolean;
  requestedBy?: string;
}) {
  const [data, setData] = useState<HarmonicsResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [view, setView] = useState<View>("chart");
  const [unit, setUnit] = useState<Unit>("A");
  const [cmd, setCmd] = useState<CommandState>({ tone: "idle" });
  /** 이 화면에서 응답(ACK)을 받은 명령. 늦게 도착한 조회 결과가 끝난 명령을 다시 "대기"로 되돌리지 않게 한다. */
  const finishedIds = useRef(new Set<string>());

  /** 서버의 처리 중 명령으로 버튼 상태를 맞춘다. 탭을 옮겼다 와도 "요청 중" 이 남는다. */
  const syncCommand = useCallback((active: ActiveCommand | null | undefined) => {
    setCmd((prev) => {
      if (active && !finishedIds.current.has(active.id)) {
        if (active.power === "refreshHarmonics") {
          if (prev.tone === "pending" && prev.commandId === active.id) return prev;
          return {
            tone: "pending",
            commandId: active.id,
            deadline: commandDeadline(active),
            restoredAt: active.createdAt,
          };
        }
        return { tone: "busy", power: active.power };
      }
      // 처리 중인 명령이 없다: 끝났거나(만료·취소 포함) 원래 없음
      return prev.tone === "pending" || prev.tone === "busy" ? { tone: "idle" } : prev;
    });
  }, []);

  const load = useCallback(async (): Promise<HarmonicsResponse | null> => {
    try {
      const res = await fetch(
        `/api/devices/${encodeURIComponent(installationId)}/harmonics?hours=1`,
        { credentials: "same-origin", cache: "no-store" },
      );
      if (!res.ok) {
        setLoadError(true);
        return null;
      }
      const body = (await res.json()) as HarmonicsResponse;
      setData(body);
      setLoadError(false);
      if (isAdmin) syncCommand(body.activeCommand);
      return body;
    } catch {
      setLoadError(true);
      return null;
    }
  }, [installationId, isAdmin, syncCommand]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingId = cmd.tone === "pending" ? cmd.commandId : null;
  const pendingDeadline = cmd.tone === "pending" ? cmd.deadline : 0;

  useEffect(() => {
    if (!pendingId) return;
    const timer = setTimeout(
      () => {
        setCmd({ tone: "err", text: "HMI 응답 시간 초과 (15분). 실행 여부를 확인할 수 없습니다." });
      },
      Math.max(0, pendingDeadline - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [pendingId, pendingDeadline]);

  useWsEvents((msg) => {
    if (!("installationId" in msg) || msg.installationId !== installationId) return;
    if (msg.type === "harmonics_updated") {
      void load();
      return;
    }
    if (msg.type === "command_acked") {
      finishedIds.current.add(msg.commandId);
      if (pendingId && msg.commandId === pendingId) {
        setCmd(
          msg.status === "acked"
            ? { tone: "ok", text: "HMI가 고조파 데이터를 보냈습니다." }
            : { tone: "err", text: "HMI가 요청을 처리하지 못했습니다 (200A가 아니거나 전송 실패)." },
        );
      }
      // 다른 명령이 끝났으면 버튼을 다시 풀기 위해 다시 조회
      void load();
      return;
    }
    // 명령 취소는 device_updated 로 온다
    if (msg.type === "device_updated" && (cmd.tone === "pending" || cmd.tone === "busy")) {
      void load();
    }
  });

  const requestNow = async () => {
    setCmd({ tone: "idle" });
    try {
      const res = await fetch("/api/receiver/commands/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          installationId,
          module: 0,
          power: "refreshHarmonics",
          ...(requestedBy ? { requestedBy } : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        message?: string;
        code?: string;
        command?: { id: string };
      };
      if (body.code === "ACTIVE_COMMAND_EXISTS") {
        // 이미 처리 중인 명령이 있다: 서버에서 다시 읽어 "요청 중" 또는 "다른 명령 처리 중" 으로 표시
        const fresh = await load();
        if (!fresh?.activeCommand) {
          setCmd({ tone: "err", text: "HMI가 처리 중인 명령이 있습니다. 응답이 온 뒤 다시 눌러 주세요." });
        }
        return;
      }
      if (!res.ok || !body.command?.id) {
        setCmd({ tone: "err", text: body.message ?? body.code ?? `HTTP ${res.status}` });
        return;
      }
      setCmd({
        tone: "pending",
        commandId: body.command.id,
        deadline: Date.now() + COMMAND_ACK_TIMEOUT_MS,
      });
    } catch {
      setCmd({ tone: "err", text: "서버에 연결하지 못했습니다." });
    }
  };

  const latest = data?.latest ?? null;

  /** 기본파(1차) 전류(A). 보상 전/후 × L1~L3. 1차가 없으면 null. */
  const fundamentalAmp = useMemo(() => {
    if (!latest) return null;
    const i = latest.orders.indexOf(1);
    if (i < 0) return null;
    const out = {} as Record<Side, Record<Phase, number | null>>;
    for (const { key: side } of SIDES) {
      out[side] = { a: null, b: null, c: null };
      for (const { key } of PHASES) out[side][key] = toAmp(latest[side][key][i]);
    }
    return out;
  }, [latest]);

  /** 차수 i, side, 상의 값을 지금 단위로 */
  const valueAt = useCallback(
    (side: Side, phase: Phase, i: number): number | null => {
      if (!latest) return null;
      return convert(toAmp(latest[side][phase][i]), fundamentalAmp?.[side][phase] ?? null, unit);
    },
    [latest, fundamentalAmp, unit],
  );

  /** 보상 전/후 막대: 차수마다 L1·L2·L3 나란히. 1차(기본파)는 너무 커서 위 기본파 줄에 따로 보여 준다. */
  const spectrum = useMemo(() => {
    const out: Record<Side, Row[]> = { uncomp: [], comp: [] };
    if (!latest) return out;
    for (const { key: side } of SIDES) {
      out[side] = latest.orders
        .map((order, i) => {
          const row: Row = { order, label: `${order}` };
          for (const { key } of PHASES) row[key] = valueAt(side, key, i);
          return row;
        })
        .filter((row) => row.order !== 1);
    }
    return out;
  }, [latest, valueAt]);

  const unitLabel = unit === "A" ? "A" : "% (기본파 대비)";

  /** 보상 전/후 두 차트가 함께 쓰는 세로 눈금 (둘 중 큰 값 기준) */
  const sharedTicks = useMemo(
    () => niceTicks(Math.max(rowsMax(spectrum.uncomp), rowsMax(spectrum.comp))),
    [spectrum],
  );

  return (
    <div className="harmonics-panel">
      <div className="harmonics-toolbar">
        <div className="harmonics-view-switch" role="tablist" aria-label="보기 방식">
          <button
            type="button"
            role="tab"
            aria-selected={view === "chart"}
            onClick={() => setView("chart")}
          >
            그래프
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "table"}
            onClick={() => setView("table")}
          >
            표
          </button>
        </div>
        <div className="harmonics-view-switch harmonics-unit-switch" role="radiogroup" aria-label="단위">
          <button
            type="button"
            role="radio"
            aria-checked={unit === "A"}
            onClick={() => setUnit("A")}
            title="전류 크기 (A)"
          >
            A
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={unit === "%"}
            onClick={() => setUnit("%")}
            title="같은 상 기본파(1차) 대비 %"
          >
            %
          </button>
        </div>
        <p className="harmonics-meta">
          {latest
            ? `마지막 수신 ${formatKstMonthDayTime(latest.recordedAt)} · ${
                latest.source === "command" ? "요청" : "1시간 주기"
              }`
            : null}
        </p>
        {isAdmin ? (
          <button
            type="button"
            className="harmonics-refresh-btn"
            onClick={() => void requestNow()}
            disabled={cmd.tone === "pending" || cmd.tone === "busy"}
          >
            {cmd.tone === "pending" ? "갱신 중…" : "↻ 고조파 갱신"}
          </button>
        ) : null}
      </div>

      {cmd.tone === "pending" ? (
        <p className="harmonics-cmd harmonics-cmd--pending" role="status">
          {cmd.restoredAt
            ? `고조파 갱신을 이미 요청했습니다 (${formatKstMonthDayTime(cmd.restoredAt)}). HMI가 다음 명령 확인 때 보냅니다.`
            : "요청을 등록했습니다. HMI가 다음 명령 확인 때 보냅니다 (최대 약 10분)."}
        </p>
      ) : cmd.tone === "busy" ? (
        <p className="harmonics-cmd harmonics-cmd--pending" role="status">
          HMI가 다른 명령({COMMAND_LABEL[cmd.power] ?? cmd.power})을 처리하는 중입니다. 끝나면 고조파 갱신을
          누를 수 있습니다.
        </p>
      ) : cmd.tone === "ok" || cmd.tone === "err" ? (
        <p className={`harmonics-cmd harmonics-cmd--${cmd.tone}`} role="status">
          {cmd.text}
        </p>
      ) : null}

      {!latest ? (
        <p className="harmonics-empty">
          {loadError
            ? "고조파 데이터를 불러오지 못했습니다."
            : "아직 받은 고조파 데이터가 없습니다. 200A 장치가 1시간마다 보냅니다."}
        </p>
      ) : view === "table" ? (
        <ChartCard title="차수별 고조파 전류" subtitle={`단위 ${unitLabel}`} wide fill>
          <div className="fault-table-wrap harmonics-table-wrap">
            <table className="fault-table harmonics-table">
              <thead>
                <tr>
                  <th rowSpan={2} scope="col">
                    차수
                  </th>
                  <th colSpan={3} scope="colgroup" className="harmonics-group harmonics-col--before">
                    보상 전
                  </th>
                  <th colSpan={3} scope="colgroup" className="harmonics-group harmonics-col--after">
                    보상 후
                  </th>
                  <th colSpan={3} scope="colgroup" className="harmonics-group harmonics-col--rate">
                    저감률
                  </th>
                </tr>
                <tr>
                  {(["before", "after", "rate"] as const).map((g) =>
                    PHASES.map((p, pi) => (
                      <th
                        key={`${g}-${p.key}`}
                        scope="col"
                        className={`harmonics-col--${g}${pi === 0 ? " harmonics-group-start" : ""}`}
                      >
                        {p.label}
                      </th>
                    )),
                  )}
                </tr>
              </thead>
              <tbody>
                {latest.orders.map((o, i) => {
                  // 저감률은 단위와 상관없이 전류(A)로 계산한다.
                  const beforeA = PHASES.map(({ key }) => toAmp(latest.uncomp[key][i]));
                  const afterA = PHASES.map(({ key }) => toAmp(latest.comp[key][i]));
                  const before = PHASES.map(({ key }) => valueAt("uncomp", key, i));
                  const after = PHASES.map(({ key }) => valueAt("comp", key, i));
                  return (
                    <tr key={o} className={o === 1 ? "harmonics-row-fundamental" : undefined}>
                      <th scope="row">{o === 1 ? "1차 (기본파)" : `${o}차`}</th>
                      {before.map((v, pi) => (
                        <td
                          key={`b${pi}`}
                          className={`harmonics-col--before${pi === 0 ? " harmonics-group-start" : ""}`}
                        >
                          {fmtValue(v, unit)}
                        </td>
                      ))}
                      {after.map((v, pi) => (
                        <td
                          key={`a${pi}`}
                          className={`harmonics-col--after${pi === 0 ? " harmonics-group-start" : ""}`}
                        >
                          {fmtValue(v, unit)}
                        </td>
                      ))}
                      {beforeA.map((v, pi) => (
                        <td
                          key={`r${pi}`}
                          className={`harmonics-col--rate${pi === 0 ? " harmonics-group-start" : ""}`}
                        >
                          {o === 1 ? "-" : reductionPct(v, afterA[pi])}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ChartCard>
      ) : (
        <ChartCard title="차수별 고조파 전류" subtitle={`3~49차 · 단위 ${unitLabel}`} wide fill>
          {fundamentalAmp ? (
            <div className="harmonics-fund" aria-label="기본파(1차) 전류">
              <div className="harmonics-fund-head">
                <span className="harmonics-fund-title">기본파</span>
                <span className="harmonics-fund-sub">1차 전류 (A)</span>
              </div>
              {SIDES.map(({ key: side, label, tone }) => (
                <div key={side} className={`harmonics-fund-side harmonics-fund-side--${tone}`}>
                  <span className="harmonics-fund-side-label">{label}</span>
                  <dl className="harmonics-fund-values">
                    {PHASES.map((p) => (
                      <div key={p.key} className="harmonics-fund-value">
                        <dt>
                          <span
                            className="harmonics-swatch"
                            style={{ background: SPECTRUM_COLORS[side][p.key] }}
                            aria-hidden
                          />
                          {p.label}
                        </dt>
                        <dd>
                          {fmtNum(fundamentalAmp[side][p.key])}
                          <small>A</small>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          ) : null}
          <div className="harmonics-side-stack">
            {SIDES.map(({ key: side, label }) => {
              // 보상 전/후 세로 눈금을 같게: 막대 높이로 얼마나 줄었는지 바로 비교된다
              const ticks = sharedTicks;
              return (
                <div key={side} className="harmonics-side">
                  <SpectrumTitle side={side} label={label} />
                  <div className="harmonics-side-plot">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={spectrum[side]}
                        margin={{ top: 6, right: 12, left: 0, bottom: 0 }}
                        barGap={1}
                        barCategoryGap="18%"
                      >
                        <CartesianGrid {...GRID} vertical={false} />
                        <XAxis
                          dataKey="label"
                          {...AXIS}
                          interval={0}
                          tick={{ ...AXIS.tick, fontSize: 10 }}
                        />
                        <YAxis
                          {...AXIS}
                          width={44}
                          domain={[0, ticks[ticks.length - 1]]}
                          ticks={ticks}
                          tickFormatter={fmtTick}
                        />
                        <Tooltip
                          {...tooltipProps}
                          cursor={TOOLTIP_CURSOR}
                          labelFormatter={(l) => `${label} · ${l}차`}
                          formatter={(v) => fmtWithUnit(typeof v === "number" ? v : null, unit)}
                          // 이동 애니메이션 중 툴팁이 차트 밖으로 잠깐 나가 패널에 스크롤이 깜빡였다
                          isAnimationActive={false}
                        />
                        {PHASES.map((p) => (
                          <Bar
                            key={p.key}
                            dataKey={p.key}
                            name={p.label}
                            fill={SPECTRUM_COLORS[side][p.key]}
                            radius={[3, 3, 0, 0]}
                            maxBarSize={9}
                            // 0 도 막대가 사라지지 않게 바닥에 낮은 막대를 흐리게 그린다 (값 없음 null 은 그리지 않음)
                            minPointSize={ZERO_BAR_PX}
                            shape={zeroAwareBar}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="harmonics-axis-note">
            {unit === "A"
              ? "가로: 차수 · 세로: 전류 (A). 보상 전과 보상 후는 같은 세로 눈금입니다. 바닥의 흐린 막대는 0입니다."
              : "가로: 차수 · 세로: 같은 상 기본파(1차) 대비 %. 보상 전은 보상 전 기본파, 보상 후는 보상 후 기본파로 나눕니다. 두 차트는 같은 세로 눈금입니다. 바닥의 흐린 막대는 0입니다."}
          </p>
        </ChartCard>
      )}
    </div>
  );
}
