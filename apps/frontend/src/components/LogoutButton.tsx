"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // 팝오버 바깥 클릭 시 닫기
  useEffect(() => {
    if (!confirming) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setConfirming(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [confirming]);

  async function handleConfirm() {
    setConfirming(false);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="logout-wrapper" ref={popoverRef}>
      <button
        onClick={() => setConfirming((v) => !v)}
        className="header-profile-btn"
        title="로그아웃"
        type="button"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>

      {confirming && (
        <div className="logout-popover">
          <p className="logout-popover-msg">로그아웃 하시겠습니까?</p>
          <div className="logout-popover-actions">
            <button
              className="logout-popover-cancel"
              onClick={() => setConfirming(false)}
              type="button"
            >
              취소
            </button>
            <button
              className="logout-popover-confirm"
              onClick={handleConfirm}
              type="button"
            >
              로그아웃
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
