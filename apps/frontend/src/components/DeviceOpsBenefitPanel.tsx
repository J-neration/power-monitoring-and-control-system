"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Device } from "../types/site";
import type { TelemetryReading } from "../types/site";
import {
  OPS_SAVINGS,
  QUALITY_REFS,
  computeOpsSavings,
  formatCarbon,
  formatKrw,
  formatKwhParts,
  formatTrees,
  formatQuality,
} from "../lib/opsSavings";

type Props = {
  device: Device;
  readings?: TelemetryReading[];
};

type FormulaBlock = {
  title: string;
  lines: string[];
  note?: string;
  sources?: string[];
};

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M13 2 4 14h7l-1 8 10-14h-7l1-6z"
        fill="currentColor"
      />
    </svg>
  );
}

function TreeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 22v-6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M12 4c-2.2 2.4-6.5 6.2-6.5 10.2A6.5 6.5 0 0 0 12 20.7 6.5 6.5 0 0 0 18.5 14.2C18.5 10.2 14.2 6.4 12 4Z"
        fill="currentColor"
      />
      <path
        d="M12 10.5c-1.1 1.1-3 2.8-3 4.5a3 3 0 0 0 6 0c0-1.7-1.9-3.4-3-4.5Z"
        fill="rgba(8,20,12,0.35)"
      />
    </svg>
  );
}

function GaugeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4.6 16.2a8.2 8.2 0 1 1 14.8 0"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path
        d="M12 13.2 16.4 8.4"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="13.4" r="1.6" fill="currentColor" />
    </svg>
  );
}

function WonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6.5 8.2 18h.1L12 7.5 15.7 18h.1L20 6.5"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 11h17M3.5 14.5h17"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function InfoTip({ formula }: { formula: FormulaBlock }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="ops-info" ref={wrapRef}>
      <button
        type="button"
        className={`ops-info-btn${open ? " is-open" : ""}`}
        aria-label={`${formula.title} 산출 공식`}
        aria-expanded={open}
        aria-controls={popId}
        onClick={() => setOpen((v) => !v)}
      >
        i
      </button>
      {open ? (
        <div className="ops-info-pop" id={popId} role="dialog">
          <p className="ops-info-pop-title">{formula.title}</p>
          <ol className="ops-info-pop-list">
            {formula.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
          {formula.note ? (
            <p className="ops-info-pop-note">{formula.note}</p>
          ) : null}
          {formula.sources?.length ? (
            <div className="ops-info-pop-sources">
              <p className="ops-info-pop-sources-label">출처</p>
              <ul>
                {formula.sources.map((src) => (
                  <li key={src}>{src}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StatCard({
  tone,
  icon,
  kicker,
  value,
  unit,
  hint,
  compare,
  formula,
}: {
  tone: "energy" | "carbon" | "cost" | "quality";
  icon: ReactNode;
  kicker: string;
  value: string;
  unit?: string;
  hint?: string;
  compare?: { before: string; after: string };
  formula: FormulaBlock;
}) {
  return (
    <article className={`ops-stat ops-stat--${tone}`}>
      <div className="ops-stat-icon" aria-hidden>
        {icon}
      </div>
      <div className="ops-stat-body">
        <div className="ops-stat-head">
          <span className="ops-stat-kicker">{kicker}</span>
          <InfoTip formula={formula} />
        </div>
        <div className="ops-stat-num">
          <span className="ops-stat-value">{value}</span>
          {unit ? <span className="ops-stat-unit">{unit}</span> : null}
        </div>
        {compare ? (
          <div className="ops-stat-compare">
            <span className="ops-stat-compare-pair">
              <span className="ops-stat-compare-tag">전</span>
              <span className="ops-stat-compare-before">{compare.before}</span>
            </span>
            <span className="ops-stat-compare-arrow" aria-hidden>
              →
            </span>
            <span className="ops-stat-compare-pair">
              <span className="ops-stat-compare-tag">후</span>
              <span className="ops-stat-compare-after">{compare.after}</span>
            </span>
          </div>
        ) : null}
        {hint ? <span className="ops-stat-hint">{hint}</span> : null}
      </div>
    </article>
  );
}

export default function DeviceOpsBenefitPanel({
  device,
  readings = [],
}: Props) {
  const s = computeOpsSavings(device, readings);
  const kwhParts = s.kWhYear != null ? formatKwhParts(s.kWhYear) : null;
  const carbon = s.carbonKgYear != null ? formatCarbon(s.carbonKgYear) : null;
  const lossPct = Math.round(OPS_SAVINGS.copperLossRatio * 100);
  const historyNote =
    s.windowHours != null
      ? `최근 ${s.windowHours.toFixed(0)}시간 이력으로 연간 환산했습니다.`
      : "지금 계측이 1년 동안 이어진다고 보고 8760시간을 곱합니다.";

  const pBefore = device.uncompP;
  const pAfter = device.compP;
  const energyCompare =
    pBefore != null && pAfter != null && Number.isFinite(pBefore) && Number.isFinite(pAfter)
      ? {
          before: `${pBefore.toFixed(1)} kW`,
          after: `${pAfter.toFixed(1)} kW`,
        }
      : undefined;
  const pfCompare =
    s.pfBefore != null && s.pfAfter != null
      ? {
          before: `역률 ${Math.abs(s.pfBefore).toFixed(1)}%`,
          after: `역률 ${Math.abs(s.pfAfter).toFixed(1)}%`,
        }
      : undefined;
  const qualityCompare =
    s.qualityBefore != null && s.qualityAfter != null
      ? {
          before: `${Math.round(s.qualityBefore)}점`,
          after: `${Math.round(s.qualityAfter)}점`,
        }
      : undefined;

  return (
    <section className="ops-benefit" aria-label="운용 절감">
      <StatCard
        tone="energy"
        icon={<BoltIcon />}
        kicker="전력량 절감"
        value={kwhParts?.value ?? "—"}
        unit={kwhParts?.unit}
        compare={energyCompare}
        hint={
          s.kwSaved != null ? `지금 ${s.kwSaved.toFixed(1)} kW 절감 중` : undefined
        }
        formula={{
          title: "전력량 절감 공식",
          lines: [
            `순시 절감(kW) = 유효전력 감소 ΔP + 동손(I²R) 감소`,
            `ΔP = max(0, 보상 전 P − 보상 후 P)  — 부하측·계통측 유효전력 계측`,
            `동손 감소 = P × ${lossPct}% × (1 − (I계통 / I부하)²)`,
            `전류를 못 쓰면 (보상 전 kVA − 보상 후 kVA) × ${lossPct}% 로 대체`,
            `연간 kWh = 순시 kW × 8,760시간 (이력 있으면 구간의 kWh를 연간으로 환산)`,
          ],
          note: `${historyNote} ${lossPct}%는 변압기 전부하 동손(~1–2%)과 저압 간선 손실을 합친 가정치이며 법정 계수가 아닙니다.`,
          sources: [
            "줄의 법칙 / IEC 60287-1-1 — 도체 손실 P = I²R, 전류 제곱에 비례",
            "IEC 60076-1 (KS C IEC 60076-1) — 전력용 변압기 부하손(동손)은 부하전류의 제곱에 비례",
            "IEEE Std C57.12.00 — 배전 변압기 load loss(동손) 정의",
            "IEEE Std 141 (Red Book) — 배전계통 I²R 손실·역률 개선에 따른 손실 감소",
            `동손 비율 ${lossPct}% — 변압기+선로를 묶은 현장 가정치 (표준 고정값이 아님)`,
            "연간 환산 8,760h — 현재 운전이 1년 지속된다고 보는 환산 (실측 전력량계 아님)",
          ],
        }}
      />
      <StatCard
        tone="carbon"
        icon={<TreeIcon />}
        kicker="탄소 절감"
        value={carbon?.value ?? "—"}
        unit={carbon ? `${carbon.unit}/년` : undefined}
        hint={s.treesYear != null ? formatTrees(s.treesYear) : undefined}
        formula={{
          title: "탄소 절감 공식",
          lines: [
            `연간 탄소(kgCO₂eq) = 연간 전력량 절감(kWh) × ${OPS_SAVINGS.co2KgPerKwh} kgCO₂eq/kWh`,
            `계수는 소비단 전력배출계수입니다. 발전단 계수와는 다릅니다.`,
            `소나무 환산 = 탄소(kg) ÷ ${OPS_SAVINGS.treeKgCo2PerYear} kgCO₂/그루·년`,
          ],
          note: "전력량 절감이 추정값이면 탄소·그루 환산도 같은 추정의 연장입니다. ESG 보고·배출권 정산용 공식 수치가 아닙니다.",
          sources: [
            "기후에너지환경부, 국가 온실가스 통계 관리위원회 — 2023년 소비단 전력배출계수 0.4173 tCO₂eq/MWh (2025.12.17 공표). 1 t/MWh = 1 kg/kWh",
            "같은 공표의 직전 3년 평균(2020–2022)은 0.4541 tCO₂eq/MWh. 본 화면은 2023년 단년도 계수 0.4173을 사용",
            "국립산림과학원 「주요 산림수종의 표준 탄소흡수량」 — 소나무류 1그루 연간 CO₂ 흡수량 평균 6.6 kg (수령·입지 평균, 홍보 환산용)",
            "IPCC 전력 간접배출(Scope 2) — 사용 전력량 × 계통 배출계수",
          ],
        }}
      />
      <StatCard
        tone="cost"
        icon={<WonIcon />}
        kicker="전기요금 절감"
        value={s.costYear != null ? formatKrw(s.costYear) : "—"}
        compare={pfCompare}
        hint={
          s.pfCostYear != null && s.energyCostYear != null
            ? `전력량 ${formatKrw(s.energyCostYear)} + 역률 ${formatKrw(s.pfCostYear)}`
            : undefined
        }
        formula={{
          title: "전기요금 절감 공식",
          lines: [
            `전력량요금 ≈ 연간 kWh × ${OPS_SAVINGS.krwPerKwh.toLocaleString("ko-KR")}원/kWh`,
            `기본요금 ≈ 보상 전 kW × ${OPS_SAVINGS.demandKrwPerKwMonth.toLocaleString("ko-KR")}원/kW·월`,
            `역률요금 = 기본요금 × (기준역률 − 실역률) × 0.2%  (1%당 기본요금의 0.2%)`,
            `지상 90% 미만이면 가산, 90% 초과~95% 이하면 감액 (감액 폭 최대 5%)`,
            `연간 역률 절감 = 월 기본요금 × (보상 전 가감비율 − 보상 후 가감비율) × 12`,
            `합계 = 전력량요금 절감 + 역률요금 절감`,
          ],
          note: "계약전력·실제 고지서가 아닙니다. 선택요금·시간대·기후환경요금·연료비조정은 넣지 않은 환산입니다.",
          sources: [
            "한국전력공사 전기공급약관 시행세칙 제43조(역률요금) — 매 1%당 기본요금의 0.2% 가감",
            "같은 조 개정 전 구간: 지상 90% 미만 할증, 90% 초과~95% 이하 감액. 본 화면은 이 구간을 사용",
            "2025.2.1 개정: 지상 기준 92%, 감액 92% 초과~97% 이하, 적용시간 08–22시. 현장 계약에 따라 다를 수 있음",
            `한전 전기요금표 산업용전력(을) 고압A — 기본요금은 선택 I/II에 따라 약 6,090~8,320원/kW. 본 화면은 ${OPS_SAVINGS.demandKrwPerKwMonth.toLocaleString("ko-KR")}원/kW·월 근사`,
            `전력량단가 ${OPS_SAVINGS.krwPerKwh}원/kWh — 산업용(을) 고압A 중간부하 근사. 경부하~최대부하는 약 45~160원대`,
            "부가가치세·전력산업기반기금은 포함하지 않음",
          ],
        }}
      />
      <StatCard
        tone="quality"
        icon={<GaugeIcon />}
        kicker="전기 품질 점수"
        value={
          s.qualityAfter != null ? formatQuality(s.qualityAfter) : "—"
        }
        unit={s.qualityAfter != null ? "점" : undefined}
        compare={qualityCompare}
        hint={`IEEE 519 THD 한도 ${QUALITY_REFS.thdLimitPct}%`}
        formula={{
          title: "전기 품질 점수 공식",
          lines: [
            `점수 = 역률 ${QUALITY_REFS.weights.pf * 100}% + 전류 THD ${QUALITY_REFS.weights.thd * 100}% + 전압 불평형 ${QUALITY_REFS.weights.unbalance * 100}%`,
            `전류 THD: IEEE 519-2022 Table 2의 8% 한도를 기준으로 채점 (Isc/IL 20–50, 120 V–69 kV). 5% 이내 100–90점, 8%에서 80점, 20%(표의 최대 한도)에서 25점. 계측은 THD이며 TDD의 근사입니다.`,
            `전압 불평형: NEMA MG-1 LVUR = max|V−Vavg| / Vavg × 100. 1%(전동기 권장)→90점, 2%(저압 양립 레벨)→70점, 5% 이상→0점.`,
            `역률: IEEE 한도가 아닙니다. 한전 전기공급약관 90% 할증 / 95% 인센티브 구간에 맞춰 90%→82점, 95% 이상→100점.`,
            "빠진 항목이 있으면 나머지 가중치만 다시 나눠 평균합니다.",
          ],
          note: "보상 전은 부하측 THD·역률, 지금은 계통측 THD·역률입니다. 전압 불평형은 상전압 계측을 씁니다.",
          sources: [
            "IEEE Std 519-2022 Table 2 — Current distortion limits for systems 120 V to 69 kV (Isc/IL 20–50 → TDD 8%)",
            "IEEE Std 519-2022 Table 1 — Voltage distortion, V ≤ 1.0 kV → THD 8% (참고, 본 점수는 전류 THD)",
            "IEC 61000-2-2:2018 / EN 50160:2010 — 저압 공공계통 전압 불평형 2%",
            "NEMA MG-1 — 전동기 권장 전압 불평형 1% (LVUR)",
            "IEEE Std 1159-2019 — 전력품질 감시에서 전압 불평형 정의",
            "한국전력공사 전기공급약관 — 역률 90% 미만 기본요금 할증, 90–95% 인센티브 (IEEE 아님)",
          ],
        }}
      />
    </section>
  );
}
