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

function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
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
    const id = window.setInterval(() => setNowMs(Date.now()), 15_000);
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

  return (
    <div className="device-settings-sync" aria-label="설정·모듈 동기화">
      <div className="device-settings-sync-inner">
        <div className="device-settings-sync-copy">
          <p className="device-settings-sync-kicker">온디맨드 동기화</p>
          <h3 className="device-settings-sync-title">설정 · 모듈 상태</h3>
          <p className="device-settings-sync-desc">
            아래 전원·기본 설정에 쓰는 최신값을 HMI에서 한 번 가져옵니다.
          </p>
        </div>

        <div className="device-settings-sync-facts">
          <div className="device-settings-sync-fact">
            <span className="device-settings-sync-fact-label">모듈 타입</span>
            <span className="device-settings-sync-fact-value">
              {meta.status === "loading"
                ? "…"
                : meta.status === "ready"
                  ? moduleTypeLabel(meta.moduleType)
                  : "스냅샷 없음"}
            </span>
          </div>
          <div className="device-settings-sync-fact device-settings-sync-fact--time">
            <span className="device-settings-sync-fact-label">최근 스냅샷</span>
            {meta.status === "ready" ? (
              <>
                <span className="device-settings-sync-fact-value device-settings-sync-fact-relative">
                  {formatRelative(meta.updatedAt, nowMs)}
                </span>
                <span className="device-settings-sync-fact-abs">
                  {formatAbsolute(meta.updatedAt)}
                </span>
              </>
            ) : (
              <span className="device-settings-sync-fact-value device-settings-sync-fact-muted">
                {meta.status === "loading" ? "불러오는 중…" : "—"}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          className="device-settings-sync-btn"
          disabled={locked}
          aria-busy={refreshing}
          onClick={() => void requestRefresh()}
        >
          <span className="device-settings-sync-btn-main">
            {refreshing ? "갱신 중…" : "↻ 설정값 갱신"}
          </span>
          <span className="device-settings-sync-btn-sub">
            설정 스냅샷 + 모듈 상태
          </span>
        </button>
      </div>

      {banner ? (
        <div
          className={`device-settings-sync-banner device-settings-sync-banner--${banner.tone}`}
          role="status"
          aria-live="polite"
        >
          {banner.tone === "pending" ? (
            <span className="device-settings-sync-spinner" aria-hidden />
          ) : null}
          <div>
            <p className="device-settings-sync-banner-title">{banner.title}</p>
            {banner.detail ? (
              <p className="device-settings-sync-banner-detail">{banner.detail}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
