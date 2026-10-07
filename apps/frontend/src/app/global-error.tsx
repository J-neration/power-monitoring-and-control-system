"use client";

import TransientErrorFallback from "../components/TransientErrorFallback";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, background: "#07090e" }}>
        <TransientErrorFallback error={error} reset={reset} />
      </body>
    </html>
  );
}
