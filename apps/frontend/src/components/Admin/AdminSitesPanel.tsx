"use client";

import { useState } from "react";
import type { SiteListFromApi } from "../../types/admin";
import { CLIENT_LABELS, isTestClient } from "../../data/clients";

type Props = {
  initialSites: SiteListFromApi[];
};

function normalizeIccid(raw: string) {
  return raw.trim().replace(/[\s-]/g, "");
}

const CLIENT_OPTIONS = Object.entries(CLIENT_LABELS).map(([value, label]) => ({
  value,
  label,
}));

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

export default function AdminSitesPanel({ initialSites }: Props) {
  const [sites, setSites] = useState<SiteRow[]>(() =>
    initialSites.map((s) => ({
      siteId: s.siteId,
      name: s.name,
      client: s.client,
      region: s.region,
      address: s.address,
      installations: s.installations.map((i) => ({
        installationId: i.id,
        label: i.label,
        iccid: typeof i.iccid === "string" ? i.iccid : "",
      })),
    })),
  );

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

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

  // ICCID 저장 중인 installationId
  const [savingIccid, setSavingIccid] = useState<string | null>(null);
  const [deletingSite, setDeletingSite] = useState<string | null>(null);
  const [deletingInst, setDeletingInst] = useState<string | null>(null);

  function showFlash(type: "ok" | "err", text: string) {
    setFlash({ type, text });
    setTimeout(() => setFlash(null), 3500);
  }

  function toggleExpand(siteId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(siteId) ? next.delete(siteId) : next.add(siteId);
      return next;
    });
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
        showFlash("err", data.message ?? `오류 (${res.status})`);
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
      showFlash("ok", "설치지점이 추가되었습니다.");
    } catch {
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
        showFlash("err", data.message ?? `저장 실패 (${res.status})`);
        return;
      }
      showFlash("ok", "ICCID가 저장되었습니다.");
    } catch {
      showFlash("err", "네트워크 오류");
    } finally {
      setSavingIccid(null);
    }
  }

  function updateIccid(siteId: string, instId: string, value: string) {
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
        <p className={`admin-iccid-flash ${flash.type}`} role="status">
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
                {CLIENT_OPTIONS.map((c) => (
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
                        {CLIENT_LABELS[site.client] ?? site.client} · {site.region} · 설치지점{" "}
                        {site.installations.length}개
                      </span>
                    </div>
                  </div>
                  <div
                    className="admin-sites-card-header-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <code className="admin-iccid-code">{site.siteId}</code>
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
                                <button
                                  type="button"
                                  className="admin-iccid-save"
                                  disabled={savingIccid === inst.installationId}
                                  onClick={() =>
                                    handleSaveIccid(
                                      inst.installationId,
                                      inst.iccid,
                                    )
                                  }
                                >
                                  {savingIccid === inst.installationId
                                    ? "저장 중…"
                                    : "저장"}
                                </button>
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
                      </div>
                    ) : (
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
