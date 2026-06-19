"use client";

import { useLayoutEffect, useState } from "react";

type Point = { x: number; y: number };

type Props = {
  containerEl: HTMLElement | null;
  fromEl: HTMLElement | null;
  toPoint: Point | null;
};

function buildConnectorPath(x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const c1x = x1 + dx * 0.35;
  const c2x = x1 + dx * 0.65;
  return `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;
}

export default function SiteSelectionConnector({
  containerEl,
  fromEl,
  toPoint,
}: Props) {
  const [path, setPath] = useState<string | null>(null);

  useLayoutEffect(() => {
    const update = () => {
      if (!containerEl || !fromEl || !toPoint) {
        setPath(null);
        return;
      }

      const container = containerEl.getBoundingClientRect();
      const from = fromEl.getBoundingClientRect();
      const x1 = from.right - container.left;
      const y1 = from.top + from.height / 2 - container.top;
      const x2 = toPoint.x - container.left;
      const y2 = toPoint.y - container.top;

      setPath(buildConnectorPath(x1, y1, x2, y2));
    };

    update();
    window.addEventListener("resize", update);
    const sidebar = fromEl?.closest(".sidebar-list");
    sidebar?.addEventListener("scroll", update, { passive: true });

    return () => {
      window.removeEventListener("resize", update);
      sidebar?.removeEventListener("scroll", update);
    };
  }, [containerEl, fromEl, toPoint]);

  if (!path) return null;

  return (
    <svg className="site-selection-connector" aria-hidden="true">
      <path d={path} className="site-selection-connector-line" />
    </svg>
  );
}
