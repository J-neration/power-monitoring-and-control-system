import { Device } from "../types/device";

const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

export const fetchDevices = async (): Promise<Device[]> => {
  const response = await fetch(`${apiBase}/devices`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to fetch devices");
  }
  const data = (await response.json()) as { devices: Device[] };
  return data.devices;
};
