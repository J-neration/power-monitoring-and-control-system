"use client";

import TransientErrorFallback from "../../../../components/TransientErrorFallback";
import { isTransientClientError } from "../../../../lib/transientClientError";

export default function DeviceDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  if (isTransientClientError(error)) {
    return <TransientErrorFallback error={error} reset={reset} />;
  }

  return (
    <main className="device-detail-page">
      <section className="scada-panel" style={{ padding: 24 }}>
        <h1 className="chart-title">장비를 불러오지 못했습니다</h1>
        <p className="device-settings-empty">화면을 그리는 중 문제가 발생했습니다.</p>
        <button type="button" className="device-settings-save" onClick={() => reset()}>
          다시 시도
        </button>
      </section>
    </main>
  );
}
