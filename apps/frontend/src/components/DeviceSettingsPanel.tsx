"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fieldsFromPayload,
  isModuleType,
  migrateBasicRowKeys,
  type BasicSettingRow,
  type DeviceSettingsSnapshot,
  type ModuleType,
  type SettingFieldDef,
} from "../lib/deviceSettingsFields";
import { useWsEvents } from "../hooks/useWsEvents";

type Props = {
  installationId: string;
  requestedBy?: string;
  numOfMods?: number;
};

type LoadState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; snapshot: DeviceSettingsSnapshot };

type StatusTone = "pending" | "ok" | "err" | "info";

type StatusBanner = {
  tone: StatusTone;
  title: string;
  detail?: string;
  commandId?: string;
};

function toEditableRows(
  basic: BasicSettingRow[],
  fields: SettingFieldDef[],
): BasicSettingRow[] {
  return basic.map((row) => {
    const migrated = migrateBasicRowKeys(row);
    const next: BasicSettingRow = { mod: migrated.mod ?? 0 };
    for (const f of fields) {
      const v = migrated[f.key];
      if (v === undefined || v === null) {
        next[f.key] = 0;
      } else if (typeof v === "boolean") {
        next[f.key] = v ? 1 : 0;
      } else {
        next[f.key] = v;
      }
    }
    return next;
  });
}

