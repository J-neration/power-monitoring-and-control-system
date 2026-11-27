"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SiteListFromApi } from "../../types/admin";
import {
  COMM_KINDS,
  fieldLabel,
  formatValue,
  isEmptyValue,
  kindOf,
  kstDayKey,
  kstDayLabel,
  kstTime,
  missingTelemetryFields,
  relativeTime,
  statusInfo,
  summarize,
  tryParse,
  type ReceiverLogRow,
} from "../../lib/commLog";

type Filters = {
  installationId: string;
  path: string;
  errorsOnly: boolean;
  q: string;
};

type ListResponse = {
  logs?: ReceiverLogRow[];
  nextBeforeId?: number | null;
  retentionDays?: number;
  enabled?: boolean;
  message?: string;
};

const PAGE_SIZE = 50;
const LIVE_MS = 10_000;

function buildQuery(filters: Filters, beforeId?: number | null) {
  const p = new URLSearchParams();
  if (filters.installationId) p.set("installationId", filters.installationId);
  if (filters.path) p.set("path", filters.path);
  if (filters.errorsOnly) p.set("errorsOnly", "1");
  if (filters.q) p.set("q", filters.q);
  if (beforeId) p.set("beforeId", String(beforeId));
  p.set("limit", String(PAGE_SIZE));
  return `/api/admin/receiver-logs?${p.toString()}`;
}

