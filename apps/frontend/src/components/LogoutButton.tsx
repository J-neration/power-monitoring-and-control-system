"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

type LogoutButtonProps = {
  active?: boolean;
};

export default function LogoutButton({ active = true }: LogoutButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) setConfirming(false);
  }, [active]);

  useEffect(() => {
    if (!confirming) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
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
    <div className="header-side-logout" ref={panelRef}>
      {confirming ? (
        <>
          <p className="header-side-logout-msg">로그아웃 하시겠습니까?</p>
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
        </>
      ) : (
        <button
          type="button"
          className="header-side-logout-btn"
          onClick={() => setConfirming(true)}
        >
          로그아웃
        </button>
      )}
    </div>
  );
}
