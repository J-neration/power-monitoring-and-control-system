"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHasMounted } from "../../hooks/useHasMounted";
import type { AckOutcome } from "../../hooks/useServerAlarms";
import { formatKstMonthDayTime } from "../../lib/kstTime";
import {
  ALARM_STATE_LABEL,
  alarmKindLabel,
  formatDuration,
  isUnacked,
  MAINTENANCE_OPTIONS,
  type MaintenanceItem,
  type ServerAlarm,
  type ServerAlarmState,
} from "../../lib/serverAlarms";


export type AlarmListProps = {
  alarms: ServerAlarm[];
  loaded: boolean;
  error: string | null;
  /** 관리자·고객사만 확인 버튼을 본다 (백엔드도 같은 규칙으로 막는다) */
  canAck: boolean;
  onAck: (id: number, note: string) => Promise<AckOutcome>;
  /** 화면에 보인 미확인 알람 전체 확인 */
  onAckMany: (ids: number[], note: string) => Promise<AckOutcome>;
  onSelectSite: (siteId: string, installationId?: string) => void;
  /** 선택된 현장 강조 (알람 레이아웃) */
  selectedSiteId?: string;
  /** 점검 중 설비와 그 설비의 알람 (띠·미확인 수에서 빠진 것) */
  maintenance: MaintenanceItem[];
  shelved: ServerAlarm[];
  onSetMaintenance: (installationId: string, days: number | null, note: string) => Promise<AckOutcome>;
  onClearMaintenance: (installationId: string) => Promise<AckOutcome>;
};

type Props = AlarmListProps & {
  open: boolean;
  onClose: () => void;
};

type Tab = "open" | "history";

const GROUPS: Array<{ state: ServerAlarmState; title: string; hint: string }> = [
  { state: "active_unacked", title: "발생 · 미확인", hint: "지금 이상 상태, 아직 아무도 확인 안 함" },
  { state: "cleared_unacked", title: "해제 · 미확인", hint: "잠깐 발생했다 풀림 — 확인하면 이력으로 이동" },
  { state: "active_acked", title: "발생 · 확인됨", hint: "담당자가 확인함, 아직 이상 상태" },
];

const HISTORY_RANGES = [
  { key: "1d", label: "24시간", days: 1 },
  { key: "7d", label: "7일", days: 7 },
  { key: "30d", label: "30일", days: 30 },
] as const;

type RangeKey = (typeof HISTORY_RANGES)[number]["key"];

/** 목록 제목 옆 "미확인 N · 전체 M" */
export function AlarmCounts({ alarms, loaded }: { alarms: ServerAlarm[]; loaded: boolean }) {
  if (!loaded) return null;
  const unacked = alarms.filter(isUnacked).length;
  return (
    <span className="alarm-drawer-counts">
      미확인 <strong>{unacked}</strong> · 전체 {alarms.length}
    </span>
  );
}

/** 오른쪽 서랍 (흐르는 띠의 "알람 보기") */
export default function AlarmDrawer({ open, onClose, ...list }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <aside
      className={`alarm-drawer${open ? " alarm-drawer--open" : ""}`}
      aria-hidden={!open}
      aria-label="알람 목록"
    >
      <header className="alarm-drawer-head">
        <div className="alarm-drawer-title">
          <h2>알람</h2>
          <AlarmCounts alarms={list.alarms} loaded={list.loaded} />
        </div>
        <button
          ref={closeRef}
          type="button"
          className="alarm-drawer-close"
          onClick={onClose}
          aria-label="알람 목록 닫기"
        >
          ✕
        </button>
      </header>
      <AlarmListView {...list} active={open} />
    </aside>
  );
}

