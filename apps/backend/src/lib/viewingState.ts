import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../prisma/generated/client/client.js";

/**
 * DB-backed admin remote window (`Installation.adminSessionActive`).
 *
 * HMI reads `adminSessionActive` from POST /receiver ACK and only then polls
 * GET /receiver/commands (~1 min). Every true row is billed HMI traffic, so the
 * window opens only on an explicit admin action (「원격 연결 열기」 or any
 * command) and closes by itself REMOTE_WINDOW_MS later. Each action re-opens
 * it from that moment. `adminSessionHeartbeatAt` stores the last open time.
 * `webSettingsActive` is legacy and must stay false (HMI ignores it).
 */

/** Window must cover one telemetry cycle (~10 min) plus a few polls. */
export const REMOTE_WINDOW_MS =
  Number(process.env.REMOTE_WINDOW_SECONDS ?? 900) * 1000;

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString:
      process.env.DATABASE_URL ?? "postgresql://pmcs:pmcs@localhost:5432/pmcs",
  }),
});

/** Open (or extend) the remote window from now. Returns when it closes. */
export async function openRemoteWindow(
  installationId: string,
  userId?: string,
): Promise<Date> {
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
  return new Date(now.getTime() + REMOTE_WINDOW_MS);
}

/** Close the window for one installation now. */
export async function stopAdminSession(installationId: string): Promise<void> {
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

/** Close every window opened by a user. */
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
 * When the open window closes, or null if closed. Expired rows are cleared
 * lazily.
 */
export async function getRemoteWindowUntil(
  installationId: string,
): Promise<Date | null> {
  if (!installationId) return null;
  const row = await prisma.installation.findUnique({
    where: { id: installationId },
    select: {
      adminSessionActive: true,
      adminSessionHeartbeatAt: true,
    },
  });
  if (!row?.adminSessionActive) return null;
  const openedAt = row.adminSessionHeartbeatAt;
  const until = openedAt
    ? new Date(openedAt.getTime() + REMOTE_WINDOW_MS)
    : null;
  if (!until || until.getTime() <= Date.now()) {
    // Match openedAt so a concurrent re-open is not wiped.
    await prisma.installation.updateMany({
      where: { id: installationId, adminSessionHeartbeatAt: openedAt },
      data: {
        adminSessionActive: false,
        adminSessionHeartbeatAt: null,
        adminSessionUserId: null,
      },
    });
    return null;
  }
  return until;
}

export async function isAdminSessionActive(
  installationId: string,
): Promise<boolean> {
  return (await getRemoteWindowUntil(installationId)) !== null;
}

/** @deprecated Legacy webSettingsActive — always false for HMI contract. */
export async function isWebSettingsActive(
  _installationId: string,
): Promise<boolean> {
  return false;
}
