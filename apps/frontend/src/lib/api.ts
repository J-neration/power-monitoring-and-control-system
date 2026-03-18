import type { DeviceWithInstallation, Site, TelemetryReading } from "../types/site";

const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";


export const fetchDevicesRaw = async (): Promise<DeviceWithInstallation[]> => {
  const response = await fetch(`${apiBase}/devices`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to fetch devices");
  }
  const data = (await response.json()) as { devices: DeviceWithInstallation[] };
  return data.devices;
};

export const fetchSites = async (): Promise<Site[]> => {
  const devices = await fetchDevicesRaw();

  // Group by site
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

    // Each device corresponds to one installationId
    current.installations.push({
      id: d.installation.id,
      label: d.installation.label,
      device: d, // OK: DeviceWithInstallation extends Device
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
    { cache: "no-store" }
  );
  if (!response.ok) return [];
  const data = (await response.json()) as { readings: TelemetryReading[] };
  return data.readings ?? [];
};

export const fetchDevice = async (installationId: string) => {
  const response = await fetch(`${apiBase}/devices/${installationId}`, {
    cache: "no-store",
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Failed to fetch device");
  }
  const data = (await response.json()) as { device: DeviceWithInstallation };
  return data.device ?? null;
};
