"use client";

export default function DeviceDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const fetchFailed = /fetch failed/i.test(error.message ?? "");

  return (
    <main className="device-detail-page">
      <section className="scada-panel" style={{ padding: 24 }}>
        <h1 className="chart-title">장비를 불러오지 못했습니다</h1>
        <p className="device-settings-empty">
          {fetchFailed
            ? "백엔드 연결이 잠깐 끊겼습니다. 개발 중 서버가 재시작될 때 자주 납니다."
            : "화면을 그리는 중 문제가 발생했습니다."}
        </p>
        <button type="button" className="device-settings-save" onClick={() => reset()}>
          다시 시도
        </button>
      </section>
    </main>
  );
}
