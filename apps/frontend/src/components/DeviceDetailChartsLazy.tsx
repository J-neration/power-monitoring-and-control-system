"use client";

import dynamic from "next/dynamic";
import type { Device } from "../types/site";
import type { DeviceChartSection } from "./DeviceDetailCharts";

const DeviceDetailCharts = dynamic(() => import("./DeviceDetailCharts"), {
  ssr: false,
  loading: () => (
    <div className="device-charts-grid device-charts-grid--section">
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="skel skel-box"
          style={{ height: "100%", borderRadius: 10 }}
        />
      ))}
    </div>
  ),
});

export default function DeviceDetailChartsLazy({
  device,
  compact = false,
  section,
}: {
  device: Device;
  compact?: boolean;
  section?: DeviceChartSection;
}) {
  return (
    <DeviceDetailCharts device={device} compact={compact} section={section} />
  );
}
