import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../prisma/generated/client/client.js";

/**
 * DB-backed Settings-tab flag (`Installation.webSettingsActive`).
 *
 * Survives process restarts and multi-instance deploys (Railway).
 * Heartbeat TTL (~2.5 min) clears stale true when the browser dies without stop.
 *
 * Do NOT expose as webDetailActive — HMI contract uses webSettingsActive only.
 */

/** How long a settings-tab session stays valid without a heartbeat (ms). */
export const SETTINGS_TTL_MS = 150_000; // 2.5 minutes

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString:
      process.env.DATABASE_URL ?? "postgresql://pmcs:pmcs@localhost:5432/pmcs",
  }),
});

/** Register or refresh Settings-tab session. Call on enter + heartbeat. */
export async function startViewing(
  installationId: string,
  _userId?: string,
): Promise<void> {
  const now = new Date();
  await prisma.installation.updateMany({
    where: { id: installationId },
    data: {
      webSettingsActive: true,
      webSettingsHeartbeatAt: now,
    },
  });
}

/** Clear Settings-tab session. Call on leave / unmount / logout. */
export async function stopViewing(
  installationId: string,
  _userId?: string,
): Promise<void> {
  await prisma.installation.updateMany({
    where: { id: installationId },
    data: {
      webSettingsActive: false,
      webSettingsHeartbeatAt: null,
    },
  });
}

/**
 * True if Settings tab is active and heartbeat is within TTL.
 * Stale rows are cleared lazily.
 */
export async function isWebSettingsActive(
  installationId: string,
): Promise<boolean> {
  if (!installationId) return false;
  const row = await prisma.installation.findUnique({
    where: { id: installationId },
    select: {
      webSettingsActive: true,
      webSettingsHeartbeatAt: true,
    },
  });
  if (!row?.webSettingsActive) return false;
  const hb = row.webSettingsHeartbeatAt;
  if (!hb) {
    await prisma.installation.updateMany({
      where: { id: installationId },
      data: { webSettingsActive: false },
    });
    return false;
  }
  if (Date.now() - hb.getTime() > SETTINGS_TTL_MS) {
    await prisma.installation.updateMany({
      where: { id: installationId },
      data: {
        webSettingsActive: false,
        webSettingsHeartbeatAt: null,
      },
    });
    return false;
  }
  return true;
}

/** Alias kept for call sites that used the old in-memory API. */
export async function hasActiveViewers(
  installationId: string,
): Promise<boolean> {
  return isWebSettingsActive(installationId);
}

export async function getActiveViewerCount(
  installationId: string,
): Promise<number> {
  return (await isWebSettingsActive(installationId)) ? 1 : 0;
}