export default function AdminCommLogPanel() {
  const [filters, setFilters] = useState<Filters>({ installationId: "", path: "", errorsOnly: false, q: "" });
  const [searchDraft, setSearchDraft] = useState("");
  const [logs, setLogs] = useState<ReceiverLogRow[]>([]);
  const [nextBeforeId, setNextBeforeId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<{ retentionDays: number; enabled: boolean } | null>(null);
  const [live, setLive] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [freshIds, setFreshIds] = useState<Set<number>>(new Set());
  const [sites, setSites] = useState<SiteListFromApi[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const logsRef = useRef(logs);
  logsRef.current = logs;

  // 장비 화면 링크(?installationId=…)로 들어오면 그 설비만
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("installationId");
    if (id) setFilters((f) => ({ ...f, installationId: id }));
  }, []);

  // 설비 목록 (거르기 드롭다운)
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/sites")
      .then((r) => r.json())
      .then((d: { sites?: SiteListFromApi[] }) => {
        if (!cancelled) setSites(d.sites ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // 첫 페이지 (거르기가 바뀔 때마다)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setExpanded(new Set());
    fetch(buildQuery(filters))
      .then(async (r) => {
        const d = (await r.json().catch(() => ({}))) as ListResponse;
        if (cancelled) return;
        if (!r.ok) {
          setError(d.message ?? `불러오기 실패 (${r.status})`);
          setLogs([]);
          setNextBeforeId(null);
          return;
        }
        setLogs(d.logs ?? []);
        setNextBeforeId(d.nextBeforeId ?? null);
        if (d.retentionDays != null) setInfo({ retentionDays: d.retentionDays, enabled: d.enabled !== false });
      })
      .catch(() => {
        if (!cancelled) setError("서버에 연결할 수 없습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters]);

  // 실시간: 새로 들어온 것만 위에 붙인다
  const pollNew = useCallback(async () => {
    const current = filtersRef.current;
    try {
      const r = await fetch(buildQuery(current));
      if (!r.ok || filtersRef.current !== current) return;
      const d = (await r.json()) as ListResponse;
      const top = logsRef.current[0]?.id ?? 0;
      const fresh = (d.logs ?? []).filter((l) => l.id > top);
      if (fresh.length === 0) return;
      setLogs((prev) => [...fresh.filter((l) => l.id > (prev[0]?.id ?? 0)), ...prev]);
      setFreshIds(new Set(fresh.map((l) => l.id)));
    } catch {
      // 다음 주기에 다시 시도
    }
  }, []);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState === "visible") void pollNew();
    }, LIVE_MS);
    return () => clearInterval(t);
  }, [live, pollNew]);

  useEffect(() => {
    if (freshIds.size === 0) return;
    const t = setTimeout(() => setFreshIds(new Set()), 2500);
    return () => clearTimeout(t);
  }, [freshIds]);

  async function loadMore() {
    if (!nextBeforeId) return;
    setLoadingMore(true);
    try {
      const r = await fetch(buildQuery(filters, nextBeforeId));
      const d = (await r.json().catch(() => ({}))) as ListResponse;
      if (r.ok) {
        setLogs((prev) => [...prev, ...(d.logs ?? [])]);
        setNextBeforeId(d.nextBeforeId ?? null);
      }
    } finally {
      setLoadingMore(false);
    }
  }

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const stats = useMemo(() => {
    let ok = 0;
    let bad = 0;
    let missing = 0;
    for (const l of logs) {
      if (l.statusCode >= 400) bad += 1;
      else ok += 1;
      if (missingTelemetryFields(l).length > 0) missing += 1;
    }
    return { ok, bad, missing };
  }, [logs]);

  const hasFilter = !!(filters.installationId || filters.path || filters.errorsOnly || filters.q);

  return (
    <div className="commlog">
      <div className="commlog-toolbar">
        <label className="commlog-field">
          <span>설비</span>
          <select
            value={filters.installationId}
            onChange={(e) => setFilters((f) => ({ ...f, installationId: e.target.value }))}
          >
            <option value="">전체 설비</option>
            {sites.map((s) => (
              <optgroup key={s.siteId} label={s.name}>
                {s.installations.map((i) => (
                  <option key={i.id} value={i.id} disabled={!i.iccid}>
                    {i.label}
                    {i.iccid ? "" : " (ICCID 없음)"}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="commlog-field">
          <span>종류</span>
          <select value={filters.path} onChange={(e) => setFilters((f) => ({ ...f, path: e.target.value }))}>
            <option value="">전체 종류</option>
            {COMM_KINDS.map((k) => (
              <option key={k.path} value={k.path}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <form
          className="commlog-field commlog-search"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters((f) => ({ ...f, q: searchDraft.trim() }));
          }}
        >
          <span>내용 검색</span>
          <input
            type="search"
            placeholder="예: vL1, 89820…, Unauthorized"
            value={searchDraft}
            onChange={(e) => {
              setSearchDraft(e.target.value);
              if (e.target.value === "") setFilters((f) => ({ ...f, q: "" }));
            }}
          />
        </form>
        <div className="commlog-toggles">
          <button
            type="button"
            className={`commlog-chip${filters.errorsOnly ? " is-on is-error" : ""}`}
            onClick={() => setFilters((f) => ({ ...f, errorsOnly: !f.errorsOnly }))}
          >
            문제만 보기
          </button>
          <button
            type="button"
            className={`commlog-chip${live ? " is-on" : ""}`}
            onClick={() => setLive((v) => !v)}
            title="10초마다 새로 들어온 기록을 위에 붙입니다"
          >
            <span className={`commlog-live-dot${live ? " is-on" : ""}`} aria-hidden="true" />
            {live ? "실시간 켜짐" : "실시간 꺼짐"}
          </button>
          {hasFilter && (
            <button
              type="button"
              className="commlog-chip"
              onClick={() => {
                setSearchDraft("");
                setFilters({ installationId: "", path: "", errorsOnly: false, q: "" });
              }}
            >
              거르기 지우기
            </button>
          )}
        </div>
      </div>

      <div className="commlog-stats" aria-live="polite">
        <div className="commlog-stat">
          <span className="commlog-stat-num">{logs.length}</span>
          <span className="commlog-stat-label">불러온 기록</span>
        </div>
        <div className="commlog-stat is-ok">
          <span className="commlog-stat-num">{stats.ok}</span>
          <span className="commlog-stat-label">정상</span>
        </div>
        <div className={`commlog-stat${stats.bad ? " is-error" : ""}`}>
          <span className="commlog-stat-num">{stats.bad}</span>
          <span className="commlog-stat-label">실패</span>
        </div>
        <div className={`commlog-stat${stats.missing ? " is-warn" : ""}`}>
          <span className="commlog-stat-num">{stats.missing}</span>
          <span className="commlog-stat-label">빠진 값 있음</span>
        </div>
        <p className="commlog-stats-note">
          {info?.enabled === false
            ? "기록이 꺼져 있습니다 (RECEIVER_LOG_ENABLED=false)."
            : `최근 ${info?.retentionDays ?? 7}일 보관 · 줄을 누르면 자세한 내용이 열립니다.`}
        </p>
      </div>

      {error ? (
        <div className="commlog-empty is-error" role="alert">
          {error}
        </div>
      ) : loading ? (
        <div className="commlog-empty">불러오는 중…</div>
      ) : logs.length === 0 ? (
        <div className="commlog-empty">
          {hasFilter ? "조건에 맞는 기록이 없습니다." : "아직 받은 기록이 없습니다. HMI가 데이터를 보내면 여기에 나타납니다."}
        </div>
      ) : (
        <ol className="commlog-list">
          {logs.map((row, index) => {
            const dayChanged = index === 0 || kstDayKey(logs[index - 1].createdAt) !== kstDayKey(row.createdAt);
            return (
              <Fragment key={row.id}>
                {dayChanged && <li className="commlog-day">{kstDayLabel(row.createdAt)}</li>}
                <LogRow
                  row={row}
                  now={now}
                  open={expanded.has(row.id)}
                  fresh={freshIds.has(row.id)}
                  onToggle={() => toggle(row.id)}
                  onPickInstallation={(id) => setFilters((f) => ({ ...f, installationId: id }))}
                />
              </Fragment>
            );
          })}
        </ol>
      )}

      {nextBeforeId && !loading && !error && (
        <button type="button" className="commlog-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? "불러오는 중…" : "이전 기록 더 보기"}
        </button>
      )}
    </div>
  );
}

function LogRow({
  row,
  now,
  open,
  fresh,
  onToggle,
  onPickInstallation,
}: {
  row: ReceiverLogRow;
  now: number;
  open: boolean;
  fresh: boolean;
  onToggle: () => void;
  onPickInstallation: (installationId: string) => void;
}) {
  const kind = kindOf(row.path);
  const status = statusInfo(row.statusCode, row.responseBody);
  const missing = missingTelemetryFields(row);
  const summary = summarize(row);
  const tone = status.tone !== "ok" ? status.tone : missing.length > 0 ? "warn" : "ok";
  const where = row.siteName
    ? `${row.siteName} · ${row.installationLabel ?? ""}`
    : row.iccid
      ? `미등록 ICCID ${row.iccid}`
      : "장비 확인 불가";

  return (
    <li className={`commlog-row tone-${tone}${open ? " is-open" : ""}${fresh ? " is-fresh" : ""}`}>
      <button type="button" className="commlog-row-head" onClick={onToggle} aria-expanded={open}>
        <span className="commlog-time">
          <span className="commlog-time-clock">{kstTime(row.createdAt)}</span>
          <span className="commlog-time-rel">{relativeTime(row.createdAt, now)}</span>
        </span>
        <span className={`commlog-badge tone-${status.tone}`}>{status.label}</span>
        <span className="commlog-main">
          <span className="commlog-line1">
            <span className="commlog-kind">{kind.label}</span>
            <span className="commlog-where">{where}</span>
          </span>
          <span className="commlog-line2">
            {summary}
            {missing.length > 0 && <span className="commlog-missing-inline"> · 빠진 값 {missing.length}개</span>}
          </span>
        </span>
        <span className="commlog-chevron" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
      </button>

      {open && (
        <div className="commlog-detail">
          <div className={`commlog-explain tone-${status.tone}`}>
            <strong>{status.label}</strong> — {status.detail}
            {kind.hint && <span className="commlog-explain-kind"> ({kind.label}: {kind.hint})</span>}
          </div>
          {missing.length > 0 && (
            <div className="commlog-explain tone-warn">
              <strong>빠진 값</strong> — 측정값 보고에 꼭 있어야 하는 항목이 비어 있습니다:{" "}
              {missing.map((k) => fieldLabel(k)).join(", ")}
            </div>
          )}
          <dl className="commlog-meta">
            <div>
              <dt>설비</dt>
              <dd>
                {row.installationId ? (
                  <>
                    <Link href={`/devices/${encodeURIComponent(row.installationId)}`}>{where}</Link>
                    <button type="button" className="commlog-link-btn" onClick={() => onPickInstallation(row.installationId!)}>
                      이 설비만 보기
                    </button>
                  </>
                ) : (
                  where
                )}
              </dd>
            </div>
            <div>
              <dt>ICCID</dt>
              <dd className="mono">{row.iccid ?? "-"}</dd>
            </div>
            <div>
              <dt>요청</dt>
              <dd className="mono">
                {row.method} {row.path}
              </dd>
            </div>
            <div>
              <dt>결과 / 처리 시간</dt>
              <dd className="mono">
                {row.statusCode} · {row.durationMs}ms
              </dd>
            </div>
            <div>
              <dt>보낸 곳 IP</dt>
              <dd className="mono">{row.ip ?? "-"}</dd>
            </div>
          </dl>
          <div className="commlog-bodies">
            <BodyView
              title="HMI → 서버 (받은 데이터)"
              text={row.requestBody}
              missing={missing}
              markEmpty
              emptyText={row.method === "GET" ? "본문 없이 묻는 요청입니다 (ICCID는 위 요청 주소에 있음)." : "내용 없음"}
            />
            <BodyView title="서버 → HMI (보낸 답장)" text={row.responseBody} missing={[]} markEmpty={false} emptyText="내용 없음" />
          </div>
        </div>
      )}
    </li>
  );
}

function BodyView({
  title,
  text,
  missing,
  markEmpty,
  emptyText,
}: {
  title: string;
  text: string | null;
  missing: string[];
  /** 빈 값을 노랗게 표시 (HMI가 보낸 쪽만) */
  markEmpty: boolean;
  emptyText: string;
}) {
  const parsed = tryParse(text);
  const isObject = parsed.ok && parsed.value !== null && typeof parsed.value === "object" && !Array.isArray(parsed.value);
  const [mode, setMode] = useState<"table" | "raw">(isObject ? "table" : "raw");
  const [copied, setCopied] = useState(false);

  const pretty = parsed.ok ? JSON.stringify(parsed.value, null, 2) : (text ?? "");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 권한이 없으면 무시
    }
  }

  return (
    <section className="commlog-body">
      <header className="commlog-body-head">
        <h3>{title}</h3>
        <div className="commlog-body-actions">
          {isObject && (
            <div className="commlog-seg" role="group" aria-label="보기 방식">
              <button type="button" className={mode === "table" ? "is-on" : ""} onClick={() => setMode("table")}>
                표
              </button>
              <button type="button" className={mode === "raw" ? "is-on" : ""} onClick={() => setMode("raw")}>
                원문 JSON
              </button>
            </div>
          )}
          {text && (
            <button type="button" className="commlog-copy" onClick={copy}>
              {copied ? "복사됨" : "복사"}
            </button>
          )}
        </div>
      </header>
      {!text ? (
        <p className="commlog-body-empty">{emptyText}</p>
      ) : !parsed.ok ? (
        <>
          <p className="commlog-body-warn">JSON으로 읽을 수 없는 데이터입니다. 도착한 그대로 보여줍니다.</p>
          <pre className="commlog-pre">{text}</pre>
        </>
      ) : mode === "table" && isObject ? (
        <div className="commlog-table-wrap">
        <table className="commlog-table">
          <tbody>
            {missing
              .filter((k) => !(k in (parsed.value as Record<string, unknown>)))
              .map((k) => (
                <tr key={`missing-${k}`} className="is-empty">
                  <th>
                    {fieldLabel(k)}
                    <span className="commlog-key">{k}</span>
                  </th>
                  <td>항목 자체가 없음</td>
                </tr>
              ))}
            {Object.entries(parsed.value as Record<string, unknown>).map(([k, v]) => {
              const empty = markEmpty && isEmptyValue(v);
              return (
                <tr key={k} className={empty ? "is-empty" : ""}>
                  <th>
                    {fieldLabel(k)}
                    <span className="commlog-key">{k}</span>
                  </th>
                  <td className="mono">{empty ? `값 없음 (${formatValue(v) || "빈 값"})` : formatValue(v)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      ) : (
        <pre className="commlog-pre">
          <JsonHighlight json={pretty} />
        </pre>
      )}
    </section>
  );
}

/** 간단한 JSON 색칠 (키 / 글자 / 숫자 / true·false·null) */
function JsonHighlight({ json }: { json: string }) {
  const parts: ReactNode[] = [];
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(json))) {
    if (m.index > last) parts.push(json.slice(last, m.index));
    if (m[1]) {
      parts.push(
        <span key={i++} className={m[2] ? "j-key" : "j-str"}>
          {m[1]}
        </span>,
      );
      if (m[2]) parts.push(m[2]);
    } else if (m[3]) {
      parts.push(
        <span key={i++} className="j-lit">
          {m[3]}
        </span>,
      );
    } else if (m[4]) {
      parts.push(
        <span key={i++} className="j-num">
          {m[4]}
        </span>,
      );
    }
    last = re.lastIndex;
  }
  if (last < json.length) parts.push(json.slice(last));
  return <>{parts}</>;
}
