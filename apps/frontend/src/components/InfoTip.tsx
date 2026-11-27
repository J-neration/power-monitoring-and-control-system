"use client";

import { useId, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

function stopNav(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
}

/**
 * 작은 ⓘ 버튼. 누르면 설명 상자가 열리고, 바깥을 누르거나 Esc 로 닫힌다.
 * 상자는 body 에 그려서 카드의 overflow 에 잘리지 않고, 화면 밖으로 나가지 않게 자리를 잡는다.
 * 링크 카드 안에 있어도 누를 때 페이지가 이동하지 않는다.
 */
export default function InfoTip({ label, children }: { label: string; children: ReactNode }) {
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
      left = Math.min(Math.max(margin, left), window.innerWidth - width - margin);
      let top = rect.bottom + 8;
      if (top + height > window.innerHeight - margin && rect.top - height - 8 > margin) {
        top = rect.top - height - 8;
      }
      setPos((prev) => (prev && prev.top === top && prev.left === left ? prev : { top, left }));
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
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onMouseDown={stopNav}
        onClick={(event) => {
          stopNav(event);
          setOpen((value) => !value);
        }}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M8 7.15v4.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="8" cy="4.7" r="0.8" fill="currentColor" />
        </svg>
      </button>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              role="dialog"
              aria-label={label}
              className="thd-info-panel"
              style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: "hidden" }}
              onMouseDown={stopNav}
              onClick={stopNav}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
