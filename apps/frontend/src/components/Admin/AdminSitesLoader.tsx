"use client";

import { useEffect, useState } from "react";
import AdminSitesPanel from "./AdminSitesPanel";
import type { ClientOptionFromApi, SiteListFromApi } from "../../types/admin";
import {
  DEFAULT_CLIENT_OPTIONS,
  withRegistryDefaults,
} from "../../data/registryDefaults";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; sites: SiteListFromApi[]; clients: ClientOptionFromApi[] }
  | { status: "error"; message: string };

export default function AdminSitesLoader() {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sitesRes, clientsRes] = await Promise.all([
          fetch("/api/admin/sites"),
          fetch("/api/admin/registry/clients?includeInactive=1"),
        ]);
        const sitesData = (await sitesRes.json().catch(() => ({}))) as {
          sites?: SiteListFromApi[];
          message?: string;
        };
        const clientsData = (await clientsRes.json().catch(() => ({}))) as {
          clients?: ClientOptionFromApi[];
        };
        if (cancelled) return;
        if (!sitesRes.ok) {
          setLoad({
            status: "error",
            message: sitesData.message ?? `현장 목록 오류 (${sitesRes.status})`,
          });
          return;
        }
        setLoad({
          status: "ready",
          sites: sitesData.sites ?? [],
          clients: withRegistryDefaults(
            clientsData.clients ?? [],
            DEFAULT_CLIENT_OPTIONS,
          ),
        });
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
    return (
      <div className="admin-iccid-empty" aria-busy="true">
        현장 목록 불러오는 중…
      </div>
    );
  }

  if (load.status === "error") {
    return (
      <div className="admin-iccid-empty" role="alert">
        {load.message}
      </div>
    );
  }

  return (
    <AdminSitesPanel
      initialSites={load.sites}
      clientOptions={load.clients}
    />
  );
}
