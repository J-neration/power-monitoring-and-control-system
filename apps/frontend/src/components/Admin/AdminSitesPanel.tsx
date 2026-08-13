"use client";

import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { ClientOptionFromApi, SiteListFromApi } from "../../types/admin";
import { CLIENT_LABELS, isTestClient } from "../../data/clients";

type Props = {
  initialSites: SiteListFromApi[];
  clientOptions?: ClientOptionFromApi[];
};

function normalizeIccid(raw: string) {
  return raw.trim().replace(/[\s-]/g, "");
}

function buildClientOptions(clientOptions?: ClientOptionFromApi[]) {
  if (clientOptions && clientOptions.length > 0) {
    const active = clientOptions
      .filter((c) => c.isActive)
      .map((c) => ({ value: c.key, label: c.label }));
    if (active.length > 0) return active;
  }
  return Object.entries(CLIENT_LABELS).map(([value, label]) => ({
    value,
    label,
  }));
}

function toSiteRows(initialSites: SiteListFromApi[] | null | undefined): SiteRow[] {
  return (initialSites ?? []).flatMap((s) => {
    if (!s || typeof s.siteId !== "string") return [];
    return [
      {
        siteId: s.siteId,
        name: s.name ?? "",
        client: s.client ?? "",
        region: s.region ?? "기타",
        address: s.address ?? "",
        installations: (s.installations ?? []).flatMap((i) => {
          if (!i || typeof i.id !== "string") return [];
          return [
            {
              installationId: i.id,
              label: i.label ?? "",
              iccid: typeof i.iccid === "string" ? i.iccid : "",
            },
          ];
        }),
      },
    ];
  });
}

function buildClientLabelMap(clientOptions?: ClientOptionFromApi[]) {
  const map: Record<string, string> = { ...CLIENT_LABELS };
  for (const c of clientOptions ?? []) {
    map[c.key] = c.label;
  }
  return map;
}

const REGION_OPTIONS = [
  "서울",
  "경기도",
  "인천",
  "부산",
  "대구",
  "대전",
  "광주",
  "울산",
  "세종",
  "경상북도",
  "경상남도",
  "충청북도",
  "충청남도",
  "전라남도",
  "전북특별자치도",
  "강원도",
  "제주특별자치도",
  "기타",
];

type InstRow = {
  installationId: string;
  label: string;
  iccid: string;
};

type SiteRow = {
  siteId: string;
  name: string;
  client: string;
  region: string;
  address: string;
  installations: InstRow[];
};

type SiteForm = {
  name: string;
  client: string;
  region: string;
  address: string;
};

function clientSelectValue(
  client: string,
  clientOptionsList: { value: string; label: string }[],
) {
  return clientOptionsList.some((c) => c.value === client) ? client : "__custom__";
}

