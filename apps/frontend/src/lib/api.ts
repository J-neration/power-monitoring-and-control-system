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

export const fetchDevice = async (id: string): Promise<Device | null> => {
  const response = await fetch(`${apiBase}/devices/${id}`, {
    cache: "no-store",
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Failed to fetch device");
  }
  const data = (await response.json()) as { device: Device };
  return data.device ?? null;
};