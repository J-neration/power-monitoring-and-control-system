"use client";

import { useEffect, useState } from "react";
import AdminLoadingState from "./AdminLoadingState";
import AdminInstallationIccidPanel from "./AdminInstallationIccidPanel";
import type { SiteListFromApi } from "../../types/admin";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; sites: SiteListFromApi[] }
  | { status: "error"; message: string };

export default function AdminIccidLoader() {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/sites");
        const data = (await res.json().catch(() => ({}))) as {
          sites?: SiteListFromApi[];
          message?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setLoad({
            status: "error",
            message: data.message ?? `현장 목록 오류 (${res.status})`,
          });
          return;
        }
        setLoad({ status: "ready", sites: data.sites ?? [] });
      } catch {
        if (!cancelled) {
          setLoad({ status: "error", message: "네트워크 오류" });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (load.status === "loading") {
    return <AdminLoadingState label="ICCID 목록 불러오는 중…" />;
  }

  if (load.status === "error") {
    return (
      <div className="admin-iccid-empty" role="alert">
        {load.message}
      </div>
    );
  }

  return <AdminInstallationIccidPanel sites={load.sites} />;
}
