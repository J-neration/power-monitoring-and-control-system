import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminSitesPanel from "../../../../components/Admin/AdminSitesPanel";
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

export default async function AdminSitesPage() {
  await requireAdmin();

  const sites = await fetchSitesListFromApi().catch(() => []);

  return (
    <main className="admin-iccid-page">
      <div className="admin-iccid-header">
        <h1 className="admin-iccid-title">현장 관리</h1>
        <p className="admin-iccid-sub">
          관리자 전용 · 현장·설치지점 등록 및 USIM ICCID 매핑
        </p>
      </div>
      <AdminSitesPanel initialSites={sites} />
    </main>
  );
}