/** 탭(처리할 알람 / 이력) + 목록. 서랍과 "알람" 레이아웃이 같이 쓴다. */
export function AlarmListView({
  alarms,
  loaded,
  error,
  canAck,
  onAck,
  onAckMany,
  onSelectSite,
  selectedSiteId,
  maintenance,
  shelved,
  onSetMaintenance,
  onClearMaintenance,
  active,
}: AlarmListProps & { active: boolean }) {
  const [tab, setTab] = useState<Tab>("open");

  const grouped = useMemo(
    () =>
      GROUPS.map((g) => ({ ...g, items: alarms.filter((a) => a.state === g.state) })),
    [alarms],
  );
  const unackedIds = useMemo(
    () => [...grouped[0].items, ...grouped[1].items].map((a) => a.id),
    [grouped],
  );

  return (
    <>
      <div className="alarm-drawer-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "open"}
          className={tab === "open" ? "active" : ""}
          onClick={() => setTab("open")}
        >
          처리할 알람
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "history"}
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
        >
          이력
        </button>
      </div>

      <div className="alarm-drawer-body">
        {tab === "open" ? (
          <>
            {error && <p className="alarm-drawer-error">{error}</p>}
            {!loaded && <p className="alarm-drawer-empty">불러오는 중…</p>}
            {loaded && alarms.length === 0 && !error && (
              <p className="alarm-drawer-empty">
                처리할 알람이 없습니다.
                {maintenance.length > 0 ? ` (점검 중 ${maintenance.length}곳 제외)` : ""}
              </p>
            )}
            {canAck && unackedIds.length > 0 && (
              <BulkAckBar ids={unackedIds} onAckMany={onAckMany} />
            )}
            {grouped.map(
              (g) =>
                g.items.length > 0 && (
                  <section key={g.state} className="alarm-drawer-group">
                    <h3 className={`alarm-drawer-group-title alarm-drawer-group-title--${g.state}`}>
                      {g.title} <span>{g.items.length}</span>
                    </h3>
                    <p className="alarm-drawer-group-hint">{g.hint}</p>
                    <ul className="alarm-drawer-list">
                      {g.items.map((a) => (
                        <AlarmRow
                          key={a.id}
                          alarm={a}
                          canAck={canAck}
                          onAck={onAck}
                          onSelectSite={onSelectSite}
                          selected={selectedSiteId === a.siteId}
                          onSetMaintenance={canAck ? onSetMaintenance : undefined}
                        />
                      ))}
                    </ul>
                  </section>
                ),
            )}
            {maintenance.length > 0 && (
              <MaintenanceGroup
                items={maintenance}
                shelved={shelved}
                canEdit={canAck}
                onClear={onClearMaintenance}
                onSelectSite={onSelectSite}
              />
            )}
          </>
        ) : (
          <AlarmHistory open={active} onSelectSite={onSelectSite} />
        )}
      </div>
    </>
  );
}


function BulkAckBar({
  ids,
  onAckMany,
}: {
  ids: number[];
  onAckMany: (ids: number[], note: string) => Promise<AckOutcome>;
}) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    const result = await onAckMany(ids, note);
    setBusy(false);
    if (result.ok) {
      setEditing(false);
      setNote("");
    } else {
      setErr(result.message);
    }
  };

  if (!editing) {
    return (
      <div className="alarm-bulk-bar">
        <button type="button" className="alarm-bulk-btn" onClick={() => setEditing(true)}>
          미확인 {ids.length}건 전체 확인
        </button>
      </div>
    );
  }

  return (
    <div className="alarm-bulk-bar alarm-bulk-bar--editing">
      <p className="alarm-bulk-warn">
        지금 목록에 보이는 미확인 알람 <strong>{ids.length}건</strong>을 모두 확인 처리합니다.
        같은 메모가 모든 건에 남습니다.
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={200}
        rows={2}
        placeholder="공통 메모 (선택, 200자) — 예: 정기 점검 중 일괄 확인"
        disabled={busy}
        autoFocus
      />
      <div className="alarm-row-form-actions">
        <button type="button" className="alarm-row-ack-btn" onClick={submit} disabled={busy}>
          {busy ? "확인 중…" : `${ids.length}건 모두 확인`}
        </button>
        <button
          type="button"
          className="alarm-row-cancel-btn"
          onClick={() => {
            setEditing(false);
            setErr(null);
          }}
          disabled={busy}
        >
          취소
        </button>
      </div>
      {err && <p className="alarm-drawer-error">{err}</p>}
    </div>
  );
}

