import { cookies } from "next/headers";
import type { DeviceWithInstallation, Site, TelemetryReading } from "../types/site";

const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

/** 서버 컴포넌트 전용: pmcs_token 쿠키를 Authorization 헤더로 포워딩 */
const authHeaders = (): Record<string, string> => {
  try {
    const token = cookies().get("pmcs_token")?.value;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    // 클라이언트 컴포넌트나 쿠키 없는 환경에서는 빈 객체 반환
    return {};
  }
};

export const fetchDevicesRaw = async (): Promise<DeviceWithInstallation[]> => {
  const response = await fetch(`${apiBase}/devices`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (response.status === 401) return [];
  if (!response.ok) throw new Error("Failed to fetch devices");
  const data = (await response.json()) as { devices: DeviceWithInstallation[] };
  return data.devices;
};

export const fetchSites = async (): Promise<Site[]> => {
  const devices = await fetchDevicesRaw();

  const siteMap = new Map<string, Site>();

  for (const d of devices) {
    const site = d.installation.site;
    const siteId = site.id;

    const current = siteMap.get(siteId) ?? {
      id: site.id,
      name: site.name,
      client: site.client ?? "unknown",
      region: site.region,
      address: site.address,
      installations: [],
    };

    current.installations.push({
      id: d.installation.id,
      label: d.installation.label,
      device: d,
    });

    siteMap.set(siteId, current);
  }

  return Array.from(siteMap.values());
};

export const fetchReadings = async (
  installationId: string,
  hours = 24
): Promise<TelemetryReading[]> => {
  const response = await fetch(
    `${apiBase}/devices/${encodeURIComponent(installationId)}/readings?hours=${hours}`,
    { cache: "no-store", headers: authHeaders() }
  );
  if (!response.ok) return [];
  const data = (await response.json()) as { readings: TelemetryReading[] };
  return data.readings ?? [];
};

export const fetchDevice = async (installationId: string) => {
  const response = await fetch(`${apiBase}/devices/${installationId}`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Failed to fetch device");
  const data = (await response.json()) as { device: DeviceWithInstallation };
  return data.device ?? null;
};
