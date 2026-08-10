import type { ReactNode } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminNav from "../../../components/Admin/AdminNav";

export const metadata: Metadata = { title: "관리자 패널" };

const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
const AUTH_TIMEOUT_MS = 8_000;

async function checkAdmin() {
  const token = cookies().get("pmcs_token")?.value;
  if (!token) redirect("/login");

  let res: Response;
  try {
    res = await fetch(`${apiBase}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch {
    // 백엔드 일시 장애 시 로그인으로 보내지 말고 레이아웃은 통과 —
    // 페이지 클라이언트 fetch가 재시도/에러 UI를 담당.
    // (타임아웃 중 redirect는 Netlify 스트림에서 Connection closed를 유발할 수 있음)
    return;
  }

  if (res.status === 401) redirect("/login");
  if (!res.ok) return;

  const data = (await res.json()) as { user?: { role?: string } };
  if (data.user?.role && data.user.role !== "ADMIN") redirect("/");
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
