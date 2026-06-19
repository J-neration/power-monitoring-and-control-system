import type { DeviceStatus, Site } from "../types/site";
import { CLIENT_LABELS } from "../data/clients";

export type StatusFilter = "all" | "fault" | "offline";

export function siteMatchesSearch(site: Site, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const clientLabel = (CLIENT_LABELS[site.client] ?? site.client).toLowerCase();
  return (
    site.name.toLowerCase().includes(q) ||
    clientLabel.includes(q) ||
    site.region.toLowerCase().includes(q) ||
    site.address.toLowerCase().includes(q)
  );
}
