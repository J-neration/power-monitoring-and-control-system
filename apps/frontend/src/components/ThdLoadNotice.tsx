"use client";

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import MetricValue from "./MetricValue";
import { LOW_LOAD_HINT, isLowLoadCurrent } from "../lib/lowLoad";

function stopNav(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
}

export function ThdInfoTip() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useLayoutEffect(() => {
    if (!open) return;

    function place() {
      const btn = btnRef.current;
      const panel = panelRef.current;
      if (!btn || !panel) return;
      const rect = btn.getBoundingClientRect();
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const margin = 8;
      let left = rect.left + rect.width / 2 - width / 2;
      left = Math.min(
        Math.max(margin, left),
        window.innerWidth - width - margin,
      );
      let top = rect.bottom + 8;
      if (
        top + height > window.innerHeight - margin &&
        rect.top - height - 8 > margin
      ) {
        top = rect.top - height - 8;
      }
      setPos((prev) =>
        prev && prev.top === top && prev.left === left ? prev : { top, left },
      );
    }

    place();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: globalThis.MouseEvent) {
      const target = event.target as Node;
      if (btnRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }

    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`thd-info-tip${open ? " is-open" : ""}`}
        aria-label="THDi 수치 해석 안내"
        aria-expanded={open}
        aria-controls={panelId}
        onMouseDown={stopNav}
        onClick={(event) => {
          stopNav(event);
          setOpen((value) => !value);
        }}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
          <circle
            cx="8"
            cy="8"
            r="6.25"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M8 7.15v4.1"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <circle cx="8" cy="4.7" r="0.8" fill="currentColor" />
        </svg>
      </button>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              role="dialog"
              aria-label="THDi 수치 해석 안내"
              className="thd-info-panel"
              style={
                pos
                  ? { top: pos.top, left: pos.left }
                  : { top: 0, left: 0, visibility: "hidden" }
              }
              onMouseDown={stopNav}
              onClick={stopNav}
            >
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
            </div>,
            document.body,
          )
        : null}
    </>
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
