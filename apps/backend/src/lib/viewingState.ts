import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../prisma/generated/client/client.js";

/**
 * DB-backed admin remote session (`Installation.adminSessionActive`).
 *
 * HMI reads `adminSessionActive` from POST /receiver ACK and only then polls
 * GET /receiver/commands (~1 min). Survives multi-instance deploys (Railway).
 *
 * Heartbeat TTL clears stale true when the browser dies without stop.
 * `webSettingsActive` is legacy and must stay false (HMI ignores it).
 */

/** How long an admin session stays valid without a heartbeat (ms). */
export const ADMIN_SESSION_TTL_MS = 90_000; // 90s — leave page → false without logout

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString:
      process.env.DATABASE_URL ?? "postgresql://pmcs:pmcs@localhost:5432/pmcs",
  }),
});

/** Register or refresh admin remote session. Call on device-page enter + heartbeat. */
export async function startAdminSession(
  installationId: string,
  userId?: string,
): Promise<void> {
  const now = new Date();
  await prisma.installation.updateMany({
    where: { id: installationId },
    data: {
      adminSessionActive: true,
      adminSessionHeartbeatAt: now,
      ...(userId ? { adminSessionUserId: userId } : {}),
      // Keep legacy flag off — never reintroduce periodic settings upload
      webSettingsActive: false,
      webSettingsHeartbeatAt: null,
    },
  });
}

/** Clear admin session for one installation. Call on leave / unmount. */
export async function stopAdminSession(
  installationId: string,
  _userId?: string,
): Promise<void> {
  await prisma.installation.updateMany({
    where: { id: installationId },
    data: {
      adminSessionActive: false,
      adminSessionHeartbeatAt: null,
      adminSessionUserId: null,
      webSettingsActive: false,
      webSettingsHeartbeatAt: null,
    },
  });
}

/** Clear all admin sessions for a user (logout). */
export async function stopAllAdminSessionsForUser(
  userId: string,
): Promise<number> {
  if (!userId) return 0;
  const result = await prisma.installation.updateMany({
    where: {
      adminSessionUserId: userId,
      adminSessionActive: true,
    },
    data: {
      adminSessionActive: false,
      adminSessionHeartbeatAt: null,
      adminSessionUserId: null,
      webSettingsActive: false,
      webSettingsHeartbeatAt: null,
    },
  });
  return result.count;
}

/**
 * True if an admin remote session is active and heartbeat is within TTL.
 * Stale rows are cleared lazily.
 */
export async function isAdminSessionActive(
  installationId: string,
): Promise<boolean> {
  if (!installationId) return false;
  const row = await prisma.installation.findUnique({
    where: { id: installationId },
    select: {
      adminSessionActive: true,
      adminSessionHeartbeatAt: true,
    },
  });
  if (!row?.adminSessionActive) return false;
  const hb = row.adminSessionHeartbeatAt;
  if (!hb) {
    await prisma.installation.updateMany({
      where: { id: installationId },
      data: {
        adminSessionActive: false,
        adminSessionUserId: null,
      },
    });
    return false;
  }
  if (Date.now() - hb.getTime() > ADMIN_SESSION_TTL_MS) {
    await prisma.installation.updateMany({
      where: { id: installationId },
      data: {
        adminSessionActive: false,
        adminSessionHeartbeatAt: null,
        adminSessionUserId: null,
      },
    });
    return false;
  }
  return true;
}

// ─── Legacy aliases (viewing/* routes & old call sites) ───────────────

/** @deprecated Use startAdminSession */
export async function startViewing(
  installationId: string,
  userId?: string,
): Promise<void> {
  return startAdminSession(installationId, userId);
}

/** @deprecated Use stopAdminSession */
export async function stopViewing(
  installationId: string,
  userId?: string,
): Promise<void> {
  return stopAdminSession(installationId, userId);
}

/** @deprecated Legacy webSettingsActive — always false for HMI contract. */
export async function isWebSettingsActive(
  _installationId: string,
): Promise<boolean> {
  return false;
}

export async function hasActiveViewers(
  installationId: string,
): Promise<boolean> {
  return isAdminSessionActive(installationId);
}

export async function getActiveViewerCount(
  installationId: string,
): Promise<number> {
  return (await isAdminSessionActive(installationId)) ? 1 : 0;
}

/** Legacy export name kept for imports. */
export const SETTINGS_TTL_MS = ADMIN_SESSION_TTL_MS;