function diffFields(
  original: BasicSettingRow,
  edited: BasicSettingRow,
  fields: SettingFieldDef[],
): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const f of fields) {
    const a = Number(original[f.key] ?? 0);
    const b = Number(edited[f.key] ?? 0);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (a !== b) out[f.key] = b;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function formatSnapshotAbsolute(iso: string): string {
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

function formatSnapshotRelative(iso: string, nowMs: number): string {
  const diff = Math.max(0, nowMs - new Date(iso).getTime());
  const sec = Math.floor(diff / 1000);
  if (sec < 15) return "방금";
  if (sec < 60) return `${sec}초 전`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  return `${day}일 전`;
}

function StatusCard({ status }: { status: StatusBanner }) {
  return (
    <div
      className={`device-settings-status device-settings-status--${status.tone}`}
      role="status"
      aria-live="polite"
      aria-busy={status.tone === "pending"}
    >
      <div className="device-settings-status-icon" aria-hidden>
        {status.tone === "pending" ? (
          <span className="device-settings-status-spinner" />
        ) : status.tone === "ok" ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : status.tone === "err" ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <div className="device-settings-status-body">
        <p className="device-settings-status-title">{status.title}</p>
        {status.detail ? (
          <p className="device-settings-status-detail">{status.detail}</p>
        ) : null}
        {status.commandId ? (
          <code className="device-settings-status-cmd">{status.commandId}</code>
        ) : null}
      </div>
    </div>
  );
}

export default function DeviceSettingsPanel({
  installationId,
  requestedBy,
  numOfMods,
}: Props) {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [rows, setRows] = useState<BasicSettingRow[]>([]);
  const [baseline, setBaseline] = useState<BasicSettingRow[]>([]);
  const [selectedMod, setSelectedMod] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusBanner | null>(null);
  const [pendingCommandId, setPendingCommandId] = useState<string | null>(null);

  const moduleType: ModuleType | null =
    load.status === "ready" && isModuleType(load.snapshot.moduleType)
      ? load.snapshot.moduleType
      : null;

  const fieldDefs = useMemo(() => {
    if (!moduleType || load.status !== "ready") return [];
    return fieldsFromPayload(moduleType, load.snapshot.basic);
  }, [moduleType, load]);

  const snapshotUpdatedAtRef = useRef<string | null>(null);
  const baselineAtCommandRef = useRef<string | null>(null);
  const settledOkRef = useRef(false);
  const syncInFlightRef = useRef(false);
  const syncTokenRef = useRef(0);
  const pendingCommandIdRef = useRef<string | null>(null);
  pendingCommandIdRef.current = pendingCommandId;

  const applySnapshot = useCallback((settings: DeviceSettingsSnapshot) => {
    const mt = isModuleType(settings.moduleType)
      ? settings.moduleType
      : "v1v2";
    const migratedBasic = settings.basic.map(migrateBasicRowKeys);
    const fields = fieldsFromPayload(mt, migratedBasic);
    const editable = toEditableRows(migratedBasic, fields);
    const snapshot = { ...settings, moduleType: mt, basic: migratedBasic };
    snapshotUpdatedAtRef.current = snapshot.updatedAt;
    setLoad({ status: "ready", snapshot });
    setRows(editable);
    setBaseline(editable.map((r) => ({ ...r })));
    setSelectedMod((prev) =>
      editable.some((r) => Number(r.mod) === prev)
        ? prev
        : Number(editable[0]?.mod ?? 0),
    );
    return snapshot;
  }, []);

  /** Returns applied snapshot, or null on empty/error. */
  const fetchSettings = useCallback(async (): Promise<DeviceSettingsSnapshot | null> => {
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
        message?: string;
      };
      if (!res.ok) {
        setLoad({ status: "empty" });
        setStatus({
          tone: "err",
          title: "설정 조회 실패",
          detail: data.message ?? `HTTP ${res.status}`,
        });
        return null;
      }
      if (!data.settings || !Array.isArray(data.settings.basic)) {
        setLoad({ status: "empty" });
        setRows([]);
        setBaseline([]);
        return null;
      }
      return applySnapshot(data.settings);
    } catch {
      setLoad({ status: "empty" });
      setStatus({
        tone: "err",
        title: "네트워크 오류",
        detail: "설정 스냅샷을 불러오지 못했습니다.",
      });
      return null;
    }
  }, [installationId, applySnapshot]);

  /**
   * Poll until DB snapshot updatedAt moves past baseline from command send time.
   */
  const syncSnapshotAfterCommand = useCallback(
    async (opts: {
      commandId: string;
      sinceUpdatedAt: string | null;
      token: number;
    }) => {
      const delaysMs = [0, 400, 1200, 2500, 5000, 8000];
      for (let i = 0; i < delaysMs.length; i++) {
        if (syncTokenRef.current !== opts.token || settledOkRef.current) return;
        const wait = delaysMs[i];
        if (wait > 0) {
          await new Promise((r) => window.setTimeout(r, wait - (delaysMs[i - 1] ?? 0)));
        }
        if (syncTokenRef.current !== opts.token || settledOkRef.current) return;
        const snap = await fetchSettings();
        if (!snap) continue;
        const fresh =
          !opts.sinceUpdatedAt ||
          new Date(snap.updatedAt).getTime() >
            new Date(opts.sinceUpdatedAt).getTime();
        if (fresh) {
          settledOkRef.current = true;
          syncInFlightRef.current = false;
          setStatus({
            tone: "ok",
            title: "설정 동기화 완료",
            detail: `스냅샷 ${formatSnapshotRelative(snap.updatedAt, Date.now())} · ${formatSnapshotAbsolute(snap.updatedAt)}`,
            commandId: opts.commandId,
          });
          return;
        }
      }
      if (syncTokenRef.current !== opts.token || settledOkRef.current) return;
      syncInFlightRef.current = false;
      setStatus({
        tone: "err",
        title: "스냅샷이 아직 갱신되지 않음",
        detail:
          "HMI setBasic 후 POST /receiver/settings 가 이 설치에 저장됐는지 확인하세요.",
        commandId: opts.commandId,
      });
    },
    [fetchSettings],
  );

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  useWsEvents((msg) => {
    if (
      msg.type === "settings_updated" &&
      msg.installationId === installationId
    ) {
      void fetchSettings().then((snap) => {
        if (!snap || !syncInFlightRef.current) return;
        const baseline = baselineAtCommandRef.current;
        const fresh =
          !baseline ||
          new Date(snap.updatedAt).getTime() > new Date(baseline).getTime();
        if (!fresh) return;
        settledOkRef.current = true;
        syncInFlightRef.current = false;
        setStatus({
          tone: "ok",
          title: "설정 동기화 완료",
          detail: `스냅샷 ${formatSnapshotRelative(snap.updatedAt, Date.now())}`,
        });
      });
      return;
    }
    if (
      msg.type === "command_acked" &&
      msg.installationId === installationId &&
      pendingCommandIdRef.current &&
      msg.commandId === pendingCommandIdRef.current
    ) {
      const cmdId = msg.commandId;
      const since = baselineAtCommandRef.current;
      setPendingCommandId(null);
      if (msg.status !== "acked") {
        syncInFlightRef.current = false;
        settledOkRef.current = false;
        setStatus({
          tone: "err",
          title: "설정 적용 실패",
          detail: "HMI가 명령을 거절했거나 실행에 실패했습니다.",
          commandId: cmdId,
        });
        return;
      }
      if (settledOkRef.current) return;
      const token = ++syncTokenRef.current;
      setStatus({
        tone: "pending",
        title: "설정 적용 완료",
        detail: "HMI 스냅샷 동기화 중…",
        commandId: cmdId,
      });
      void syncSnapshotAfterCommand({
        commandId: cmdId,
        sinceUpdatedAt: since,
        token,
      });
    }
  });

  const currentRow = rows.find((r) => Number(r.mod) === selectedMod) ?? rows[0];
  const currentBaseline =
    baseline.find((r) => Number(r.mod) === selectedMod) ?? baseline[0];

  const updateField = (key: string, value: number) => {
    setRows((prev) =>
      prev.map((row) =>
        Number(row.mod) === selectedMod ? { ...row, [key]: value } : row,
      ),
    );
  };

  const save = async () => {
    if (!currentRow || !currentBaseline || fieldDefs.length === 0) return;
    const fields = diffFields(currentBaseline, currentRow, fieldDefs);
    if (!fields) {
      setStatus({ tone: "info", title: "변경된 항목이 없습니다." });
      return;
    }
    setBusy(true);
    setStatus(null);
    settledOkRef.current = false;
    syncInFlightRef.current = true;
    syncTokenRef.current += 1;
    baselineAtCommandRef.current = snapshotUpdatedAtRef.current;
    try {
      const res = await fetch("/api/receiver/commands/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          installationId,
          module: selectedMod,
          power: "setBasic",
          fields,
          ...(requestedBy ? { requestedBy } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        code?: string;
        command?: { id: string };
      };
      if (!res.ok) {
        syncInFlightRef.current = false;
        setStatus({
          tone: "err",
          title: "명령 등록 실패",
          detail: data.message ?? data.code ?? `HTTP ${res.status}`,
        });
        return;
      }
      const id = data.command?.id ?? "";
      setPendingCommandId(id || null);
      setBaseline((prev) =>
        prev.map((row) =>
          Number(row.mod) === selectedMod ? { ...currentRow } : row,
        ),
      );
      setStatus({
        tone: "pending",
        title: "설정 적용 대기 중",
        detail: "HMI가 다음 명령 폴링에서 setBasic을 받아 적용합니다.",
        commandId: id || undefined,
      });
    } catch {
      syncInFlightRef.current = false;
      setStatus({ tone: "err", title: "네트워크 오류" });
    } finally {
      setBusy(false);
    }
  };

  const commandLocked = busy || pendingCommandId !== null;

  if (load.status === "loading") {
    return (
      <section className="device-detail-body">
        <div className="chart-card chart-card-wide device-settings-panel">
          <h3 className="chart-title">기본 설정</h3>
          <p className="device-settings-empty">설정 스냅샷 불러오는 중…</p>
        </div>
      </section>
    );
  }

  if (load.status === "empty" || !moduleType || !currentRow) {
    return (
      <section className="device-detail-body">
        <div className="chart-card chart-card-wide device-settings-panel">
          <h3 className="chart-title">기본 설정</h3>
          {status ? <StatusCard status={status} /> : null}
          <p className="device-settings-empty">
            아직 장치에서 설정 스냅샷이 도착하지 않았습니다. 위 「설정값 갱신」으로
            HMI에서 설정·모듈 상태를 받아 오세요.
            {numOfMods != null ? ` (텔레메트리 모듈 수: ${numOfMods})` : null}
          </p>
        </div>
      </section>
    );
  }

  if (fieldDefs.length === 0) {
    return (
      <section className="device-detail-body">
        <div className="chart-card chart-card-wide device-settings-panel">
          <h3 className="chart-title">기본 설정</h3>
          {status ? <StatusCard status={status} /> : null}
          <p className="device-settings-empty">
            저장된 스냅샷에 이 moduleType({moduleType})용 필드가 없습니다. 위
            「설정값 갱신」으로 최신 설정을 다시 받으세요.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="device-detail-body">
      <div className="chart-card chart-card-wide device-settings-panel">
        <h3 className="chart-title">기본 설정</h3>

        {status ? <StatusCard status={status} /> : null}

        <div className="device-settings-mod-tabs" role="tablist">
          {rows.map((row) => {
            const mod = Number(row.mod);
            return (
              <button
                key={mod}
                type="button"
                role="tab"
                aria-selected={mod === selectedMod}
                className={`device-settings-mod-tab${mod === selectedMod ? " active" : ""}`}
                onClick={() => setSelectedMod(mod)}
              >
                M{mod + 1}
              </button>
            );
          })}
        </div>

        <div className="device-settings-grid">
          {fieldDefs.map((f) => {
            const raw = Number(currentRow[f.key] ?? 0);
            if (f.kind === "switch") {
              const on = raw !== 0;
              return (
                <label key={f.key} className="device-settings-field">
                  <span className="device-settings-field-label">{f.label}</span>
                  <button
                    type="button"
                    className={`device-settings-switch${on ? " on" : ""}`}
                    aria-pressed={on}
                    disabled={commandLocked}
                    onClick={() => updateField(f.key, on ? 0 : 1)}
                  >
                    {on ? "ON" : "OFF"}
                  </button>
                </label>
              );
            }
            if (f.kind === "select" && f.options?.length) {
              const selected = f.options.some((o) => o.value === raw)
                ? raw
                : f.options[0]!.value;
              return (
                <div key={f.key} className="device-settings-field">
                  <span className="device-settings-field-label">{f.label}</span>
                  <div
                    className="device-settings-segment"
                    role="group"
                    aria-label={f.label}
                  >
                    {f.options.map((o) => {
                      const active = o.value === selected;
                      return (
                        <button
                          key={o.value}
                          type="button"
                          className={`device-settings-segment-btn${active ? " active" : ""}`}
                          aria-pressed={active}
                          disabled={commandLocked}
                          onClick={() => updateField(f.key, o.value)}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            }
            return (
              <label key={f.key} className="device-settings-field">
                <span className="device-settings-field-label">{f.label}</span>
                <input
                  type="number"
                  className="device-settings-input"
                  step={f.step ?? 1}
                  value={Number.isFinite(raw) ? raw : 0}
                  disabled={commandLocked}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) updateField(f.key, n);
                  }}
                />
              </label>
            );
          })}
        </div>

        <div className="device-settings-actions">
          <button
            type="button"
            className="device-settings-save"
            disabled={commandLocked}
            onClick={() => void save()}
          >
            {busy
              ? "등록 중…"
              : pendingCommandId
                ? "HMI 응답 대기 중…"
                : "변경 사항 적용"}
          </button>
        </div>
      </div>
    </section>
  );
}
