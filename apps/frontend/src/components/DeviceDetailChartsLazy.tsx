"use client";

import dynamic from "next/dynamic";
import type { Device } from "../types/site";

const DeviceDetailCharts = dynamic(() => import("./DeviceDetailCharts"), {
  ssr: false,
  loading: () => (
    <div className="device-charts-grid">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="skel skel-box" style={{ height: 200, borderRadius: 10 }} />
      ))}
    </div>
  ),
});

export default function DeviceDetailChartsLazy({ device }: { device: Device }) {
  return <DeviceDetailCharts device={device} />;
}
