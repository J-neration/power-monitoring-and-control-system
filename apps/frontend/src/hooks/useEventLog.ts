"use client";

import { useEffect, useRef, useState } from "react";
import type { Site } from "../types/site";
import {
  ingestSiteStatuses,
  loadEventLog,
  seedStatusSnapshot,
  type EventLogEntry,
} from "../lib/eventLog";

export function useEventLog(sites: Site[]) {
  const [entries, setEntries] = useState<EventLogEntry[]>([]);
  const seeded = useRef(false);

  useEffect(() => {
    if (!seeded.current) {
      seedStatusSnapshot(sites);
      seeded.current = true;
      setEntries(loadEventLog());
      return;
    }
    setEntries(ingestSiteStatuses(sites));
  }, [sites]);

  return entries;
}
