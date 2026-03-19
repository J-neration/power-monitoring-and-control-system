import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import LiveClock from "../../components/Dashboard/LiveClock";
import LogoutButton from "../../components/LogoutButton";
import { CLIENT_LABELS } from "../../data/clients";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "관리자",
  CLIENT: "건설사",
  SITE: "현장",
};

type AuthUser = {
  username: string;
  role: string;
  clientKey?: string;
  siteId?: string;
};

async function getCurrentUser(): Promise<AuthUser | null> {
  const token = cookies().get("pmcs_token")?.value;
  if (!token) return null;

  const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
  try {
    const res = await fetch(`${apiBase}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.user as AuthUser;
  } catch {
    return null;
  }
}

async function getSiteName(
  siteId: string,
  token: string,
): Promise<string | null> {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
  try {
    const res = await fetch(`${apiBase}/sites/${encodeURIComponent(siteId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.site?.name as string) ?? null;
  } catch {
    return null;
  }
}

function resolveDisplayName(user: AuthUser, siteName: string | null): string {
  if (user.role === "CLIENT" && user.clientKey) {
    return CLIENT_LABELS[user.clientKey] ?? user.clientKey;
  }
  if (user.role === "SITE") {
    return siteName ?? user.siteId ?? user.username;
  }
  // ADMIN
  return user.username;
}

export default async function MainLayout({
  children,
}: {
  children: ReactNode;
}) {
  const token = cookies().get("pmcs_token")?.value;
  const user = await getCurrentUser();

  let siteName: string | null = null;
  if (user?.role === "SITE" && user.siteId && token) {
    siteName = await getSiteName(user.siteId, token);
  }

  const displayName = user ? resolveDisplayName(user, siteName) : null;

  return (
    <>
      <header className="global-header">
        <Link href="/" className="global-logo">
          <Image
            src="/logo.png"
            alt="PrimeSolution"
            width={32}
            height={15}
            priority
          />
          <span className="global-logo-text">PRIMESOLUTION</span>
          <span className="global-logo-text-beta">BETA</span>
        </Link>

        <div className="global-header-right">
          <LiveClock />
          {user && (
            <div className="header-user-info">
              <span className="header-user-role">
                {ROLE_LABEL[user.role] ?? user.role}
              </span>
              <span className="header-username">{displayName}</span>
            </div>
          )}
          <LogoutButton />
        </div>
      </header>
      <div className="global-content">{children}</div>
    </>
  );
}
