import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminInstallationIccidPanel from "../../../../components/Admin/AdminInstallationIccidPanel";
import { fetchSitesListFromApi } from "../../../../lib/api";

const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

async function requireAdmin() {
  const token = cookies().get("pmcs_token")?.value;
  if (!token) redirect("/login");

  const res = await fetch(`${apiBase}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) redirect("/login");
  const data = (await res.json()) as { user?: { role?: string } };
  if (data.user?.role !== "ADMIN") redirect("/");
}

export default async function AdminInstallationsIccidPage() {
  await requireAdmin();

  const sites = await fetchSitesListFromApi().catch(() => []);

  return (
    <main className="admin-iccid-page">
      <div className="admin-iccid-header">
        <h1 className="admin-iccid-title">USIM ICCID ↔ 설치지점</h1>
        <p className="admin-iccid-sub">
          관리자 전용 · HMI 수신은 등록된 ICCID로만 설치지점이 결정됩니다.
        </p>
      </div>
      <AdminInstallationIccidPanel sites={sites} />
    </main>
  );
}
