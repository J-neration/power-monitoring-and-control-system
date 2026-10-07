"use client";

import { useLayoutEffect, useState } from "react";
import {
  clearTransientRetryFlag,
  isTransientClientError,
  reloadOnceForTransientError,
} from "../lib/transientClientError";

const shellStyle = {
  minHeight: "100vh",
  background: "#07090e",
  color: "#e8edf2",
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
  justifyContent: "center",
  gap: 16,
  fontFamily: '"Inter", "Segoe UI", "Malgun Gothic", system-ui, sans-serif',
};

const buttonStyle = {
  background: "rgba(45, 212, 191, 0.12)",
  color: "#5eead4",
  border: "1px solid rgba(45, 212, 191, 0.4)",
  borderRadius: 3,
  padding: "8px 16px",
  cursor: "pointer",
  font: "inherit",
};

export default function TransientErrorFallback({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const transient = isTransientClientError(error);
  const [gaveUp, setGaveUp] = useState(false);

  useLayoutEffect(() => {
    console.error(error);
    if (!transient) return;
    if (!reloadOnceForTransientError()) setGaveUp(true);
  }, [error, transient]);

  if (transient && !gaveUp) {
    return <div style={{ minHeight: "100vh", background: "#07090e" }} />;
  }

  if (transient) {
    return (
      <main style={shellStyle}>
        <p>연결이 끊겨 화면을 다시 열지 못했습니다.</p>
        <button
          type="button"
          style={buttonStyle}
          onClick={() => {
            clearTransientRetryFlag();
            window.location.reload();
          }}
        >
          다시 연결
        </button>
      </main>
    );
  }

  return (
    <main style={shellStyle}>
      <p>화면을 표시하지 못했습니다.</p>
      <button type="button" style={buttonStyle} onClick={() => reset()}>
        다시 시도
      </button>
    </main>
  );
}
