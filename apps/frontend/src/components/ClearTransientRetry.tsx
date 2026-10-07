"use client";

import { useEffect } from "react";
import { clearTransientRetryFlag } from "../lib/transientClientError";

/** After the app stays up, allow the next dropped connection to recover once. */
export default function ClearTransientRetry() {
  useEffect(() => {
    const id = window.setTimeout(() => clearTransientRetryFlag(), 10_000);
    return () => window.clearTimeout(id);
  }, []);
  return null;
}