function AlarmRow({
  alarm,
  canAck,
  onAck,
  onSelectSite,
  showState = false,
  selected = false,
  onSetMaintenance,
}: {
  alarm: ServerAlarm;
  canAck: boolean;
  onAck?: (id: number, note: string) => Promise<AckOutcome>;
  onSelectSite: (siteId: string, installationId?: string) => void;
  /** 이력 탭: 4단계 상태 칩 표시 */
  showState?: boolean;
  selected?: boolean;
  /** 있으면 "점검 중" 버튼을 보인다 */
  onSetMaintenance?: (installationId: string, days: number | null, note: string) => Promise<AckOutcome>;
}) {
  const mounted = useHasMounted();
  const [editing, setEditing] = useState(false);
  const [maintEditing, setMaintEditing] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const unacked = alarm.state === "active_unacked" || alarm.state === "cleared_unacked";

  const submit = useCallback(async () => {
    if (!onAck) return;
    setBusy(true);
    setErr(null);
    const result = await onAck(alarm.id, note);
    setBusy(false);
    if (result.ok) {
      setEditing(false);
      setNote("");
    } else {
      setErr(result.message);
    }
  }, [alarm.id, note, onAck]);

  return (
    <li
      className={`alarm-row alarm-row--${alarm.state} alarm-row-kind--${alarm.kind}${selected ? " alarm-row--selected" : ""}`}
    >
      <div className="alarm-row-main">
        {showState && (
          <span className={`alarm-row-state alarm-row-state--${alarm.state}`}>
            {ALARM_STATE_LABEL[alarm.state]}
          </span>
        )}
        <span className="alarm-row-kind">{alarmKindLabel(alarm.kind)}</span>
        <button
          type="button"
          className="alarm-row-site"
          onClick={() => onSelectSite(alarm.siteId, alarm.installationId)}
          title="현장으로 이동"
        >
          <strong>{alarm.siteName}</strong>
          <span className="alarm-row-sep">·</span>
          {alarm.installationLabel}
        </button>
      </div>

      <p className="alarm-row-time">
        발생 {formatKstMonthDayTime(alarm.raisedAt)}
        {alarm.clearedAt ? (
          <>
            {" "}→ 해제 {formatKstMonthDayTime(alarm.clearedAt)}
            {mounted && <> · {formatDuration(alarm.raisedAt, alarm.clearedAt)} 지속</>}
          </>
        ) : (
          mounted && <> · {formatDuration(alarm.raisedAt, null)}째</>
        )}
      </p>

      {alarm.ackedAt && (
        <p className="alarm-row-ack">
          ✓ {alarm.ackedBy ?? "알 수 없음"} · {formatKstMonthDayTime(alarm.ackedAt)}
          {alarm.ackNote && <span className="alarm-row-note">“{alarm.ackNote}”</span>}
        </p>
      )}

      {!editing && !maintEditing && ((unacked && canAck && onAck) || onSetMaintenance) && (
        <div className="alarm-row-actions">
          {unacked && canAck && onAck && (
            <button type="button" className="alarm-row-ack-btn" onClick={() => setEditing(true)}>
              확인
            </button>
          )}
          {onSetMaintenance && (
            <button
              type="button"
              className="alarm-row-maint-btn"
              onClick={() => setMaintEditing(true)}
              title="이 설비 알람을 띠·미확인 수·알람음에서 잠시 뺌 (기록은 계속 남음)"
            >
              점검 중
            </button>
          )}
        </div>
      )}

      {maintEditing && onSetMaintenance && (
        <MaintenanceForm
          onCancel={() => setMaintEditing(false)}
          onSubmit={async (days, mNote) => {
            const r = await onSetMaintenance(alarm.installationId, days, mNote);
            if (r.ok) setMaintEditing(false);
            return r;
          }}
        />
      )}

      {editing && (
        <div className="alarm-row-form">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            rows={2}
            placeholder="조치 메모 (선택, 200자)"
            disabled={busy}
            autoFocus
          />
          <div className="alarm-row-form-actions">
            <button type="button" className="alarm-row-ack-btn" onClick={submit} disabled={busy}>
              {busy ? "저장 중…" : "확인 저장"}
            </button>
            <button
              type="button"
              className="alarm-row-cancel-btn"
              onClick={() => {
                setEditing(false);
                setErr(null);
              }}
              disabled={busy}
            >
              취소
            </button>
          </div>
          {err && <p className="alarm-drawer-error">{err}</p>}
        </div>
      )}
    </li>
  );
}

function MaintenanceForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (days: number | null, note: string) => Promise<AckOutcome>;
  onCancel: () => void;
}) {
  const [days, setDays] = useState<number | null>(1);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="alarm-row-form alarm-maint-form">
      <p className="alarm-maint-form-title">
        점검 중으로 표시 — 이 설비 알람을 띠·미확인 수·알람음에서 뺍니다
      </p>
      <div className="alarm-maint-days" role="radiogroup" aria-label="점검 기간">
        {MAINTENANCE_OPTIONS.map((o) => (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={days === o.days}
            className={days === o.days ? "active" : ""}
            onClick={() => setDays(o.days)}
            disabled={busy}
          >
            {o.label}
          </button>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={200}
        rows={2}
        placeholder="사유 (선택, 200자) — 예: 모듈 교체 대기"
        disabled={busy}
        autoFocus
      />
      <div className="alarm-row-form-actions">
        <button
          type="button"
          className="alarm-row-maint-btn alarm-row-maint-btn--primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            const r = await onSubmit(days, note);
            setBusy(false);
            if (!r.ok) setErr(r.message);
          }}
        >
          {busy ? "저장 중…" : "점검 중 저장"}
        </button>
        <button type="button" className="alarm-row-cancel-btn" onClick={onCancel} disabled={busy}>
          취소
        </button>
      </div>
      {err && <p className="alarm-drawer-error">{err}</p>}
    </div>
  );
}

