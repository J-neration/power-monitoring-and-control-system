import { fetchSites } from "../../lib/api";
import DashboardClient from "../../components/Dashboard/DashboardClient";

export default async function HomePage() {
  const sites = await fetchSites().catch(() => []);

  return (
    <main className="dashboard-full">
      <DashboardClient sites={sites} />
    </main>
  );
}
