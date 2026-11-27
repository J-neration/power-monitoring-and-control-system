import { prisma } from "./prisma.js";
import { devicePostPeriodMin, remoteReachMs } from "./remoteReach.js";

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

/**
 * Window length for one installation: REMOTE_WINDOW_MS, or longer for a device
 * on a 30/60-min telemetry period (the HMI learns the window is open only from
 * the next telemetry ACK). lib/remoteReach.ts
 */
export async function remoteWindowMsFor(installationId: string): Promise<number> {
  return Math.max(REMOTE_WINDOW_MS, remoteReachMs(await devicePostPeriodMin(installationId)));
}

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
  return new Date(now.getTime() + (await remoteWindowMsFor(installationId)));
}

/**
 * The HMI is polling: it already knows the window is open, so the long window
 * of a 30/60-min device is no longer needed. Shorten it to REMOTE_WINDOW_MS from
 * now (never lengthen it), so the HMI stops its 1-min polls sooner.
 * The schema stores only the open time, so the open time is moved back.
 */
export async function shortenRemoteWindowAfterPoll(installationId: string): Promise<void> {
  if (!installationId) return;
  const row = await prisma.installation.findUnique({
    where: { id: installationId },
    select: { adminSessionActive: true, adminSessionHeartbeatAt: true },
  });
  const openedAt = row?.adminSessionHeartbeatAt;
  if (!row?.adminSessionActive || !openedAt) return;
  const windowMs = await remoteWindowMsFor(installationId);
  if (windowMs <= REMOTE_WINDOW_MS) return;
  const now = Date.now();
  if (openedAt.getTime() + windowMs <= now + REMOTE_WINDOW_MS) return;
  await prisma.installation.updateMany({
    // Match openedAt so a concurrent re-open is not overwritten.
    where: { id: installationId, adminSessionHeartbeatAt: openedAt },
    data: { adminSessionHeartbeatAt: new Date(now + REMOTE_WINDOW_MS - windowMs) },
  });
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
    ? new Date(openedAt.getTime() + (await remoteWindowMsFor(installationId)))
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
