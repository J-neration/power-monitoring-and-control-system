import type { UserContext } from "../modules/auth/auth.types.js";
import { buildWatchFacts } from "../lib/watchFacts.js";
import { extractWatchAnomalies } from "../lib/watchAnomalies.js";
import { deviceService } from "./deviceService.js";
import { faultService } from "./faultService.js";

export const watchFactsService = {
  get: async (
    { id, hours = 24 }: { id: string; hours?: number },
    ctx: UserContext,
  ) => {
    const device = await deviceService.get({ id }, ctx);
    if (!device) return null;

    const clampedHours = Math.min(Math.max(hours, 1), 336);
    const readings = await deviceService.getReadings(
      { id, hours: clampedHours },
      ctx,
    );
    if (readings === null) return null;

    const facts = buildWatchFacts({
      installationId: id,
      hours: clampedHours,
      lastSeenAt: device.lastSeenAt,
      readings,
    });

    const faults = await faultService.getFaults({
      installationId: id,
      limit: 50,
    });
    const activeFaultCount = faults.filter((f) => f.active).length;

    return {
      facts,
      anomalies: extractWatchAnomalies(facts, { activeFaultCount }),
    };
  },
};
