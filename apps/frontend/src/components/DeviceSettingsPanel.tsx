"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fieldsForModuleType,
  isModuleType,
  moduleTypeLabel,
  type BasicSettingRow,
  type DeviceSettingsSnapshot,
  type ModuleType,
  type SettingFieldDef,
} from "../lib/deviceSettingsFields";
import { useWsEvents } from "../hooks/useWsEvents";

type Props = {
  installationId: string;
  requestedBy?: string;
  /** Fallback module count from telemetry when settings snapshot missing */
  numOfMods?: number;
};

type LoadState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; snapshot: DeviceSettingsSnapshot };

function toEditableRows(
  basic: BasicSettingRow[],
  fields: SettingFieldDef[],
): BasicSettingRow[] {
  return basic.map((row) => {
    const next: BasicSettingRow = { mod: row.mod ?? 0 };
    for (const f of fields) {
      const v = row[f.key];
      if (v === undefined || v === null) {
        next[f.key] = f.kind === "switch" ? 0 : 0;
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
  const [message, setMessage] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const [pendingCommandId, setPendingCommandId] = useState<string | null>(null);

  const moduleType: ModuleType | null =
    load.status === "ready" && isModuleType(load.snapshot.moduleType)
      ? load.snapshot.moduleType
      : null;

  const fieldDefs = useMemo(
    () => (moduleType ? fieldsForModuleType(moduleType) : []),
    [moduleType],
  );

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/devices/${encodeURIComponent(installationId)}/settings`,
        { credentials: "same-origin" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        settings?: DeviceSettingsSnapshot | null;
        message?: string;
      };
      if (!res.ok) {
        setLoad({ status: "empty" });
        setMessage({
          type: "err",
          text: data.message ?? `설정 조회 실패 (${res.status})`,
        });
        return;
      }
      if (!data.settings || !Array.isArray(data.settings.basic)) {
        setLoad({ status: "empty" });
        setRows([]);
        setBaseline([]);
        return;
      }
      const mt = isModuleType(data.settings.moduleType)
        ? data.settings.moduleType
        : "v1v2";
      const fields = fieldsForModuleType(mt);
      const editable = toEditableRows(data.settings.basic, fields);
      setLoad({ status: "ready", snapshot: { ...data.settings, moduleType: mt } });
      setRows(editable);
      setBaseline(editable.map((r) => ({ ...r })));
      setSelectedMod((prev) =>
        editable.some((r) => Number(r.mod) === prev)
          ? prev
          : Number(editable[0]?.mod ?? 0),
      );
    } catch {
      setLoad({ status: "empty" });
      setMessage({ type: "err", text: "네트워크 오류" });
    }
  }, [installationId]);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  useWsEvents((msg) => {
    if (
      msg.type === "settings_updated" &&
      msg.installationId === installationId
    ) {
      void fetchSettings();
    }
    if (
      msg.type === "command_acked" &&
      msg.installationId === installationId &&
      pendingCommandId &&
      msg.commandId === pendingCommandId
    ) {
      setPendingCommandId(null);
      setMessage(
        msg.status === "acked"
          ? {
              type: "ok",
              text: "설정 적용 완료 — 다음 스냅샷에서 반영됩니다.",
            }
          : { type: "err", text: "설정 적용 실패" },
      );
      if (msg.status === "acked") {
        // Refresh snapshot after HMI posts updated settings
        window.setTimeout(() => void fetchSettings(), 5_000);
      }
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
      setMessage({ type: "ok", text: "변경된 항목이 없습니다." });
      return;
    }
    setBusy(true);
    setMessage(null);
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
        setMessage({
          type: "err",
          text: data.message ?? data.code ?? `요청 실패 (${res.status})`,
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
      setMessage({
        type: "ok",
        text: id
          ? `setBasic 명령 등록됨 ${id} — HMI 응답 대기 중…`
          : "setBasic 명령이 등록되었습니다.",
      });
    } catch {
      setMessage({ type: "err", text: "네트워크 오류" });
    } finally {
      setBusy(false);
    }
  };

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
          <h3 className="chart-title">
            기본 설정
            <span className="chart-title-sub">HMI 스냅샷 대기</span>
          </h3>
          {message ? (
            <p
              className={
                message.type === "ok"
                  ? "device-module-power-msg device-module-power-msg-ok"
                  : "device-module-power-msg device-module-power-msg-err"
              }
            >
              {message.text}
            </p>
          ) : null}
          <p className="device-settings-empty">
            아직 장치에서 설정 스냅샷이 도착하지 않았습니다.
            Settings 탭을 연 상태로 두면, HMI가 다음 텔레메트리 이후 약 1분
            주기로 설정을 전송합니다.
            {numOfMods != null ? ` (텔레메트리 모듈 수: ${numOfMods})` : null}
          </p>
          <button
            type="button"
            className="device-settings-reload"
            onClick={() => void fetchSettings()}
          >
            다시 불러오기
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="device-detail-body">
      <div className="chart-card chart-card-wide device-settings-panel">
        <h3 className="chart-title">
          기본 설정
          <span className="chart-title-sub">
            {moduleTypeLabel(moduleType)} · 스냅샷{" "}
            {new Date(load.snapshot.updatedAt).toLocaleString("ko-KR", {
              timeZone: "Asia/Seoul",
            })}
          </span>
        </h3>

        {message ? (
          <p
            className={
              message.type === "ok"
                ? "device-module-power-msg device-module-power-msg-ok"
                : "device-module-power-msg device-module-power-msg-err"
            }
            role="status"
          >
            {message.text}
          </p>
        ) : null}

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
                    disabled={busy || pendingCommandId !== null}
                    onClick={() => updateField(f.key, on ? 0 : 1)}
                  >
                    {on ? "ON" : "OFF"}
                  </button>
                </label>
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
                  disabled={busy || pendingCommandId !== null}
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
            disabled={busy || pendingCommandId !== null}
            onClick={() => void save()}
          >
            {busy ? "저장 중…" : "변경 사항 적용 (setBasic)"}
          </button>
          <button
            type="button"
            className="device-settings-reload"
            disabled={busy}
            onClick={() => void fetchSettings()}
          >
            스냅샷 새로고침
          </button>
        </div>
      </div>
    </section>
  );
}
