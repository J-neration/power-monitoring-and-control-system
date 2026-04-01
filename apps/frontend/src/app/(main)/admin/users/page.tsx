import { cookies } from "next/headers";
import AdminUsersPanel from "../../../../components/Admin/AdminUsersPanel";
import { fetchSitesListFromApi } from "../../../../lib/api";

const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

type AdminUser = {
  id: string;
  username: string;
  role: "ADMIN" | "CLIENT" | "SITE";
  clientKey: string | null;
  siteId: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

async function fetchUsers(): Promise<AdminUser[]> {
  const token = cookies().get("pmcs_token")?.value;
  if (!token) return [];
  const res = await fetch(`${apiBase}/admin/users`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { users?: AdminUser[] };
  return data.users ?? [];
}

export default async function AdminUsersPage() {
  const [users, sites] = await Promise.all([
    fetchUsers(),
    fetchSitesListFromApi().catch(() => []),
  ]);

  return (
    <main className="admin-iccid-page">
      <div className="admin-iccid-header">
        <h1 className="admin-iccid-title">유저 관리</h1>
        <p className="admin-iccid-sub">
          관리자 전용 · 건설사 / 현장 담당자 계정 생성 및 관리
        </p>
      </div>
      <AdminUsersPanel initialUsers={users} sites={sites} />
    </main>
  );
}
