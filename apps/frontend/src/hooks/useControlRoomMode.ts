"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Site } from "../types/site";
import { sortSitesByPriority } from "../lib/deviceStatus";

export type DashboardLayout = "default" | "map" | "alarm";

const ROTATE_SEC = 15;

export function useControlRoomMode(
  sites: Site[],
  selectedSiteId: string,
  onSelectSite: (siteId: string) => void,
) {
  const [layout, setLayout] = useState<DashboardLayout>("default");
  const [controlRoom, setControlRoom] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);

  const rotateTargets = useMemo(
    () => sortSitesByPriority(sites).map((s) => s.id),
    [sites],
  );

  const enterControlRoom = useCallback(async () => {
    setControlRoom(true);
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // fullscreen not available — still apply layout chrome hiding
    }
  }, []);

  const exitControlRoom = useCallback(async () => {
    setControlRoom(false);
    setAutoRotate(false);
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // ignore
    }
  }, []);

  const toggleControlRoom = useCallback(() => {
    if (controlRoom) void exitControlRoom();
    else void enterControlRoom();
  }, [controlRoom, enterControlRoom, exitControlRoom]);

  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) {
        setControlRoom(false);
        setAutoRotate(false);
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(() => {
    if (!autoRotate || rotateTargets.length === 0) return;
    const id = setInterval(() => {
      const idx = rotateTargets.indexOf(selectedSiteId);
      const next = rotateTargets[(idx + 1) % rotateTargets.length];
      onSelectSite(next);
    }, ROTATE_SEC * 1000);
    return () => clearInterval(id);
  }, [autoRotate, rotateTargets, selectedSiteId, onSelectSite]);

  return {
    layout,
    setLayout,
    controlRoom,
    autoRotate,
    setAutoRotate,
    toggleControlRoom,
    rotateSec: ROTATE_SEC,
  };
}
