"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isModuleType,
  moduleTypeLabel,
  type DeviceSettingsSnapshot,
  type ModuleType,
} from "../lib/deviceSettingsFields";
import { useWsEvents } from "../hooks/useWsEvents";

type Props = {
  installationId: string;
  requestedBy?: string;
};

type Meta =
  | { status: "loading" }
  | { status: "empty" }
  | {
      status: "ready";
      moduleType: ModuleType;
      updatedAt: string;
    };

type Banner = {
  tone: "pending" | "ok" | "err";
  title: string;
  detail?: string;
};

function formatSnapParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }),
    time: d.toLocaleTimeString("ko-KR", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }),
  };
}

function formatRelative(iso: string, nowMs: number): string {
  const diff = Math.max(0, nowMs - new Date(iso).getTime());
  const sec = Math.floor(diff / 1000);
  if (sec < 15) return "방금";
  if (sec < 60) return `${sec}초 전`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

/**
 * Settings-tab sync strip: refreshSettings + module type / snapshot time.
 * Placed under the help note so the action and freshness are always visible.
 */
export default function DeviceSettingsSyncBar({
  installationId,
  requestedBy,
}: Props) {
  const [meta, setMeta] = useState<Meta>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [pendingCommandId, setPendingCommandId] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const pendingRef = useRef<string | null>(null);
  /** Snapshot updatedAt at the moment refreshSettings was requested (baseline). */
  const baselineAtCommandRef = useRef<string | null>(null);
  /** Latest displayed snapshot time (may advance before ACK arrives). */
  const sinceUpdatedAtRef = useRef<string | null>(null);
  /** True from request until sync settles (ok/err). */
  const refreshInFlightRef = useRef(false);
  /** True once this refresh cycle already reached sync-ok. */
  const settledOkRef = useRef(false);
  /** Bumps to invalidate in-flight syncAfterAck loops. */
  const syncTokenRef = useRef(0);
  pendingRef.current = pendingCommandId;

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const applyMeta = useCallback((settings: DeviceSettingsSnapshot) => {
    const mt = isModuleType(settings.moduleType)
      ? settings.moduleType
      : null;
    if (!mt) {
      setMeta({ status: "empty" });
      sinceUpdatedAtRef.current = null;
      return null;
    }
    sinceUpdatedAtRef.current = settings.updatedAt;
    setMeta({
      status: "ready",
      moduleType: mt,
      updatedAt: settings.updatedAt,
    });
    setNowMs(Date.now());
    return settings;
  }, []);

  const fetchMeta = useCallback(async (): Promise<DeviceSettingsSnapshot | null> => {
    try {
      const res = await fetch(
        `/api/devices/${encodeURIComponent(installationId)}/settings?t=${Date.now()}`,
        {
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        settings?: DeviceSettingsSnapshot | null;
      };
      if (!res.ok || !data.settings?.basic) {
        setMeta({ status: "empty" });
        sinceUpdatedAtRef.current = null;
        return null;
      }
      return applyMeta(data.settings);
    } catch {
      setMeta({ status: "empty" });
      return null;
    }
  }, [installationId, applyMeta]);

  const markSyncOk = useCallback((snap: DeviceSettingsSnapshot) => {
    settledOkRef.current = true;
    refreshInFlightRef.current = false;
    setBanner({
      tone: "ok",
      title: "동기화 완료",
      detail: `스냅샷 ${formatRelative(snap.updatedAt, Date.now())} · 설정·모듈 상태가 반영됐습니다.`,
    });
  }, []);

  const syncAfterAck = useCallback(
    async (opts: {
      commandId: string;
      since: string | null;
      token: number;
    }) => {
      const delaysMs = [0, 400, 1200, 2500, 5000, 8000];
      for (let i = 0; i < delaysMs.length; i++) {
        if (syncTokenRef.current !== opts.token || settledOkRef.current) return;
        const wait = delaysMs[i];
        if (wait > 0) {
          await new Promise((r) =>
            window.setTimeout(r, wait - (delaysMs[i - 1] ?? 0)),
          );
        }
        if (syncTokenRef.current !== opts.token || settledOkRef.current) return;
        const snap = await fetchMeta();
        if (!snap) continue;
        const fresh =
          !opts.since ||
          new Date(snap.updatedAt).getTime() > new Date(opts.since).getTime();
        if (fresh) {
          markSyncOk(snap);
          return;
        }
      }
      if (syncTokenRef.current !== opts.token || settledOkRef.current) return;
      refreshInFlightRef.current = false;
      setBanner({
        tone: "err",
        title: "스냅샷이 아직 갱신되지 않음",
        detail: "HMI가 POST /receiver/settings 를 올렸는지 확인하세요.",
      });
    },
    [fetchMeta, markSyncOk],
  );

  useEffect(() => {
    void fetchMeta();
  }, [fetchMeta]);

  useWsEvents((msg) => {
    if (
      msg.type === "settings_updated" &&
      msg.installationId === installationId
    ) {
      void fetchMeta().then((snap) => {
        if (!snap || !refreshInFlightRef.current) return;
        const baseline = baselineAtCommandRef.current;
        const fresh =
          !baseline ||
          new Date(snap.updatedAt).getTime() > new Date(baseline).getTime();
        if (!fresh) return;
        markSyncOk(snap);
      });
      return;
    }
    if (
      msg.type === "command_acked" &&
      msg.installationId === installationId &&
      pendingRef.current &&
      msg.commandId === pendingRef.current
    ) {
      const cmdId = msg.commandId;
      const since = baselineAtCommandRef.current;
      setPendingCommandId(null);
      setBusy(false);
      if (msg.status !== "acked") {
        settledOkRef.current = false;
        refreshInFlightRef.current = false;
        setBanner({
          tone: "err",
          title: "설정값 갱신 실패",
          detail: "HMI가 명령을 거절했거나 실행에 실패했습니다.",
        });
        return;
      }
      if (settledOkRef.current) return;
      const token = ++syncTokenRef.current;
      setBanner({
        tone: "pending",
        title: "설정값 갱신 완료",
        detail: "HMI 스냅샷·모듈 상태 동기화 중…",
      });
      void syncAfterAck({ commandId: cmdId, since, token });
    }
  });

  const requestRefresh = async () => {
    if (busy || pendingCommandId) return;
    setBusy(true);
    settledOkRef.current = false;
    refreshInFlightRef.current = true;
    syncTokenRef.current += 1;
    baselineAtCommandRef.current = sinceUpdatedAtRef.current;
    setBanner(null);
    try {
      const res = await fetch("/api/receiver/commands/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          installationId,
          module: 0,
          power: "refreshSettings",
          ...(requestedBy ? { requestedBy } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        code?: string;
        command?: { id: string };
      };
      if (!res.ok) {
        setBusy(false);
        refreshInFlightRef.current = false;
        setBanner({
          tone: "err",
          title: "설정값 갱신 실패",
          detail: data.message ?? data.code ?? `HTTP ${res.status}`,
        });
        return;
      }
      const id = data.command?.id ?? "";
      setPendingCommandId(id || null);
      setBanner({
        tone: "pending",
        title: "설정값 갱신 대기 중",
        detail: "HMI가 설정 스냅샷과 모듈 상태를 올립니다.",
      });
    } catch {
      setBusy(false);
      refreshInFlightRef.current = false;
      setBanner({ tone: "err", title: "네트워크 오류" });
    }
  };

  const locked = busy || pendingCommandId !== null;
  const refreshing = locked;

  const typeLabel =
    meta.status === "loading"
      ? "…"
      : meta.status === "ready"
        ? moduleTypeLabel(meta.moduleType)
        : "없음";
  const snapParts =
    meta.status === "ready" ? formatSnapParts(meta.updatedAt) : null;

  return (
    <div className="device-settings-sync" aria-label="설정·모듈 동기화">
      <div className="device-settings-sync-inner">
        <dl className="device-settings-sync-telemetry">
          <div className="device-settings-sync-tel">
            <dt>TYPE</dt>
            <dd>{typeLabel}</dd>
          </div>
          <div className="device-settings-sync-tel device-settings-sync-tel--snap">
            <dt>SNAP</dt>
            <dd>
              {meta.status === "ready" && snapParts ? (
                <>
                  <time dateTime={meta.updatedAt}>
                    <span className="device-settings-sync-clock">
                      {snapParts.time}
                    </span>
                    <span className="device-settings-sync-date">
                      {snapParts.date}
                    </span>
                  </time>
                  <span className="device-settings-sync-rel">
                    {formatRelative(meta.updatedAt, nowMs)}
                  </span>
                </>
              ) : (
                <span className="device-settings-sync-muted">
                  {meta.status === "loading" ? "불러오는 중" : "—"}
                </span>
              )}
            </dd>
          </div>
        </dl>

        <div className="device-settings-sync-ops">
          {banner ? (
            <p
              className={`device-settings-sync-rail device-settings-sync-rail--${banner.tone}`}
              role="status"
              aria-live="polite"
              title={banner.detail ?? banner.title}
            >
              {banner.tone === "pending" ? (
                <span className="device-settings-sync-spinner" aria-hidden />
              ) : null}
              <span className="device-settings-sync-rail-title">{banner.title}</span>
              {banner.detail ? (
                <span className="device-settings-sync-rail-detail">{banner.detail}</span>
              ) : null}
            </p>
          ) : (
            <p className="device-settings-sync-hint">
              전원·기본설정 최신값을 HMI에서 가져옵니다.
            </p>
          )}
          <button
            type="button"
            className="device-settings-sync-btn"
            disabled={locked}
            aria-busy={refreshing}
            onClick={() => void requestRefresh()}
          >
            {refreshing ? "갱신 중…" : "↻ 갱신"}
          </button>
        </div>
      </div>
    </div>
  );
}
