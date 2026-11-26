"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isAlarmSoundEnabled,
  playAlarmBeep,
  setAlarmSoundEnabled,
} from "../lib/alarmSound";

/** 미확인 알람이 남아 있는 동안 반복 간격 */
export const ALARM_REPEAT_MS = 30_000;

/**
 * 관제 알람음 (서버 미확인 알람 기준).
 *   - 미확인 수가 늘면 바로 한 번 울린다.
 *   - 미확인이 하나라도 남아 있으면 30초마다 다시 울린다 — 확인(ack)해야 멈춘다.
 *   - 🔔/🔕 설정은 이 브라우저에만 저장된다 (관제 PC 마다 다르게).
 * 브라우저 정책상 페이지를 한 번도 클릭하지 않았으면 소리가 막힐 수 있다.
 */
export function useAlarmSound(unackedCount: number, loaded: boolean) {
  const [soundOn, setSoundOn] = useState(true);
  const prevRef = useRef<number | null>(null);

  useEffect(() => {
    setSoundOn(isAlarmSoundEnabled());
    // 예전 브라우저 저장 확인 기록 정리 (확인은 이제 서버에 남는다)
    try {
      localStorage.removeItem("pmcs_alarm_ack_v1");
    } catch {
      // 저장소 차단 환경
    }
  }, []);

  // 늘었을 때 즉시
  useEffect(() => {
    if (!loaded) return;
    const prev = prevRef.current;
    prevRef.current = unackedCount;
    if (prev !== null && unackedCount > prev) playAlarmBeep();
  }, [unackedCount, loaded]);

  // 남아 있는 동안 반복
  useEffect(() => {
    if (!loaded || !soundOn || unackedCount === 0) return;
    const timer = setInterval(() => playAlarmBeep(), ALARM_REPEAT_MS);
    return () => clearInterval(timer);
  }, [loaded, soundOn, unackedCount]);

  const toggleSound = useCallback(() => {
    setSoundOn((prev) => {
      const next = !prev;
      setAlarmSoundEnabled(next);
      return next;
    });
  }, []);

  return { soundOn, toggleSound };
}
