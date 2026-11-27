"use client";

import type { ReactNode } from "react";
import InfoTip from "./InfoTip";
import MetricValue from "./MetricValue";
import { LOW_LOAD_HINT, isLowLoadCurrent } from "../lib/lowLoad";

export function ThdInfoTip() {
  return (
    <InfoTip label="THDi 수치 해석 안내">
      <p>
        THDi는 기본파 전류에 대한 고조파 전류의 비율입니다. 부하전류가
        낮을 때 기본파 전류가 고조파 전류보다 더 크게 감소하면 THDi가
        높게 표시될 수 있습니다.
      </p>
      <p className="thd-info-kicker">참고 계산 예시</p>
      <p className="thd-info-note">
        계산 원리를 설명하기 위한 예시이며, 실제 현장 측정값은 아닙니다.
      </p>
      <p className="thd-info-formula">
        THDi(%) = √(I₂² + I₃² + … + Iₙ²) ÷ I₁ × 100
      </p>
      <ul className="thd-info-defs">
        <li>I₁: 기본파 전류</li>
        <li>I₂~Iₙ: 각 차수의 고조파 전류</li>
      </ul>
      <ul className="thd-info-examples">
        <li>기본파 전류 2 A, 고조파 전류 합성값 0.6 A → THDi 30%</li>
        <li>기본파 전류 30 A, 고조파 전류 합성값 0.6 A → THDi 2%</li>
      </ul>
      <p>
        고조파 전류 합성값이 같아도 기본파 전류가 작으면 THDi가 더 높게
        표시될 수 있습니다. 위 계산은 이 차이를 보여주기 위해 고조파
        전류 합성값을 동일하게 가정한 예시입니다.
      </p>
    </InfoTip>
  );
}

export function ThdLowLoadBadge() {
  return (
    <span className="thd-low-load-badge" title={LOW_LOAD_HINT}>
      저부하
    </span>
  );
}

export function ThdPhaseValue({
  value,
  current,
}: {
  value?: number | null;
  current?: number | null;
}) {
  const low = isLowLoadCurrent(current);
  return (
    <span className={`thd-phase-value${low ? " is-low-load" : ""}`}>
      <MetricValue value={value} kind="thd" />
      {low ? <ThdLowLoadBadge /> : null}
    </span>
  );
}

export function ThdLabel({ children }: { children: ReactNode }) {
  return (
    <span className="thd-label">
      {children}
      <ThdInfoTip />
    </span>
  );
}
