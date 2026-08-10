"use client";

import { useEffect, useState } from "react";
import AdminUsersPanel from "./AdminUsersPanel";
import type {
  ClientOptionFromApi,
  RoleOptionFromApi,
  SiteListFromApi,
} from "../../types/admin";
import {
  DEFAULT_CLIENT_OPTIONS,
  DEFAULT_ROLE_OPTIONS,
  withRegistryDefaults,
} from "../../data/registryDefaults";

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

type LoadState =
  | { status: "loading" }
  | {
      status: "ready";
      users: AdminUser[];
      sites: SiteListFromApi[];
      clients: ClientOptionFromApi[];
      roles: RoleOptionFromApi[];
    }
  | { status: "error"; message: string };

export default function AdminUsersLoader() {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [usersRes, sitesRes, clientsRes, rolesRes] = await Promise.all([
          fetch("/api/admin/users"),
          fetch("/api/admin/sites"),
          fetch("/api/admin/registry/clients?includeInactive=1"),
          fetch("/api/admin/registry/roles"),
        ]);
        const usersData = (await usersRes.json().catch(() => ({}))) as {
          users?: AdminUser[];
          message?: string;
        };
        const sitesData = (await sitesRes.json().catch(() => ({}))) as {
          sites?: SiteListFromApi[];
        };
        const clientsData = (await clientsRes.json().catch(() => ({}))) as {
          clients?: ClientOptionFromApi[];
        };
        const rolesData = (await rolesRes.json().catch(() => ({}))) as {
          roles?: RoleOptionFromApi[];
        };
        if (cancelled) return;
        if (!usersRes.ok) {
          setLoad({
            status: "error",
            message: usersData.message ?? `유저 목록 오류 (${usersRes.status})`,
          });
          return;
        }
        setLoad({
          status: "ready",
          users: usersData.users ?? [],
          sites: sitesData.sites ?? [],
          clients: withRegistryDefaults(
            clientsData.clients ?? [],
            DEFAULT_CLIENT_OPTIONS,
          ),
          roles: withRegistryDefaults(
            rolesData.roles ?? [],
            DEFAULT_ROLE_OPTIONS,
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
        계정 목록 불러오는 중…
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
    <AdminUsersPanel
      initialUsers={load.users}
      sites={load.sites}
      clientOptions={load.clients}
      roleOptions={load.roles}
    />
  );
}
