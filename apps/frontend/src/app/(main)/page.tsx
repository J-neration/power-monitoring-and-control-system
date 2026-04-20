import type { Metadata } from "next";
import { fetchSites } from "../../lib/api";
import DashboardClient from "../../components/Dashboard/DashboardClient";

export const metadata: Metadata = { title: "대시보드" };

export default async function HomePage() {
  const sites = await fetchSites().catch(() => []);

  return (
    <main className="dashboard-full">
      <DashboardClient sites={sites} />
    </main>
  );
}
