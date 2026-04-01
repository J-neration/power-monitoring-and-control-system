import { cookies } from "next/headers";

export type SessionUser = {
  username: string;
  role: "ADMIN" | "CLIENT" | "SITE" | string;
  clientKey?: string;
  siteId?: string;
};

/** 서버 컴포넌트용: pmcs_token으로 /auth/me 조회 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = cookies().get("pmcs_token")?.value;
  if (!token) return null;

  const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
  try {
    const res = await fetch(`${apiBase}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { user: SessionUser };
    return data.user ?? null;
  } catch {
    return null;
  }
}
