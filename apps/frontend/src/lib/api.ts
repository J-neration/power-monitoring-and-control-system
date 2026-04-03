import { cookies } from "next/headers";
import type { Device, DeviceWithInstallation, Site, TelemetryReading } from "../types/site";
import type { SiteListFromApi } from "../types/admin";

export type FaultEvent = {
  id: string;
  module: number;
  desc: string;
  occurredAt: string;
  installationId: string;
  /** LTE ModuleFaultState 에서만 — HMI eventName (예: Over Temperature) */
  eventName?: string | null;
};

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
  const response = await fetch(`${apiBase}/sites`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (response.status === 401) return [];
  if (!response.ok) throw new Error("Failed to fetch sites");
  const data = (await response.json()) as {
    sites: Array<{
      siteId: string;
      name: string;
      client: string;
      region: string;
      address: string;
      installations: Array<{
        id: string;
        label: string;
        device: (Device & { status: string }) | null;
      }>;
    }>;
  };
  return (data.sites ?? []).map((s) => ({
    id: s.siteId,
    name: s.name,
    client: s.client,
    region: s.region,
    address: s.address,
    installations: s.installations.map((inst) => ({
      id: inst.id,
      label: inst.label,
      device: inst.device ?? null,
    })),
  }));
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

/** GET /devices/:id/faults — Admin 전용, installationId로 fault 이력 조회 (lte-{iccid} 자동 설치와 합침) */
export const fetchFaults = async (
  installationId: string,
  limit = 50
): Promise<FaultEvent[]> => {
  const response = await fetch(
    `${apiBase}/devices/${encodeURIComponent(installationId)}/faults?limit=${limit}`,
    { cache: "no-store", headers: authHeaders() }
  );
  if (!response.ok) return [];
  const data = (await response.json()) as { faults: FaultEvent[] };
  return data.faults ?? [];
};

/** GET /sites — ADMIN 응답에 installations[].iccid 포함 */
export const fetchSitesListFromApi = async (): Promise<SiteListFromApi[]> => {
  const response = await fetch(`${apiBase}/sites`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (response.status === 401) return [];
  if (!response.ok) throw new Error("Failed to fetch sites");
  const data = (await response.json()) as { sites: SiteListFromApi[] };
  return data.sites ?? [];
};
