"use client";

import { useEffect } from "react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin]", error);
  }, [error]);

  return (
    <main className="admin-iccid-page">
      <div className="admin-iccid-header">
        <h1 className="admin-iccid-title">관리자 패널 오류</h1>
        <p className="admin-iccid-sub">
          화면을 그리는 중 문제가 발생했습니다. 다시 시도하거나 새로고침해 주세요.
        </p>
      </div>
      <div className="admin-sites-form-actions">
        <button type="button" className="admin-iccid-save" onClick={reset}>
          다시 시도
        </button>
      </div>
    </main>
  );
}
