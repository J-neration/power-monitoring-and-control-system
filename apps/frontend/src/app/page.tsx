import { fetchSites } from "../lib/api";
import { fakeSites } from "../data/fakeSites";
import DashboardClient from "../components/Dashboard/DashboardClient";

export default async function HomePage() {
  const realSites = await fetchSites().catch(() => []);

  // Merge: real DB sites take precedence by ID; fake sites always included
  // (fake site IDs are distinct from real ones, so no collision)
  const realSiteIds = new Set(realSites.map((s) => s.id));
  const mergedSites = [
    ...realSites,
    ...fakeSites.filter((s) => !realSiteIds.has(s.id)),
  ];

  return (
    <main className="dashboard-full">
      <DashboardClient sites={mergedSites} />
    </main>
  );
}
