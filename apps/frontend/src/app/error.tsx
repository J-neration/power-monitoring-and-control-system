"use client";

import TransientErrorFallback from "../components/TransientErrorFallback";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <TransientErrorFallback error={error} reset={reset} />;
}
