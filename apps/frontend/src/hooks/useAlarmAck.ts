"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AlarmItem } from "../lib/alarms";
import {
  ackAlarm,
  ackAllAlarms,
  countUnacked,
  isAlarmAcked,
  loadAckStore,
  type AckStore,
} from "../lib/alarmAck";
import {
  isAlarmSoundEnabled,
  playAlarmBeep,
  setAlarmSoundEnabled,
} from "../lib/alarmSound";

export function useAlarmAck(alarms: AlarmItem[]) {
  const [ackStore, setAckStore] = useState<AckStore>({});
  const [soundOn, setSoundOn] = useState(true);
  const prevUnackedRef = useRef<number | null>(null);

  useEffect(() => {
    setAckStore(loadAckStore());
    setSoundOn(isAlarmSoundEnabled());
  }, []);

  const alarmKeys = alarms.map((a) => a.ackKey);
  const unackedCount = countUnacked(ackStore, alarmKeys);

  useEffect(() => {
    if (prevUnackedRef.current === null) {
      prevUnackedRef.current = unackedCount;
      return;
    }
    if (unackedCount > prevUnackedRef.current) {
      playAlarmBeep();
    }
    prevUnackedRef.current = unackedCount;
  }, [unackedCount]);

  const ackOne = useCallback((key: string) => {
    setAckStore(ackAlarm(key));
  }, []);

  const ackAll = useCallback(() => {
    setAckStore(ackAllAlarms(alarmKeys));
  }, [alarmKeys]);

  const toggleSound = useCallback(() => {
    setSoundOn((prev) => {
      const next = !prev;
      setAlarmSoundEnabled(next);
      return next;
    });
  }, []);

  const isAcked = useCallback(
    (key: string) => isAlarmAcked(ackStore, key),
    [ackStore],
  );

  return {
    ackStore,
    unackedCount,
    soundOn,
    ackOne,
    ackAll,
    toggleSound,
    isAcked,
  };
}
