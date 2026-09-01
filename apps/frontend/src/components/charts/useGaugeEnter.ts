"use client";

import { useEffect, useState } from "react";

/** 마운트 시 0→1. reduced-motion이면 바로 1. */
export function useGaugeEnter(duration = 900, delay = 0): number {
  const [p, setP] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setP(1);
      return;
    }

    let raf = 0;
    const origin = performance.now() + delay;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - origin) / duration));
      setP(1 - (1 - t) ** 3);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [duration, delay]);

  return p;
}
