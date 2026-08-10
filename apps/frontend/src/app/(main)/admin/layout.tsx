import type { ReactNode } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";

export const metadata: Metadata = { title: "관리자 패널" };
import { redirect } from "next/navigation";
import AdminNav from "../../../components/Admin/AdminNav";

const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

async function checkAdmin() {
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

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await checkAdmin();

  return (
    <div className="admin-shell">
      <AdminNav />
      <div className="admin-shell-content">{children}</div>
    </div>
  );
}