function SiteFieldsForm({
  values,
  customClient,
  onChange,
  onCustomClientChange,
  siteId,
  clientOptionsList,
}: {
  values: SiteForm;
  customClient: string;
  onChange: (patch: Partial<SiteForm>) => void;
  onCustomClientChange: (value: string) => void;
  siteId?: string;
  clientOptionsList: { value: string; label: string }[];
}) {
  return (
    <div className="admin-sites-form-grid">
      {siteId != null && (
        <label className="admin-sites-form-label">
          현장 ID
          <input className="admin-sites-input" value={siteId} readOnly disabled />
        </label>
      )}
      <label className="admin-sites-form-label">
        현장명
        <input
          className="admin-sites-input"
          placeholder="동탄 롯데캐슬"
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </label>
      <label className="admin-sites-form-label">
        건설사
        <select
          className="admin-sites-input"
          value={
            clientOptionsList.some((c) => c.value === values.client) ||
            values.client === "__custom__"
              ? values.client
              : "__custom__"
          }
          onChange={(e) => {
            onChange({ client: e.target.value });
            if (e.target.value !== "__custom__") onCustomClientChange("");
          }}
        >
          {clientOptionsList.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
          <option value="__custom__">직접 입력…</option>
        </select>
        {(values.client === "__custom__" ||
          !clientOptionsList.some((c) => c.value === values.client)) && (
          <input
            className="admin-sites-input"
            style={{ marginTop: 6 }}
            placeholder="건설사명 입력 (예: 대우건설)"
            value={
              values.client === "__custom__" ? customClient : values.client
            }
            onChange={(e) => {
              if (values.client !== "__custom__") {
                onChange({ client: "__custom__" });
              }
              onCustomClientChange(e.target.value);
            }}
          />
        )}
      </label>
      <label className="admin-sites-form-label">
        지역
        <select
          className="admin-sites-input"
          value={values.region}
          onChange={(e) => onChange({ region: e.target.value })}
        >
          {!REGION_OPTIONS.includes(values.region) && values.region ? (
            <option value={values.region}>{values.region}</option>
          ) : null}
          {REGION_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label
        className="admin-sites-form-label"
        style={{ gridColumn: siteId != null ? "1 / -1" : undefined }}
      >
        주소
        <input
          className="admin-sites-input"
          placeholder="경기도 화성시 동탄대로 123"
          value={values.address}
          onChange={(e) => onChange({ address: e.target.value })}
        />
      </label>
    </div>
  );
}

export default function AdminSitesPanel({
  initialSites,
  clientOptions,
}: Props) {
  const clientOptionsList = useMemo(
    () => buildClientOptions(clientOptions),
    [clientOptions],
  );
  const clientLabelMap = useMemo(
    () => buildClientLabelMap(clientOptions),
    [clientOptions],
  );
  const [sites, setSites] = useState<SiteRow[]>(() => toSiteRows(initialSites));

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const flashClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowFeedbackTimers = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});

  // 새 현장 폼
  const [showAddSite, setShowAddSite] = useState(false);
  const [newSite, setNewSite] = useState({
    id: "",
    name: "",
    client: "prime",
    region: "경기도",
    address: "",
  });
  const [customClient, setCustomClient] = useState("");
  const [addingSite, setAddingSite] = useState(false);

  // 설치지점 추가 폼 (siteId별)
  const [addInstFor, setAddInstFor] = useState<string | null>(null);
  const [newInst, setNewInst] = useState({ id: "", label: "" });
  const [addingInst, setAddingInst] = useState(false);
  /** siteId → 설치지점 추가 직후 인라인 피드백 */
  const [instAddFeedback, setInstAddFeedback] = useState<
    Record<string, { type: "ok" | "err"; text: string }>
  >({});

  // ICCID 저장 중인 installationId
  const [savingIccid, setSavingIccid] = useState<string | null>(null);
  /** installationId → ICCID 저장 결과 (버튼 옆 ✓/✕) */
  const [iccidFeedback, setIccidFeedback] = useState<
    Record<string, { type: "ok" | "err"; text: string }>
  >({});
  const [deletingSite, setDeletingSite] = useState<string | null>(null);
  const [deletingInst, setDeletingInst] = useState<string | null>(null);

  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [editSite, setEditSite] = useState<SiteForm>({
    name: "",
    client: "prime",
    region: "경기도",
    address: "",
  });
  const [editCustomClient, setEditCustomClient] = useState("");
  const [savingSite, setSavingSite] = useState<string | null>(null);

  function showFlash(type: "ok" | "err", text: string) {
    const withMark =
      type === "ok"
        ? text.startsWith("✓")
          ? text
          : `✓ ${text}`
        : text.startsWith("✕")
          ? text
          : `✕ ${text}`;
    setFlash({ type, text: withMark });
    if (flashClearTimer.current) clearTimeout(flashClearTimer.current);
    flashClearTimer.current = setTimeout(() => setFlash(null), 4000);
  }

  function setTimedFeedback(
    key: string,
    type: "ok" | "err",
    text: string,
    setter: Dispatch<
      SetStateAction<Record<string, { type: "ok" | "err"; text: string }>>
    >,
  ) {
    setter((prev) => ({ ...prev, [key]: { type, text } }));
    if (rowFeedbackTimers.current[key]) {
      clearTimeout(rowFeedbackTimers.current[key]);
    }
    rowFeedbackTimers.current[key] = setTimeout(() => {
      setter((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      delete rowFeedbackTimers.current[key];
    }, 3500);
  }

  function toggleExpand(siteId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(siteId) ? next.delete(siteId) : next.add(siteId);
      return next;
    });
    if (editingSiteId === siteId) {
      setEditingSiteId(null);
    }
  }

  function startEditSite(site: SiteRow) {
    const selectClient = clientSelectValue(site.client, clientOptionsList);
    setEditingSiteId(site.siteId);
    setEditSite({
      name: site.name,
      client: selectClient,
      region: site.region,
      address: site.address,
    });
    setEditCustomClient(selectClient === "__custom__" ? site.client : "");
    setExpanded((prev) => new Set([...prev, site.siteId]));
  }

  function cancelEditSite() {
    setEditingSiteId(null);
    setEditCustomClient("");
  }

  // ── 현장 수정 ─────────────────────────────────────────
  async function handleUpdateSite(siteId: string) {
    const clientValue =
      editSite.client === "__custom__" ? editCustomClient.trim() : editSite.client;
    if (!editSite.name || !editSite.address || !clientValue) {
      showFlash("err", "이름, 건설사, 주소는 필수입니다.");
      return;
    }
    setSavingSite(siteId);
    try {
      const payload = {
        name: editSite.name,
        client: clientValue,
        region: editSite.region,
        address: editSite.address,
      };
      const res = await fetch(`/api/admin/sites/${encodeURIComponent(siteId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        showFlash("err", data.message ?? `오류 (${res.status})`);
        return;
      }
      setSites((prev) =>
        prev.map((s) =>
          s.siteId === siteId
            ? {
                ...s,
                name: payload.name,
                client: payload.client,
                region: payload.region,
                address: payload.address,
              }
            : s,
        ),
      );
      setEditingSiteId(null);
      setEditCustomClient("");
      showFlash("ok", "현장 정보가 저장되었습니다.");
    } catch {
      showFlash("err", "네트워크 오류");
    } finally {
      setSavingSite(null);
    }
  }

  // ── 현장 추가 ─────────────────────────────────────────
  async function handleAddSite() {
    const clientValue =
      newSite.client === "__custom__" ? customClient.trim() : newSite.client;
    if (!newSite.id || !newSite.name || !newSite.address || !clientValue) {
      showFlash("err", "ID, 이름, 건설사, 주소는 필수입니다.");
      return;
    }
    const payload = { ...newSite, client: clientValue };
    setAddingSite(true);
    try {
      const res = await fetch("/api/admin/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        showFlash("err", data.message ?? `오류 (${res.status})`);
        return;
      }
      setSites((prev) => [
        ...prev,
        { ...payload, siteId: newSite.id, installations: [] },
      ]);
      setExpanded((prev) => new Set([...prev, newSite.id]));
      setNewSite({
        id: "",
        name: "",
        client: "prime",
        region: "경기도",
        address: "",
      });
      setCustomClient("");
      setShowAddSite(false);
      showFlash("ok", "현장이 추가되었습니다.");
    } catch {
      showFlash("err", "네트워크 오류");
    } finally {
      setAddingSite(false);
    }
  }

  // ── 현장 삭제 ─────────────────────────────────────────
  async function handleDeleteSite(siteId: string, siteName: string) {
    if (
      !confirm(
        `"${siteName}" 현장을 삭제하시겠습니까?\n설치지점·장치·이력 데이터가 모두 삭제됩니다.`,
      )
    )
      return;
    setDeletingSite(siteId);
    try {
      const res = await fetch(
        `/api/admin/sites/${encodeURIComponent(siteId)}`,
        { method: "DELETE" },
      );
      if (res.status !== 204 && !res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        showFlash("err", data.message ?? `오류 (${res.status})`);
        return;
      }
      setSites((prev) => prev.filter((s) => s.siteId !== siteId));
      showFlash("ok", "현장이 삭제되었습니다.");
    } catch {
      showFlash("err", "네트워크 오류");
    } finally {
      setDeletingSite(null);
    }
  }

  // ── 설치지점 추가 ─────────────────────────────────────
  async function handleAddInstallation(siteId: string) {
    if (!newInst.label) {
      showFlash("err", "설치지점 이름은 필수입니다.");
      return;
    }
    setAddingInst(true);
    try {
      const res = await fetch(
        `/api/admin/sites/${encodeURIComponent(siteId)}/installations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: newInst.id || undefined,
            label: newInst.label,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        installation?: { id: string; label: string };
      };
      if (!res.ok) {
        const msg = data.message ?? `오류 (${res.status})`;
        setTimedFeedback(siteId, "err", msg, setInstAddFeedback);
        showFlash("err", msg);
        return;
      }
      const created = data.installation!;
      setSites((prev) =>
        prev.map((s) =>
          s.siteId === siteId
            ? {
                ...s,
                installations: [
                  ...s.installations,
                  {
                    installationId: created.id,
                    label: created.label,
                    iccid: "",
                  },
                ],
              }
            : s,
        ),
      );
      setNewInst({ id: "", label: "" });
      setAddInstFor(null);
      setTimedFeedback(
        siteId,
        "ok",
        "설치지점 추가 완료",
        setInstAddFeedback,
      );
      showFlash("ok", "설치지점이 추가되었습니다.");
    } catch {
      setTimedFeedback(siteId, "err", "네트워크 오류", setInstAddFeedback);
      showFlash("err", "네트워크 오류");
    } finally {
      setAddingInst(false);
    }
  }

  // ── 설치지점 삭제 ─────────────────────────────────────
  async function handleDeleteInstallation(
    siteId: string,
    instId: string,
    instLabel: string,
  ) {
    if (
      !confirm(
        `"${instLabel}" 설치지점을 삭제하시겠습니까?\n장치·이력 데이터가 모두 삭제됩니다.`,
      )
    )
      return;
    setDeletingInst(instId);
    try {
      const res = await fetch(
        `/api/admin/installations/${encodeURIComponent(instId)}`,
        { method: "DELETE" },
      );
      if (res.status !== 204 && !res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        showFlash("err", data.message ?? `오류 (${res.status})`);
        return;
      }
      setSites((prev) =>
        prev.map((s) =>
          s.siteId === siteId
            ? {
                ...s,
                installations: s.installations.filter(
                  (i) => i.installationId !== instId,
                ),
              }
            : s,
        ),
      );
      showFlash("ok", "설치지점이 삭제되었습니다.");
    } catch {
      showFlash("err", "네트워크 오류");
    } finally {
      setDeletingInst(null);
    }
  }

  // ── ICCID 저장 ────────────────────────────────────────
  async function handleSaveIccid(instId: string, rawIccid: string) {
    setSavingIccid(instId);
    const norm = normalizeIccid(rawIccid);
    try {
      const res = await fetch(
        `/api/admin/installations/${encodeURIComponent(instId)}/iccid`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ iccid: norm === "" ? null : norm }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        const msg = data.message ?? `저장 실패 (${res.status})`;
        setTimedFeedback(instId, "err", msg, setIccidFeedback);
        showFlash("err", msg);
        return;
      }
      setTimedFeedback(instId, "ok", "저장 완료", setIccidFeedback);
      showFlash("ok", "ICCID가 저장되었습니다.");
    } catch {
      setTimedFeedback(instId, "err", "네트워크 오류", setIccidFeedback);
      showFlash("err", "네트워크 오류");
    } finally {
      setSavingIccid(null);
    }
  }

  function updateIccid(siteId: string, instId: string, value: string) {
    setIccidFeedback((prev) => {
      if (!prev[instId]) return prev;
      const next = { ...prev };
      delete next[instId];
      return next;
    });
    setSites((prev) =>
      prev.map((s) =>
        s.siteId === siteId
          ? {
              ...s,
              installations: s.installations.map((i) =>
                i.installationId === instId ? { ...i, iccid: value } : i,
              ),
            }
          : s,
      ),
    );
  }

  return (
    <div className="admin-sites-wrap">
      {flash && (
        <p
          className={`admin-iccid-flash admin-sites-flash ${flash.type}`}
          role="status"
          aria-live="polite"
        >
          {flash.text}
        </p>
      )}

      {/* 새 현장 추가 버튼 */}
      <div className="admin-sites-top">
        <button
          type="button"
          className="admin-sites-add-btn"
          onClick={() => {
            setShowAddSite((v) => !v);
          }}
        >
          {showAddSite ? "취소" : "+ 새 현장 추가"}
        </button>
      </div>

      {/* 새 현장 폼 */}
      {showAddSite && (
        <div className="admin-sites-form-card">
          <p className="admin-sites-form-title">새 현장 등록</p>
          <div className="admin-sites-form-grid">
            <label className="admin-sites-form-label">
              현장 ID{" "}
              <span className="admin-sites-form-hint">
                (소문자·숫자·하이픈)
              </span>
              <input
                className="admin-sites-input"
                placeholder="lotte-dongtan-xi"
                value={newSite.id}
                onChange={(e) =>
                  setNewSite((p) => ({ ...p, id: e.target.value }))
                }
              />
            </label>
            <label className="admin-sites-form-label">
              현장명
              <input
                className="admin-sites-input"
                placeholder="동탄 롯데캐슬"
                value={newSite.name}
                onChange={(e) =>
                  setNewSite((p) => ({ ...p, name: e.target.value }))
                }
              />
            </label>
            <label className="admin-sites-form-label">
              건설사
              <select
                className="admin-sites-input"
                value={newSite.client}
                onChange={(e) => {
                  setNewSite((p) => ({ ...p, client: e.target.value }));
                  if (e.target.value !== "__custom__") setCustomClient("");
                }}
              >
                {clientOptionsList.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
                <option value="__custom__">직접 입력…</option>
              </select>
              {newSite.client === "__custom__" && (
                <input
                  className="admin-sites-input"
                  style={{ marginTop: 6 }}
                  placeholder="건설사명 입력 (예: 대우건설)"
                  value={customClient}
                  onChange={(e) => setCustomClient(e.target.value)}
                  autoFocus
                />
              )}
            </label>
            <label className="admin-sites-form-label">
              지역
              <select
                className="admin-sites-input"
                value={newSite.region}
                onChange={(e) =>
                  setNewSite((p) => ({ ...p, region: e.target.value }))
                }
              >
                {REGION_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label
              className="admin-sites-form-label"
              style={{ gridColumn: "1 / -1" }}
            >
              주소
              <input
                className="admin-sites-input"
                placeholder="경기도 화성시 동탄대로 123"
                value={newSite.address}
                onChange={(e) =>
                  setNewSite((p) => ({ ...p, address: e.target.value }))
                }
              />
            </label>
          </div>
          <div className="admin-sites-form-actions">
            <button
              type="button"
              className="admin-iccid-save"
              onClick={handleAddSite}
              disabled={addingSite}
            >
              {addingSite ? "저장 중…" : "현장 저장"}
            </button>
          </div>
        </div>
      )}

      {/* 현장 목록 */}
      {sites.length === 0 ? (
        <p className="admin-iccid-empty">
          등록된 현장이 없습니다. 위에서 새 현장을 추가하세요.
        </p>
      ) : (
        <div className="admin-sites-list">
          {sites.map((site) => {
            const isOpen = expanded.has(site.siteId);
            return (
              <div key={site.siteId} className="admin-sites-card">
                {/* 현장 헤더 */}
                <div
                  className="admin-sites-card-header"
                  onClick={() => toggleExpand(site.siteId)}
                >
                  <div className="admin-sites-card-header-left">
                    <span className="admin-sites-chevron">
                      {isOpen ? "▼" : "▶"}
                    </span>
                    <div>
                      <span className="admin-sites-name">
                        {site.name}
                        {isTestClient(site.client) && (
                          <span className="test-badge">TEST</span>
                        )}
                      </span>
                      <span className="admin-sites-meta">
                        {clientLabelMap[site.client] ?? site.client} · {site.region} · 설치지점{" "}
                        {site.installations.length}개
                      </span>
                    </div>
                  </div>
                  <div
                    className="admin-sites-card-header-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <code className="admin-iccid-code">{site.siteId}</code>
                    {editingSiteId !== site.siteId ? (
                      <button
                        type="button"
                        className="admin-sites-edit-btn"
                        onClick={() => startEditSite(site)}
                      >
                        수정
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="admin-sites-del-btn"
                      disabled={deletingSite === site.siteId}
                      onClick={() => handleDeleteSite(site.siteId, site.name)}
                    >
                      {deletingSite === site.siteId ? "삭제 중…" : "삭제"}
                    </button>
                  </div>
                </div>

                {/* 설치지점 목록 */}
                {isOpen && (
                  <div className="admin-sites-inst-body">
                    {editingSiteId === site.siteId && (
                      <div className="admin-sites-edit-card">
                        <p className="admin-sites-form-title">현장 정보 수정</p>
                        <SiteFieldsForm
                          siteId={site.siteId}
                          values={editSite}
                          customClient={editCustomClient}
                          clientOptionsList={clientOptionsList}
                          onChange={(patch) =>
                            setEditSite((p) => ({ ...p, ...patch }))
                          }
                          onCustomClientChange={setEditCustomClient}
                        />
                        <div className="admin-sites-form-actions">
                          <button
                            type="button"
                            className="admin-iccid-save"
                            disabled={savingSite === site.siteId}
                            onClick={() => handleUpdateSite(site.siteId)}
                          >
                            {savingSite === site.siteId ? "저장 중…" : "변경 저장"}
                          </button>
                          <button
                            type="button"
                            className="admin-sites-cancel-btn"
                            disabled={savingSite === site.siteId}
                            onClick={cancelEditSite}
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    )}

                    {site.installations.length === 0 ? (
                      <p className="admin-sites-no-inst">설치지점 없음</p>
                    ) : (
                      <table className="admin-iccid-table">
                        <thead>
                          <tr>
                            <th>설치지점</th>
                            <th>Installation ID</th>
                            <th>ICCID (USIM)</th>
                            <th />
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {site.installations.map((inst) => (
                            <tr key={inst.installationId}>
                              <td>{inst.label}</td>
                              <td>
                                <code className="admin-iccid-code">
                                  {inst.installationId}
                                </code>
                              </td>
                              <td>
                                <input
                                  type="text"
                                  className="admin-iccid-input"
                                  value={inst.iccid}
                                  onChange={(e) =>
                                    updateIccid(
                                      site.siteId,
                                      inst.installationId,
                                      e.target.value,
                                    )
                                  }
                                  placeholder="893404…"
                                  autoComplete="off"
                                  spellCheck={false}
                                />
                              </td>
                              <td>
                                <div className="admin-sites-inline-actions">
                                  <button
                                    type="button"
                                    className={`admin-iccid-save${
                                      iccidFeedback[inst.installationId]
                                        ?.type === "ok"
                                        ? " admin-iccid-save--ok"
                                        : iccidFeedback[inst.installationId]
                                              ?.type === "err"
                                          ? " admin-iccid-save--err"
                                          : ""
                                    }`}
                                    disabled={
                                      savingIccid === inst.installationId
                                    }
                                    onClick={() =>
                                      handleSaveIccid(
                                        inst.installationId,
                                        inst.iccid,
                                      )
                                    }
                                  >
                                    {savingIccid === inst.installationId
                                      ? "저장 중…"
                                      : iccidFeedback[inst.installationId]
                                            ?.type === "ok"
                                        ? "✓ 완료"
                                        : iccidFeedback[inst.installationId]
                                              ?.type === "err"
                                          ? "✕ 실패"
                                          : "저장"}
                                  </button>
                                  {iccidFeedback[inst.installationId] ? (
                                    <span
                                      className={`admin-sites-inline-status ${iccidFeedback[inst.installationId].type}`}
                                    >
                                      {iccidFeedback[inst.installationId].text}
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="admin-sites-del-btn"
                                  disabled={
                                    deletingInst === inst.installationId
                                  }
                                  onClick={() =>
                                    handleDeleteInstallation(
                                      site.siteId,
                                      inst.installationId,
                                      inst.label,
                                    )
                                  }
                                >
                                  {deletingInst === inst.installationId
                                    ? "삭제 중…"
                                    : "삭제"}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {/* 설치지점 추가 폼 */}
                    {addInstFor === site.siteId ? (
                      <div className="admin-sites-inst-form">
                        <input
                          className="admin-sites-input"
                          placeholder="설치지점 (102동 변전실)"
                          value={newInst.label}
                          onChange={(e) =>
                            setNewInst((p) => ({ ...p, label: e.target.value }))
                          }
                        />
                        <input
                          className="admin-sites-input"
                          placeholder="ID 입력 (PRIME-RND-01)"
                          value={newInst.id}
                          onChange={(e) =>
                            setNewInst((p) => ({ ...p, id: e.target.value }))
                          }
                        />
                        <button
                          type="button"
                          className="admin-iccid-save"
                          disabled={addingInst}
                          onClick={() => handleAddInstallation(site.siteId)}
                        >
                          {addingInst ? "추가 중…" : "추가"}
                        </button>
                        <button
                          type="button"
                          className="admin-sites-cancel-btn"
                          onClick={() => {
                            setAddInstFor(null);
                            setNewInst({ id: "", label: "" });
                          }}
                        >
                          취소
                        </button>
                        {instAddFeedback[site.siteId]?.type === "err" ? (
                          <span className="admin-sites-inline-status err">
                            ✕ {instAddFeedback[site.siteId].text}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <div className="admin-sites-add-inst-row">
                        <button
                          type="button"
                          className="admin-sites-add-inst-btn"
                          onClick={() => {
                            setAddInstFor(site.siteId);
                            setNewInst({ id: "", label: "" });
                          }}
                        >
                          + 설치지점 추가
                        </button>
                        {instAddFeedback[site.siteId] ? (
                          <span
                            className={`admin-sites-inline-status ${instAddFeedback[site.siteId].type}`}
                          >
                            {instAddFeedback[site.siteId].type === "ok"
                              ? "✓ "
                              : "✕ "}
                            {instAddFeedback[site.siteId].text}
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
