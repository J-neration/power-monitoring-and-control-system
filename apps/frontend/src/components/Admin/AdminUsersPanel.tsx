"use client";

import { useState } from "react";
import { CLIENT_LABELS } from "../../data/clients";
import type { SiteListFromApi } from "../../types/admin";

type UserRole = "ADMIN" | "CLIENT" | "SITE";

type AdminUser = {
  id: string;
  username: string;
  role: UserRole;
  clientKey: string | null;
  siteId: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

type Props = {
  initialUsers: AdminUser[];
  sites: SiteListFromApi[];
};

const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: "관리자",
  CLIENT: "건설사",
  SITE: "현장",
};

const ROLE_COLOR: Record<UserRole, string> = {
  ADMIN: "user-role-admin",
  CLIENT: "user-role-client",
  SITE: "user-role-site",
};

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function scopeLabel(user: AdminUser, sites: SiteListFromApi[]) {
  if (user.role === "ADMIN") return "전체";
  if (user.role === "CLIENT") {
    return user.clientKey ? (CLIENT_LABELS[user.clientKey] ?? user.clientKey) : "-";
  }
  const site = sites.find((s) => s.siteId === user.siteId);
  return site?.name ?? user.siteId ?? "-";
}

export default function AdminUsersPanel({ initialUsers, sites }: Props) {
  const [users, setUsers] = useState<AdminUser[]>(initialUsers);
  const [flash, setFlash] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // 생성 폼
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", role: "CLIENT" as UserRole, clientKey: "", siteId: "" });
  const [creating, setCreating] = useState(false);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);

  // 비밀번호 변경
  const [pwEditId, setPwEditId] = useState<string | null>(null);
  const [newPw, setNewPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  // 삭제/비활성화
  const [actionId, setActionId] = useState<string | null>(null);

  function showFlash(type: "ok" | "err", text: string) {
    setFlash({ type, text });
    setTimeout(() => setFlash(null), 4000);
  }

  const clientOptions = Object.entries(CLIENT_LABELS).map(([v, l]) => ({ value: v, label: l }));

  // ── 생성 ──────────────────────────────────────────
  async function handleCreate() {
    if (!form.username.trim() || !form.password.trim()) {
      showFlash("err", "아이디와 비밀번호는 필수입니다.");
      return;
    }
    if (form.role === "CLIENT" && !form.clientKey) {
      showFlash("err", "건설사를 선택해주세요.");
      return;
    }
    if (form.role === "SITE" && !form.siteId) {
      showFlash("err", "현장을 선택해주세요.");
      return;
    }
    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        username: form.username.trim(),
        role: form.role,
        initialPassword: form.password,
      };
      if (form.role === "CLIENT") body.clientKey = form.clientKey;
      if (form.role === "SITE") body.siteId = form.siteId;

      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; user?: AdminUser };
      if (!res.ok) { showFlash("err", data.message ?? `오류 (${res.status})`); return; }

      setUsers((prev) => [data.user!, ...prev]);
      setCreatedPassword(form.password);
      setForm({ username: "", password: "", role: "CLIENT", clientKey: "", siteId: "" });
      setShowCreate(false);
    } catch {
      showFlash("err", "네트워크 오류");
    } finally {
      setCreating(false);
    }
  }

  // ── 비밀번호 변경 ─────────────────────────────────
  async function handleSavePw(userId: string) {
    if (newPw.length < 4) { showFlash("err", "비밀번호는 4자 이상이어야 합니다."); return; }
    setSavingPw(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: newPw }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) { showFlash("err", data.message ?? `오류 (${res.status})`); return; }
      showFlash("ok", "비밀번호가 변경되었습니다.");
      setPwEditId(null);
      setNewPw("");
    } catch {
      showFlash("err", "네트워크 오류");
    } finally {
      setSavingPw(false);
    }
  }

  // ── 활성/비활성 토글 ──────────────────────────────
  async function handleToggleActive(user: AdminUser) {
    setActionId(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; user?: AdminUser };
      if (!res.ok) { showFlash("err", data.message ?? `오류 (${res.status})`); return; }
      setUsers((prev) => prev.map((u) => u.id === user.id ? data.user! : u));
      showFlash("ok", `계정이 ${!user.isActive ? "활성화" : "비활성화"}되었습니다.`);
    } catch {
      showFlash("err", "네트워크 오류");
    } finally {
      setActionId(null);
    }
  }

  // ── 삭제 ─────────────────────────────────────────
  async function handleDelete(user: AdminUser) {
    if (!confirm(`"${user.username}" 계정을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    setActionId(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      if (res.status !== 204 && !res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        showFlash("err", data.message ?? `오류 (${res.status})`);
        return;
      }
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      showFlash("ok", "계정이 삭제되었습니다.");
    } catch {
      showFlash("err", "네트워크 오류");
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="admin-users-wrap">
      {flash && (
        <p className={`admin-iccid-flash ${flash.type}`} role="status">{flash.text}</p>
      )}

      {/* 생성 완료 알림 */}
      {createdPassword && (
        <div className="user-created-banner">
          <div className="user-created-banner-title">계정이 생성되었습니다.</div>
          <div className="user-created-banner-body">
            아래 정보를 담당자에게 전달하세요. 이 창을 닫으면 비밀번호를 다시 확인할 수 없습니다.
          </div>
          <div className="user-created-creds">
            <span className="user-created-label">아이디</span>
            <code className="admin-iccid-code">{users[0]?.username}</code>
            <span className="user-created-label" style={{ marginLeft: 16 }}>비밀번호</span>
            <code className="admin-iccid-code">{createdPassword}</code>
          </div>
          <button type="button" className="admin-sites-cancel-btn" onClick={() => setCreatedPassword(null)}>닫기</button>
        </div>
      )}

      {/* 상단 */}
      <div className="admin-sites-top">
        <button
          type="button"
          className="admin-sites-add-btn"
          onClick={() => { setShowCreate((v) => !v); setCreatedPassword(null); }}
        >
          {showCreate ? "취소" : "+ 새 계정 추가"}
        </button>
      </div>

      {/* 생성 폼 */}
      {showCreate && (
        <div className="admin-sites-form-card">
          <p className="admin-sites-form-title">새 계정 등록</p>
          <div className="admin-sites-form-grid">
            <label className="admin-sites-form-label">
              아이디 <span className="admin-sites-form-hint">(영문·숫자, 2자 이상)</span>
              <input
                className="admin-sites-input"
                placeholder="lotte_manager"
                value={form.username}
                onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
              />
            </label>
            <label className="admin-sites-form-label">
              초기 비밀번호
              <input
                className="admin-sites-input"
                type="text"
                placeholder="4자 이상"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              />
            </label>
            <label className="admin-sites-form-label">
              역할
              <select
                className="admin-sites-input"
                value={form.role}
                onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as UserRole, clientKey: "", siteId: "" }))}
              >
                <option value="CLIENT">건설사 담당자</option>
                <option value="SITE">현장 관리자</option>
                <option value="ADMIN">관리자 (ADMIN)</option>
              </select>
            </label>

            {form.role === "CLIENT" && (
              <label className="admin-sites-form-label">
                접근 건설사
                <select
                  className="admin-sites-input"
                  value={form.clientKey}
                  onChange={(e) => setForm((p) => ({ ...p, clientKey: e.target.value }))}
                >
                  <option value="">선택하세요</option>
                  {clientOptions.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </label>
            )}

            {form.role === "SITE" && (
              <label className="admin-sites-form-label">
                접근 현장
                <select
                  className="admin-sites-input"
                  value={form.siteId}
                  onChange={(e) => setForm((p) => ({ ...p, siteId: e.target.value }))}
                >
                  <option value="">선택하세요</option>
                  {sites.map((s) => (
                    <option key={s.siteId} value={s.siteId}>{s.name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="admin-sites-form-actions">
            <button
              type="button"
              className="admin-iccid-save"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? "생성 중…" : "계정 생성"}
            </button>
          </div>
        </div>
      )}

      {/* 유저 테이블 */}
      {users.length === 0 ? (
        <p className="admin-iccid-empty">등록된 계정이 없습니다.</p>
      ) : (
        <div className="admin-iccid-table-wrap">
          <table className="admin-iccid-table">
            <thead>
              <tr>
                <th>아이디</th>
                <th>역할</th>
                <th>접근 범위</th>
                <th>상태</th>
                <th>마지막 로그인</th>
                <th>생성일</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <>
                  <tr key={user.id} className={!user.isActive ? "user-row-inactive" : ""}>
                    <td>
                      <code className="admin-iccid-code">{user.username}</code>
                    </td>
                    <td>
                      <span className={`user-role-badge ${ROLE_COLOR[user.role]}`}>
                        {ROLE_LABEL[user.role]}
                      </span>
                    </td>
                    <td className="user-scope">{scopeLabel(user, sites)}</td>
                    <td>
                      {user.isActive
                        ? <span className="user-status-active">활성</span>
                        : <span className="user-status-inactive">비활성</span>}
                    </td>
                    <td style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>{formatDate(user.lastLoginAt)}</td>
                    <td style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>{formatDate(user.createdAt)}</td>
                    <td>
                      <div className="user-actions">
                        <button
                          type="button"
                          className="user-action-btn"
                          onClick={() => { setPwEditId(pwEditId === user.id ? null : user.id); setNewPw(""); }}
                        >
                          비밀번호
                        </button>
                        <button
                          type="button"
                          className={`user-action-btn ${user.isActive ? "warn" : "ok"}`}
                          disabled={actionId === user.id}
                          onClick={() => handleToggleActive(user)}
                        >
                          {actionId === user.id ? "…" : user.isActive ? "비활성화" : "활성화"}
                        </button>
                        <button
                          type="button"
                          className="admin-sites-del-btn"
                          disabled={actionId === user.id}
                          onClick={() => handleDelete(user)}
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* 비밀번호 변경 인라인 */}
                  {pwEditId === user.id && (
                    <tr key={`${user.id}-pw`} className="user-pw-row">
                      <td colSpan={7}>
                        <div className="user-pw-form">
                          <span className="user-pw-label">새 비밀번호</span>
                          <input
                            type="text"
                            className="admin-sites-input"
                            style={{ width: 200 }}
                            placeholder="4자 이상"
                            value={newPw}
                            onChange={(e) => setNewPw(e.target.value)}
                            autoFocus
                          />
                          <button
                            type="button"
                            className="admin-iccid-save"
                            disabled={savingPw}
                            onClick={() => handleSavePw(user.id)}
                          >
                            {savingPw ? "저장 중…" : "변경"}
                          </button>
                          <button
                            type="button"
                            className="admin-sites-cancel-btn"
                            onClick={() => { setPwEditId(null); setNewPw(""); }}
                          >
                            취소
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
