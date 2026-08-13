"use client";

import { useEffect, useState } from "react";

/** SSR HTML과 첫 클라이언트 렌더가 달라지는 상대시각 등에 사용 */
export function useHasMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}
