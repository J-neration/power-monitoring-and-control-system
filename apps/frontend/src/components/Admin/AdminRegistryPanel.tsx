"use client";

import { useEffect, useState } from "react";
import type { ClientOptionFromApi, RoleOptionFromApi } from "../../types/admin";
import {
  DEFAULT_CLIENT_OPTIONS,
  DEFAULT_ROLE_OPTIONS,
  withRegistryDefaults,
} from "../../data/registryDefaults";

type Props = {
  initialClients: ClientOptionFromApi[];
  initialRoles: RoleOptionFromApi[];
};

function isFallbackId(id: string) {
  return id.startsWith("default-");
}

function formatApiError(status: number, message?: string) {
  if (
    status === 404 &&
    message?.toLowerCase().includes("not found") &&
    message.includes("/admin/registry")
  ) {
    return "백엔드에 마스터 데이터 API가 없습니다. 로컬 개발 시 .env.local의 NEXT_PUBLIC_API_BASE를 http://localhost:4000 으로 바꾸고 yarn dev로 백엔드를 재시작하거나, Railway에 최신 백엔드를 배포해 주세요.";
  }
  return message ?? `오류 (${status})`;
}

export default function AdminRegistryPanel({
  initialClients,
  initialRoles,
}: Props) {
  const [clients, setClients] = useState(
    () =>
      initialClients.length > 0 ? initialClients : DEFAULT_CLIENT_OPTIONS,
  );
  const [roles, setRoles] = useState(
    () => (initialRoles.length > 0 ? initialRoles : DEFAULT_ROLE_OPTIONS),
  );
  const [flash, setFlash] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [registryReadOnly, setRegistryReadOnly] = useState(
    () => clients.length > 0 && clients.every((c) => isFallbackId(c.id)),
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cRes, rRes] = await Promise.all([
          fetch("/api/admin/registry/clients?includeInactive=1"),
          fetch("/api/admin/registry/roles"),
        ]);
        const cData = (await cRes.json().catch(() => ({}))) as {
          clients?: ClientOptionFromApi[];
          source?: string;
        };
        const rData = (await rRes.json().catch(() => ({}))) as {
          roles?: RoleOptionFromApi[];
          source?: string;
        };
        if (cancelled) return;

        const nextClients = withRegistryDefaults(
          cData.clients ?? [],
          DEFAULT_CLIENT_OPTIONS,
        );
        const nextRoles = withRegistryDefaults(
          rData.roles ?? [],
          DEFAULT_ROLE_OPTIONS,
        );
        setClients(nextClients);
        setRoles(nextRoles);
        setRegistryReadOnly(
          cData.source === "fallback" ||
            rData.source === "fallback" ||
            nextClients.every((c) => isFallbackId(c.id)),
        );
      } catch {
        if (!cancelled) {
          setClients(DEFAULT_CLIENT_OPTIONS);
          setRoles(DEFAULT_ROLE_OPTIONS);
          setRegistryReadOnly(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [showClientForm, setShowClientForm] = useState(false);
  const [newClient, setNewClient] = useState({ key: "", label: "" });
  const [creatingClient, setCreatingClient] = useState(false);

  const [clientEditId, setClientEditId] = useState<string | null>(null);
  const [clientEditLabel, setClientEditLabel] = useState("");

  const [roleEditKey, setRoleEditKey] = useState<string | null>(null);
  const [roleEdit, setRoleEdit] = useState({
    label: "",
    description: "",
    isAssignable: true,
  });
  const [savingRole, setSavingRole] = useState(false);

  function showFlash(type: "ok" | "err", text: string) {
    setFlash({ type, text });
    setTimeout(() => setFlash(null), 4000);
  }

  async function handleCreateClient() {
    const key = newClient.key.trim().toLowerCase();
    const label = newClient.label.trim();
    if (!key || !label) {
      showFlash("err", "키와 표시명을 입력해주세요.");
      return;
    }
    setCreatingClient(true);
    try {
      const res = await fetch("/api/admin/registry/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, label }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        client?: ClientOptionFromApi;
      };
      if (!res.ok) {
        showFlash("err", formatApiError(res.status, data.message));
        return;
      }
      if (!data.client) {
        showFlash("err", "응답에 건설사 정보가 없습니다.");
        return;
      }
      setClients(
        [...clients, data.client].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "ko"),
        ),
      );
      setRegistryReadOnly(false);
      setNewClient({ key: "", label: "" });
      setShowClientForm(false);
      showFlash("ok", "건설사가 추가되었습니다.");
    } catch {
      showFlash("err", "네트워크 오류");
    } finally {
      setCreatingClient(false);
    }
  }

  async function handleSaveClientLabel(id: string) {
    const label = clientEditLabel.trim();
    if (!label) {
      showFlash("err", "표시명을 입력해주세요.");
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/registry/clients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        client?: ClientOptionFromApi;
      };
      if (!res.ok) {
        showFlash("err", formatApiError(res.status, data.message));
        return;
      }
      if (!data.client) {
        showFlash("err", "응답에 건설사 정보가 없습니다.");
        return;
      }
      setClients(clients.map((c) => (c.id === id ? data.client! : c)));
      setClientEditId(null);
      showFlash("ok", "건설사 정보가 저장되었습니다.");
    } catch {
      showFlash("err", "네트워크 오류");
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleClientActive(client: ClientOptionFromApi) {
    setBusyId(client.id);
    try {
      const res = await fetch(`/api/admin/registry/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !client.isActive }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        client?: ClientOptionFromApi;
      };
      if (!res.ok) {
        showFlash("err", formatApiError(res.status, data.message));
        return;
      }
      if (!data.client) {
        showFlash("err", "응답에 건설사 정보가 없습니다.");
        return;
      }
      setClients(clients.map((c) => (c.id === client.id ? data.client! : c)));
    } catch {
      showFlash("err", "네트워크 오류");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteClient(client: ClientOptionFromApi) {
    if (!confirm(`"${client.label}" 건설사를 삭제하시겠습니까?`)) return;
    setBusyId(client.id);
    try {
      const res = await fetch(`/api/admin/registry/clients/${client.id}`, {
        method: "DELETE",
      });
      if (res.status !== 204 && !res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        showFlash("err", formatApiError(res.status, data.message));
        return;
      }
      setClients(clients.filter((c) => c.id !== client.id));
      showFlash("ok", "건설사가 삭제되었습니다.");
    } catch {
      showFlash("err", "네트워크 오류");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSaveRole(key: string) {
    const label = roleEdit.label.trim();
    if (!label) {
      showFlash("err", "역할 표시명을 입력해주세요.");
      return;
    }
    setSavingRole(true);
    try {
      const res = await fetch(
        `/api/admin/registry/roles/${encodeURIComponent(key)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label,
            description: roleEdit.description.trim() || null,
            isAssignable: roleEdit.isAssignable,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        role?: RoleOptionFromApi;
      };
      if (!res.ok) {
        showFlash("err", formatApiError(res.status, data.message));
        return;
      }
      if (!data.role) {
        showFlash("err", "응답에 역할 정보가 없습니다.");
        return;
      }
      setRoles(roles.map((r) => (r.key === key ? data.role! : r)));
      setRoleEditKey(null);
      showFlash("ok", "역할 정보가 저장되었습니다.");
    } catch {
      showFlash("err", "네트워크 오류");
    } finally {
      setSavingRole(false);
    }
  }

  return (
    <div className="admin-registry-wrap">
      {registryReadOnly && (
        <p className="admin-registry-warning" role="status">
          마스터 데이터 DB 테이블이 아직 없어 기본 목록만 표시 중입니다. 저장·수정하려면
          백엔드에서 <code>npm run db:migrate:deploy</code> 를 실행한 뒤 서버를
          재시작하세요.
        </p>
      )}
      {flash && (
        <p className={`admin-iccid-flash ${flash.type}`} role="status">
          {flash.text}
        </p>
      )}

      <section className="admin-registry-section">
        <div className="admin-registry-section-head">
          <div>
            <h2 className="admin-registry-title">접근 건설사 목록</h2>
            <p className="admin-registry-sub">
              유저·현장 등록 시 선택할 건설사를 관리합니다.
            </p>
          </div>
          <button
            type="button"
            className="admin-sites-add-btn"
            onClick={() => setShowClientForm((v) => !v)}
          >
            {showClientForm ? "취소" : "+ 건설사 추가"}
          </button>
        </div>

        {showClientForm && (
          <div className="admin-sites-form-card admin-registry-form-card">
            <div className="admin-sites-form-grid">
              <label className="admin-sites-form-label">
                키 (영문)
                <span className="admin-sites-form-hint">예: lotte, gs</span>
                <input
                  className="admin-sites-input"
                  placeholder="lotte"
                  value={newClient.key}
                  onChange={(e) =>
                    setNewClient((p) => ({ ...p, key: e.target.value }))
                  }
                />
              </label>
              <label className="admin-sites-form-label">
                표시명
                <input
                  className="admin-sites-input"
                  placeholder="롯데건설"
                  value={newClient.label}
                  onChange={(e) =>
                    setNewClient((p) => ({ ...p, label: e.target.value }))
                  }
                />
              </label>
            </div>
            <div className="admin-sites-form-actions">
              <button
                type="button"
                className="admin-iccid-save"
                disabled={creatingClient}
                onClick={handleCreateClient}
              >
                {creatingClient ? "추가 중…" : "추가"}
              </button>
            </div>
          </div>
        )}

        <div className="admin-iccid-table-wrap">
          <table className="admin-iccid-table admin-registry-table">
            <thead>
              <tr>
                <th>키</th>
                <th>표시명</th>
                <th>상태</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id} className={!client.isActive ? "user-row-inactive" : ""}>
                  <td>
                    <code className="admin-iccid-code">{client.key}</code>
                  </td>
                  <td>
                    {clientEditId === client.id ? (
                      <input
                        className="admin-sites-input"
                        value={clientEditLabel}
                        onChange={(e) => setClientEditLabel(e.target.value)}
                        autoFocus
                      />
                    ) : (
                      client.label
                    )}
                  </td>
                  <td>
                    {client.isActive ? (
                      <span className="user-status-active">사용</span>
                    ) : (
                      <span className="user-status-inactive">비활성</span>
                    )}
                  </td>
                  <td>
                    <div className="user-actions">
                      {clientEditId === client.id ? (
                        <>
                          <button
                            type="button"
                            className="admin-iccid-save"
                            disabled={busyId === client.id}
                            onClick={() => handleSaveClientLabel(client.id)}
                          >
                            저장
                          </button>
                          <button
                            type="button"
                            className="admin-sites-cancel-btn"
                            onClick={() => setClientEditId(null)}
                          >
                            취소
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="user-action-btn"
                            onClick={() => {
                              setClientEditId(client.id);
                              setClientEditLabel(client.label);
                            }}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            className={`user-action-btn ${client.isActive ? "warn" : "ok"}`}
                            disabled={busyId === client.id}
                            onClick={() => handleToggleClientActive(client)}
                          >
                            {client.isActive ? "비활성" : "활성"}
                          </button>
                          <button
                            type="button"
                            className="admin-sites-del-btn"
                            disabled={busyId === client.id}
                            onClick={() => handleDeleteClient(client)}
                          >
                            삭제
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-registry-section">
        <div className="admin-registry-section-head">
          <div>
            <h2 className="admin-registry-title">역할 목록</h2>
            <p className="admin-registry-sub">
              계정 등록 시 표시되는 역할명과 설명을 수정할 수 있습니다.
            </p>
          </div>
        </div>

        <div className="admin-iccid-table-wrap">
          <table className="admin-iccid-table admin-registry-table">
            <thead>
              <tr>
                <th>키</th>
                <th>표시명</th>
                <th>설명</th>
                <th>등록 허용</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.key}>
                  <td>
                    <code className="admin-iccid-code">{role.key}</code>
                  </td>
                  <td>
                    {roleEditKey === role.key ? (
                      <input
                        className="admin-sites-input"
                        value={roleEdit.label}
                        onChange={(e) =>
                          setRoleEdit((p) => ({ ...p, label: e.target.value }))
                        }
                      />
                    ) : (
                      role.label
                    )}
                  </td>
                  <td className="admin-registry-desc-cell">
                    {roleEditKey === role.key ? (
                      <input
                        className="admin-sites-input"
                        value={roleEdit.description}
                        onChange={(e) =>
                          setRoleEdit((p) => ({
                            ...p,
                            description: e.target.value,
                          }))
                        }
                        placeholder="역할 설명"
                      />
                    ) : (
                      role.description ?? "-"
                    )}
                  </td>
                  <td>
                    {roleEditKey === role.key ? (
                      <label className="admin-registry-check">
                        <input
                          type="checkbox"
                          checked={roleEdit.isAssignable}
                          onChange={(e) =>
                            setRoleEdit((p) => ({
                              ...p,
                              isAssignable: e.target.checked,
                            }))
                          }
                        />
                        허용
                      </label>
                    ) : role.isAssignable ? (
                      <span className="user-status-active">허용</span>
                    ) : (
                      <span className="user-status-inactive">숨김</span>
                    )}
                  </td>
                  <td>
                    <div className="user-actions">
                      {roleEditKey === role.key ? (
                        <>
                          <button
                            type="button"
                            className="admin-iccid-save"
                            disabled={savingRole}
                            onClick={() => handleSaveRole(role.key)}
                          >
                            {savingRole ? "저장 중…" : "저장"}
                          </button>
                          <button
                            type="button"
                            className="admin-sites-cancel-btn"
                            onClick={() => setRoleEditKey(null)}
                          >
                            취소
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="user-action-btn"
                          onClick={() => {
                            setRoleEditKey(role.key);
                            setRoleEdit({
                              label: role.label,
                              description: role.description ?? "",
                              isAssignable: role.isAssignable,
                            });
                          }}
                        >
                          수정
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
