import { PrismaClient } from "../../prisma/generated/client/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

const CLIENT_KEY_RE = /^[a-z][a-z0-9_-]*$/;
const USER_ROLES = ["ADMIN", "CLIENT", "SITE"] as const;

export type ClientOptionRow = {
  id: string;
  key: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type RoleOptionRow = {
  key: string;
  label: string;
  description: string | null;
  sortOrder: number;
  isAssignable: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const DEFAULT_CLIENTS: { key: string; label: string; sortOrder: number }[] = [
  { key: "lotte", label: "롯데건설", sortOrder: 1 },
  { key: "gs", label: "GS건설", sortOrder: 2 },
  { key: "hyundai", label: "현대건설", sortOrder: 3 },
  { key: "posco", label: "포스코이앤씨", sortOrder: 4 },
  { key: "prime", label: "프라임솔루션", sortOrder: 5 },
  { key: "datacenter", label: "데이터센터", sortOrder: 6 },
  { key: "coupang", label: "쿠팡", sortOrder: 7 },
];

const DEFAULT_ROLES: {
  key: (typeof USER_ROLES)[number];
  label: string;
  description: string;
  sortOrder: number;
  isAssignable: boolean;
}[] = [
  {
    key: "CLIENT",
    label: "건설사 담당자",
    description: "지정 건설사 소속 현장 전체 조회",
    sortOrder: 1,
    isAssignable: true,
  },
  {
    key: "SITE",
    label: "현장 관리자",
    description: "지정 현장만 조회",
    sortOrder: 2,
    isAssignable: true,
  },
  {
    key: "ADMIN",
    label: "관리자",
    description: "전체 시스템·계정 관리",
    sortOrder: 3,
    isAssignable: true,
  },
];

function isMissingRegistryTable(err: unknown) {
  const e = err as { code?: string; message?: string };
  return (
    e?.code === "P2021" ||
    (typeof e?.message === "string" &&
      (e.message.includes("ClientOption") ||
        e.message.includes("RoleOption") ||
        e.message.includes("does not exist")))
  );
}

function isRegistryUnavailable(err: unknown) {
  const e = err as { code?: string };
  return (
    isMissingRegistryTable(err) ||
    e?.code === "P1000" ||
    e?.code === "P1001" ||
    e?.code === "P1017"
  );
}

function fallbackClients(includeInactive?: boolean) {
  const now = new Date();
  return DEFAULT_CLIENTS.map((c) => ({
    id: `default-${c.key}`,
    key: c.key,
    label: c.label,
    sortOrder: c.sortOrder,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  })).filter((c) => includeInactive || c.isActive);
}

function fallbackRoles() {
  const now = new Date();
  return DEFAULT_ROLES.map((r) => ({
    ...r,
    createdAt: now,
    updatedAt: now,
  }));
}

async function ensureDefaults() {
  try {
    for (const c of DEFAULT_CLIENTS) {
      await prisma.clientOption.upsert({
        where: { key: c.key },
        update: {},
        create: c,
      });
    }
    for (const r of DEFAULT_ROLES) {
      await prisma.roleOption.upsert({
        where: { key: r.key },
        update: {},
        create: r,
      });
    }
    return true;
  } catch (err) {
    if (isRegistryUnavailable(err)) {
      console.warn(
        "[registry] ClientOption/RoleOption을 사용할 수 없습니다. DB 연결·마이그레이션을 확인하세요.",
      );
      return false;
    }
    throw err;
  }
}

export const registryService = {
  ensureDefaults,

  listClients: async (opts?: { includeInactive?: boolean }) => {
    const ready = await ensureDefaults();
    if (!ready) {
      return {
        rows: fallbackClients(opts?.includeInactive),
        source: "fallback" as const,
      };
    }
    try {
      const rows = await prisma.clientOption.findMany({
        where: opts?.includeInactive ? undefined : { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      });
      return { rows, source: "db" as const };
    } catch (err) {
      if (!isMissingRegistryTable(err)) throw err;
      return {
        rows: fallbackClients(opts?.includeInactive),
        source: "fallback" as const,
      };
    }
  },

  createClient: async (data: {
    key: string;
    label: string;
    sortOrder?: number;
  }) => {
    const ready = await ensureDefaults();
    if (!ready) throw new Error("REGISTRY_NOT_READY");

    const key = data.key.trim().toLowerCase();
    const label = data.label.trim();
    if (!CLIENT_KEY_RE.test(key)) {
      throw new Error("INVALID_KEY");
    }
    if (!label) {
      throw new Error("INVALID_LABEL");
    }
    const maxOrder = await prisma.clientOption.aggregate({
      _max: { sortOrder: true },
    });
    return prisma.clientOption.create({
      data: {
        key,
        label,
        sortOrder: data.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
      },
    });
  },

  updateClient: async (
    id: string,
    data: {
      label?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) => {
    const label = data.label?.trim();
    if (label !== undefined && !label) {
      throw new Error("INVALID_LABEL");
    }
    return prisma.clientOption.update({
      where: { id },
      data: {
        ...(label !== undefined ? { label } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
  },

  deleteClient: async (id: string) => {
    const row = await prisma.clientOption.findUnique({ where: { id } });
    if (!row) throw new Error("NOT_FOUND");

    const [siteCount, userCount] = await Promise.all([
      prisma.site.count({ where: { client: row.key } }),
      prisma.user.count({ where: { clientKey: row.key } }),
    ]);
    if (siteCount > 0 || userCount > 0) {
      throw new Error("IN_USE");
    }
    await prisma.clientOption.delete({ where: { id } });
  },

  isActiveClientKey: async (key: string) => {
    const { rows } = await registryService.listClients();
    return rows.some((r) => r.key === key && r.isActive);
  },

  listRoles: async () => {
    const ready = await ensureDefaults();
    if (!ready) {
      return { rows: fallbackRoles(), source: "fallback" as const };
    }
    try {
      const rows = await prisma.roleOption.findMany({
        orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
      });
      return { rows, source: "db" as const };
    } catch (err) {
      if (!isMissingRegistryTable(err)) throw err;
      return { rows: fallbackRoles(), source: "fallback" as const };
    }
  },

  isAssignableRole: async (key: string) => {
    const { rows } = await registryService.listRoles();
    return rows.some((r) => r.key === key && r.isAssignable);
  },

  updateRole: async (
    key: string,
    data: {
      label?: string;
      description?: string | null;
      sortOrder?: number;
      isAssignable?: boolean;
    },
  ) => {
    const ready = await ensureDefaults();
    if (!ready) throw new Error("REGISTRY_NOT_READY");

    if (!USER_ROLES.includes(key as (typeof USER_ROLES)[number])) {
      throw new Error("INVALID_ROLE");
    }
    const label = data.label?.trim();
    if (label !== undefined && !label) {
      throw new Error("INVALID_LABEL");
    }
    return prisma.roleOption.update({
      where: { key },
      data: {
        ...(label !== undefined ? { label } : {}),
        ...(data.description !== undefined
          ? { description: data.description }
          : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.isAssignable !== undefined
          ? { isAssignable: data.isAssignable }
          : {}),
      },
    });
  },

  clientLabelsMap: async () => {
    const { rows } = await registryService.listClients();
    return Object.fromEntries(rows.map((r) => [r.key, r.label]));
  },
};
