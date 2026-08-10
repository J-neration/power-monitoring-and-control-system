"use client";

import { useEffect, useRef } from "react";

const RETRY_KEY = "pmcs_admin_conn_retry";

function isConnectionClosed(error: Error) {
  return /connection closed/i.test(error.message ?? "");
}

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const retried = useRef(false);

  useEffect(() => {
    console.error("[admin]", error);

    if (retried.current || !isConnectionClosed(error)) return;

    // RSC 스트림이 Netlify/프록시에서 끊기면 Flight가 "Connection closed"를 던짐.
    // 한 번만 하드 리로드로 복구 시도.
    try {
      if (sessionStorage.getItem(RETRY_KEY) === "1") {
        sessionStorage.removeItem(RETRY_KEY);
        return;
      }
      sessionStorage.setItem(RETRY_KEY, "1");
      retried.current = true;
      window.location.reload();
    } catch {
      // sessionStorage 불가 시 수동 재시도에 맡김
    }
  }, [error]);

  return (
    <main className="admin-iccid-page">
      <div className="admin-iccid-header">
        <h1 className="admin-iccid-title">관리자 패널 오류</h1>
        <p className="admin-iccid-sub">
          {isConnectionClosed(error)
            ? "서버 연결이 끊겼습니다. 다시 시도해 주세요."
            : "화면을 그리는 중 문제가 발생했습니다. 다시 시도하거나 새로고침해 주세요."}
        </p>
      </div>
      <div className="admin-sites-form-actions">
        <button
          type="button"
          className="admin-iccid-save"
          onClick={() => {
            try {
              sessionStorage.removeItem(RETRY_KEY);
            } catch {
              /* ignore */
            }
            reset();
          }}
        >
          다시 시도
        </button>
      </div>
    </main>
  );
}