function MaintenanceGroup({
  items,
  shelved,
  canEdit,
  onClear,
  onSelectSite,
}: {
  items: MaintenanceItem[];
  shelved: ServerAlarm[];
  canEdit: boolean;
  onClear: (installationId: string) => Promise<AckOutcome>;
  onSelectSite: (siteId: string, installationId?: string) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  return (
    <section className="alarm-drawer-group alarm-maint-group">
      <h3 className="alarm-drawer-group-title alarm-drawer-group-title--maint">
        점검 중 <span>{items.length}</span>
      </h3>
      <p className="alarm-drawer-group-hint">
        띠·미확인 수·알람음에서 빠짐 (기록은 계속 남음). 기간이 끝나면 자동으로 다시 나타납니다.
      </p>
      {err && <p className="alarm-drawer-error">{err}</p>}
      <ul className="alarm-drawer-list">
        {items.map((m) => {
          const own = shelved.filter((a) => a.installationId === m.installationId);
          return (
            <li key={m.installationId} className="alarm-row alarm-row--maint">
              <div className="alarm-row-main">
                <span className="alarm-row-kind alarm-row-kind--maint">점검 중</span>
                <button
                  type="button"
                  className="alarm-row-site"
                  onClick={() => onSelectSite(m.siteId, m.installationId)}
                  title="현장으로 이동"
                >
                  <strong>{m.siteName}</strong>
                  <span className="alarm-row-sep">·</span>
                  {m.installationLabel}
                </button>
              </div>
              <p className="alarm-row-time">
                {m.until ? `${formatKstMonthDayTime(m.until)}까지` : "해제할 때까지"} ·{" "}
                {m.by ?? "알 수 없음"} 설정 ({formatKstMonthDayTime(m.since)})
              </p>
              {m.note && <p className="alarm-row-note alarm-maint-note">“{m.note}”</p>}
              {own.length > 0 && (
                <p className="alarm-maint-alarms">
                  보류 중 알람:{" "}
                  {own
                    .map((a) => `${alarmKindLabel(a.kind)}(${ALARM_STATE_LABEL[a.state]})`)
                    .join(", ")}
                </p>
              )}
              {canEdit && (
                <div className="alarm-row-actions">
                  <button
                    type="button"
                    className="alarm-row-cancel-btn"
                    disabled={busyId === m.installationId}
                    onClick={async () => {
                      setBusyId(m.installationId);
                      setErr(null);
                      const r = await onClear(m.installationId);
                      setBusyId(null);
                      if (!r.ok) setErr(r.message);
                    }}
                  >
                    {busyId === m.installationId ? "해제 중…" : "점검 해제"}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AlarmHistory({
  open,
  onSelectSite,
}: {
  open: boolean;
  onSelectSite: (siteId: string, installationId?: string) => void;
}) {
  const [range, setRange] = useState<RangeKey>("1d");
  const [items, setItems] = useState<ServerAlarm[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const days = HISTORY_RANGES.find((r) => r.key === range)!.days;
    const to = new Date();
    const from = new Date(to.getTime() - days * 86_400_000);
    setItems(null);
    setErr(null);
    fetch(
      `/api/alarms/history?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&limit=500`,
      { cache: "no-store" },
    )
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { alarms?: ServerAlarm[] };
        if (!cancelled) setItems(data.alarms ?? []);
      })
      .catch(() => {
        if (!cancelled) setErr("이력을 불러오지 못했습니다.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, range]);

  return (
    <div className="alarm-history">
      <div className="alarm-history-ranges" role="group" aria-label="이력 기간">
        {HISTORY_RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            className={range === r.key ? "active" : ""}
            onClick={() => setRange(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>
      {err && <p className="alarm-drawer-error">{err}</p>}
      {!err && items === null && <p className="alarm-drawer-empty">불러오는 중…</p>}
      {items && items.length === 0 && <p className="alarm-drawer-empty">이 기간에 발생한 알람이 없습니다.</p>}
      {items && items.length > 0 && (
        <>
          <p className="alarm-drawer-group-hint">
            {items.length}건{items.length >= 500 ? " (최근 500건까지 표시)" : ""} · 최신 발생 순
          </p>
          <ul className="alarm-drawer-list">
            {[...items]
              .sort((a, b) => Date.parse(b.raisedAt) - Date.parse(a.raisedAt))
              .map((a) => (
                <AlarmRow
                  key={a.id}
                  alarm={a}
                  canAck={false}
                  onSelectSite={onSelectSite}
                  showState
                />
              ))}
          </ul>
        </>
      )}
    </div>
  );
}
