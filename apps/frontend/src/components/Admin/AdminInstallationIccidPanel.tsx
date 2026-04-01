"use client";

import { useMemo, useState } from "react";
import type { SiteListFromApi } from "../../types/admin";

type Props = {
  sites: SiteListFromApi[];
};

function normalizeIccidInput(raw: string): string {
  return raw.trim().replace(/[\s-]/g, "");
}

export default function AdminInstallationIccidPanel({ sites }: Props) {
  const rows = useMemo(() => {
    const list: Array<{
      installationId: string;
      label: string;
      siteName: string;
      siteId: string;
      client: string;
      initialIccid: string;
    }> = [];
    for (const s of sites) {
      for (const inst of s.installations) {
        list.push({
          installationId: inst.id,
          label: inst.label,
          siteName: s.name,
          siteId: s.siteId,
          client: s.client,
          initialIccid: typeof inst.iccid === "string" && inst.iccid ? inst.iccid : "",
        });
      }
    }
    return list.sort((a, b) =>
      a.siteName.localeCompare(b.siteName, "ko") || a.label.localeCompare(b.label, "ko"),
    );
  }, [sites]);

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.installationId, r.initialIccid])),
  );

  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const save = async (installationId: string) => {
    setSavingId(installationId);
    setMessage(null);
    const raw = values[installationId] ?? "";
    const norm = normalizeIccidInput(raw);
    const payload = { iccid: norm === "" ? null : norm };

    try {
      const res = await fetch(
        `/api/admin/installations/${encodeURIComponent(installationId)}/iccid`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        code?: string;
      };
      if (!res.ok) {
        setMessage({
          type: "err",
          text: data.message ?? `저장 실패 (${res.status})`,
        });
        return;
      }
      setMessage({ type: "ok", text: "저장되었습니다." });
    } catch {
      setMessage({ type: "err", text: "네트워크 오류" });
    } finally {
      setSavingId(null);
    }
  };

  if (rows.length === 0) {
    return (
      <p className="admin-iccid-empty">등록된 설치지점이 없습니다.</p>
    );
  }

  return (
    <div className="admin-iccid-panel">
      <p className="admin-iccid-hint">
        HMI는 모뎀에서 읽은 <strong>ICCID</strong>만내면 됩니다. 각 설치지점(변전실·전기실 등)에
        USIM ICCID를 아래에 맞춰 등록하세요. 공백·하이픈은 저장 시 자동으로 제거됩니다.
      </p>
      {message ? (
        <p
          className={
            message.type === "ok" ? "admin-iccid-flash ok" : "admin-iccid-flash err"
          }
          role="status"
        >
          {message.text}
        </p>
      ) : null}
      <div className="admin-iccid-table-wrap">
        <table className="admin-iccid-table">
          <thead>
            <tr>
              <th>현장</th>
              <th>설치지점</th>
              <th>installationId</th>
              <th>ICCID (USIM)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.installationId}>
                <td>
                  <div className="admin-iccid-site">{r.siteName}</div>
                  <div className="admin-iccid-meta">{r.client}</div>
                </td>
                <td>{r.label}</td>
                <td>
                  <code className="admin-iccid-code">{r.installationId}</code>
                </td>
                <td>
                  <input
                    type="text"
                    className="admin-iccid-input"
                    value={values[r.installationId] ?? ""}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [r.installationId]: e.target.value,
                      }))
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
                    disabled={savingId === r.installationId}
                    onClick={() => save(r.installationId)}
                  >
                    {savingId === r.installationId ? "저장 중…" : "저장"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
