"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isUnacked,
  sortServerAlarms,
  type MaintenanceItem,
  type ServerAlarm,
} from "../lib/serverAlarms";

export type AckOutcome = { ok: true } | { ok: false; message: string };

/**
 * 서버 알람 목록 (GET /api/alarms). `refreshKey` 가 바뀔 때마다 다시 읽는다
 * (대시보드 30초 갱신·장비 수신 이벤트와 같은 주기).
 */
export function useServerAlarms(refreshKey: number) {
  const [alarms, setAlarms] = useState<ServerAlarm[]>([]);
  const [maintenance, setMaintenanceList] = useState<MaintenanceItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seqRef = useRef(0);

  const reload = useCallback(async () => {
    const seq = ++seqRef.current;
    try {
      const res = await fetch("/api/alarms", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        alarms?: ServerAlarm[];
        maintenance?: MaintenanceItem[];
      };
      if (seq !== seqRef.current) return; // 더 늦게 시작한 요청이 이미 반영됨
      setAlarms(sortServerAlarms(data.alarms ?? []));
      setMaintenanceList(data.maintenance ?? []);
      setError(null);
    } catch {
      if (seq !== seqRef.current) return;
      setError("알람 목록을 불러오지 못했습니다.");
    } finally {
      if (seq === seqRef.current) setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  const ack = useCallback(
    async (id: number, note: string): Promise<AckOutcome> => {
      let res: Response;
      try {
        res = await fetch(`/api/alarms/${id}/ack`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: note.trim() || null }),
        });
      } catch {
        return { ok: false, message: "서버에 연결할 수 없습니다." };
      }
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        alarm?: ServerAlarm;
      };
      // 409(이미 확인됨)도 최신 상태로 반영한다
      if (data.alarm) {
        const updated = data.alarm;
        setAlarms((prev) =>
          sortServerAlarms(
            prev
              .map((a) => (a.id === updated.id ? updated : a))
              .filter((a) => a.state !== "cleared_acked"),
          ),
        );
      }
      if (res.ok) return { ok: true };
      return { ok: false, message: data.message ?? `확인 실패 (HTTP ${res.status})` };
    },
    [],
  );

  /** 여러 건 한 번에 확인 (화면에 보인 미확인 알람 id 들) */
  const ackMany = useCallback(
    async (ids: number[], note: string): Promise<AckOutcome & { acked?: number }> => {
      let res: Response;
      try {
        res = await fetch("/api/alarms/ack-bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, note: note.trim() || null }),
        });
      } catch {
        return { ok: false, message: "서버에 연결할 수 없습니다." };
      }
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        acked?: number;
        alarms?: ServerAlarm[];
      };
      if (!res.ok) return { ok: false, message: data.message ?? `확인 실패 (HTTP ${res.status})` };
      const byId = new Map((data.alarms ?? []).map((a) => [a.id, a]));
      setAlarms((prev) =>
        sortServerAlarms(
          prev.map((a) => byId.get(a.id) ?? a).filter((a) => a.state !== "cleared_acked"),
        ),
      );
      // 다른 사람이 먼저 확인한 건 등은 서버 상태로 다시 맞춘다
      void reload();
      return { ok: true, acked: data.acked ?? 0 };
    },
    [reload],
  );

  /** 점검 중 설정 (days=null: 해제할 때까지) */
  const setMaintenance = useCallback(
    async (installationId: string, days: number | null, note: string): Promise<AckOutcome> => {
      let res: Response;
      try {
        res = await fetch(`/api/alarms/maintenance/${encodeURIComponent(installationId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ days, note: note.trim() || null }),
        });
      } catch {
        return { ok: false, message: "서버에 연결할 수 없습니다." };
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        return { ok: false, message: data.message ?? `설정 실패 (HTTP ${res.status})` };
      }
      await reload();
      return { ok: true };
    },
    [reload],
  );

  const clearMaintenance = useCallback(
    async (installationId: string): Promise<AckOutcome> => {
      let res: Response;
      try {
        res = await fetch(`/api/alarms/maintenance/${encodeURIComponent(installationId)}`, {
          method: "DELETE",
        });
      } catch {
        return { ok: false, message: "서버에 연결할 수 없습니다." };
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        return { ok: false, message: data.message ?? `해제 실패 (HTTP ${res.status})` };
      }
      await reload();
      return { ok: true };
    },
    [reload],
  );

  // 점검 중 설비의 알람은 따로 묶는다 — 띠·미확인 수·알람음에서 빠진다
  const { visible, shelved } = useMemo(() => {
    const inMaint = new Set(maintenance.map((m) => m.installationId));
    return {
      visible: alarms.filter((a) => !inMaint.has(a.installationId)),
      shelved: alarms.filter((a) => inMaint.has(a.installationId)),
    };
  }, [alarms, maintenance]);

  const unackedCount = visible.filter(isUnacked).length;

  return {
    alarms: visible,
    shelved,
    maintenance,
    loaded,
    error,
    unackedCount,
    reload,
    ack,
    ackMany,
    setMaintenance,
    clearMaintenance,
  };
}
