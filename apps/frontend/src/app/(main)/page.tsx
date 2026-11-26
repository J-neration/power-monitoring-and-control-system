import type { Metadata } from "next";
import { fetchSites } from "../../lib/api";
import { getSessionUser } from "../../lib/auth-server";
import DashboardClient from "../../components/Dashboard/DashboardClient";

export const metadata: Metadata = { title: "PrimeSolution" };

export default async function HomePage() {
  const [sites, user] = await Promise.all([
    fetchSites().catch(() => []),
    getSessionUser(),
  ]);
  // 알람 확인은 관리자·고객사만 (백엔드 requireAlarmAcker 와 같은 규칙)
  const canAckAlarms = user?.role === "ADMIN" || user?.role === "CLIENT";

  return (
    <main className="dashboard-full">
      <DashboardClient sites={sites} canAckAlarms={canAckAlarms} />
    </main>
  );
}
