"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { STATUS_LABEL, compareKoNumeric } from "../../lib/deviceStatus";
import { formatKstMonthDayTime } from "../../lib/kstTime";
import type { DeviceStatus } from "../../types/site";

/** GET /sites/:siteId 의 installations[].device 중 이 화면에서 쓰는 값 */
type InspectionDevice = {
  lastSeenAt: string | null;
  commLost?: boolean;
  status?: DeviceStatus;
  csq?: number | null;
  rsrp?: number | null;
  fwVersion?: string | null;
  numOfMods?: number;
};

type InspectionInstallation = {
  id: string;
  label: string;
  moduleName?: string | null;
  iccid?: string | null;
  device: InspectionDevice | null;
};

type InspectionSite = {
  id: string;
  name: string;
  installations: InspectionInstallation[];
};

type Props = { siteId: string };

const REFRESH_MS = 10_000;

const normalizeIccidInput = (raw: string) => raw.trim().replace(/[\s-]/g, "");

function commCell(device: InspectionDevice | null) {
  if (!device?.lastSeenAt) {
    return <span className="inspection-comm wait">수신 대기</span>;
  }
  const at = formatKstMonthDayTime(device.lastSeenAt);
  if (device.commLost) {
    return <span className="inspection-comm lost">끊김 · 마지막 {at}</span>;
  }
  return <span className="inspection-comm ok">수신 중 · {at}</span>;
}

function signalCell(device: InspectionDevice | null) {
  if (!device?.lastSeenAt) return "-";
  const parts: string[] = [];
  if (typeof device.csq === "number" && device.csq !== 99) parts.push(`CSQ ${device.csq}`);
  if (typeof device.rsrp === "number") parts.push(`${device.rsrp} dBm`);
  return parts.length ? parts.join(" · ") : "-";
}

export default function InspectionPanel({ siteId }: Props) {
  const [site, setSite] = useState<InspectionSite | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [form, setForm] = useState({ iccid: "", label: "", moduleName: "" });
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const iccidRef = useRef<HTMLInputElement>(null);

  const showFlash = (type: "ok" | "err", text: string) => {
    setFlash({ type, text });
    window.setTimeout(() => setFlash(null), 5000);
  };

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/inspection/sites/${encodeURIComponent(siteId)}`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        site?: InspectionSite;
        message?: string;
      };
      if (!res.ok || !data.site) {
        setLoadError(data.message ?? `검사 현장을 불러오지 못했습니다 (${res.status})`);
        return;
      }
      setLoadError(null);
      setSite(data.site);
    } catch {
      setLoadError("네트워크 오류");
    }
  }, [siteId]);

  useEffect(() => {
    void reload();
    const timer = window.setInterval(() => void reload(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [reload]);

  async function handleCreate() {
    const iccid = normalizeIccidInput(form.iccid);
    if (!/^\d{18,20}F?$/i.test(iccid)) {
      showFlash("err", "ICCID 형식이 올바르지 않습니다. (숫자 18–20자리)");
      iccidRef.current?.focus();
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/inspection/installations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          iccid,
          ...(form.label.trim() ? { label: form.label.trim() } : {}),
          ...(form.moduleName.trim() ? { moduleName: form.moduleName.trim() } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        showFlash("err", data.message ?? `등록 실패 (${res.status})`);
        return;
      }
      showFlash("ok", `등록했습니다. HMI 전원을 켜면 '수신 중'으로 바뀝니다.`);
      // 품목명은 같은 모델을 연달아 검사하는 경우가 많아 남겨 둔다.
      setForm((p) => ({ ...p, iccid: "", label: "" }));
      await reload();
    } catch {
      showFlash("err", "네트워크 오류");
    } finally {
      setCreating(false);
      iccidRef.current?.focus();
    }
  }

  async function handleRelease(inst: InspectionInstallation) {
    if (
      !confirm(
        `"${inst.label}"의 ICCID 등록을 해제할까요?\n` +
          "해제하면 이 USIM 으로 들어오는 데이터는 더 이상 이 검사 항목에 기록되지 않습니다.\n" +
          "(관리자가 실제 현장에 등록할 수 있게 됩니다)",
      )
    )
      return;
    setBusyId(inst.id);
    try {
      const res = await fetch(`/api/inspection/installations/${encodeURIComponent(inst.id)}/iccid`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iccid: null }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        showFlash("err", data.message ?? `해제 실패 (${res.status})`);
        return;
      }
      showFlash("ok", "ICCID 등록을 해제했습니다.");
      await reload();
    } catch {
      showFlash("err", "네트워크 오류");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(inst: InspectionInstallation) {
    if (!confirm(`"${inst.label}" 검사 항목을 삭제할까요?\n수신 기록도 함께 삭제되며 되돌릴 수 없습니다.`))
      return;
    setBusyId(inst.id);
    try {
      const res = await fetch(`/api/inspection/installations/${encodeURIComponent(inst.id)}`, {
        method: "DELETE",
      });
      if (res.status !== 204 && !res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        showFlash("err", data.message ?? `삭제 실패 (${res.status})`);
        return;
      }
      showFlash("ok", "삭제했습니다.");
      await reload();
    } catch {
      showFlash("err", "네트워크 오류");
    } finally {
      setBusyId(null);
    }
  }

  const rows = site
    ? [...site.installations].sort((a, b) => {
        // 등록 중인 것 먼저, 해제된 것은 아래로
        const ra = a.iccid ? 0 : 1;
        const rb = b.iccid ? 0 : 1;
        return ra - rb || compareKoNumeric(a.label, b.label);
      })
    : [];

  return (
    <div className="admin-iccid-panel">
      <p className="admin-iccid-hint">
        검사할 장비의 USIM <strong>ICCID</strong>를 입력(또는 바코드 스캔)하고 등록하세요. HMI 전원을
        켜면 통신 상태가 <strong>수신 중</strong>으로 바뀝니다. 검사가 끝나면{" "}
        <strong>ICCID 해제</strong>를 눌러 주세요. 관리자가 실제 현장에 등록할 수 있게 됩니다.
      </p>

      {flash ? (
        <p className={`admin-iccid-flash ${flash.type}`} role="status">
          {flash.text}
        </p>
      ) : null}

      <form
        className="admin-sites-form-card"
        onSubmit={(e) => {
          e.preventDefault();
          void handleCreate();
        }}
      >
        <p className="admin-sites-form-title">
          검사 장비 등록{site ? <span className="admin-sites-form-hint"> · {site.name}</span> : null}
        </p>
        <div className="admin-sites-form-grid">
          <label className="admin-sites-form-label">
            ICCID <span className="admin-sites-form-hint">(필수, 공백·하이픈 자동 제거)</span>
            <input
              ref={iccidRef}
              className="admin-sites-input"
              placeholder="8982…"
              value={form.iccid}
              onChange={(e) => setForm((p) => ({ ...p, iccid: e.target.value }))}
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />
          </label>
          <label className="admin-sites-form-label">
            장비 이름 / S/N <span className="admin-sites-form-hint">(비우면 ICCID 끝 4자리)</span>
            <input
              className="admin-sites-input"
              placeholder="S/N 2611-001"
              value={form.label}
              maxLength={80}
              onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
            />
          </label>
          <label className="admin-sites-form-label">
            품목명 <span className="admin-sites-form-hint">(선택)</span>
            <input
              className="admin-sites-input"
              placeholder="PAF 400Y-100C"
              value={form.moduleName}
              maxLength={80}
              onChange={(e) => setForm((p) => ({ ...p, moduleName: e.target.value }))}
            />
          </label>
        </div>
        <div className="admin-sites-form-actions">
          <button type="submit" className="admin-iccid-save" disabled={creating}>
            {creating ? "등록 중…" : "등록"}
          </button>
        </div>
      </form>

      {loadError ? (
        <p className="admin-iccid-empty" role="alert">
          {loadError}
        </p>
      ) : !site ? (
        <p className="admin-iccid-empty">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="admin-iccid-empty">등록된 검사 장비가 없습니다.</p>
      ) : (
        <div className="admin-iccid-table-wrap">
          <table className="admin-iccid-table">
            <thead>
              <tr>
                <th>장비</th>
                <th>ICCID</th>
                <th>통신</th>
                <th>신호</th>
                <th>펌웨어</th>
                <th>상태</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((inst) => {
                const d = inst.device;
                const busy = busyId === inst.id;
                return (
                  <tr key={inst.id} className={inst.iccid ? undefined : "user-row-inactive"}>
                    <td>
                      <Link href={`/devices/${encodeURIComponent(inst.id)}`} className="admin-iccid-site">
                        {inst.label}
                      </Link>
                      {inst.moduleName ? <div className="admin-iccid-meta">{inst.moduleName}</div> : null}
                    </td>
                    <td>
                      {inst.iccid ? (
                        <code className="admin-iccid-code">{inst.iccid}</code>
                      ) : (
                        <span className="admin-iccid-meta">해제됨</span>
                      )}
                    </td>
                    <td>{commCell(d)}</td>
                    <td className="admin-iccid-meta">{signalCell(d)}</td>
                    <td className="admin-iccid-meta">{d?.fwVersion ?? "-"}</td>
                    <td className="admin-iccid-meta">
                      {d?.lastSeenAt && d.status ? STATUS_LABEL[d.status] ?? d.status : "-"}
                      {d?.lastSeenAt && d.numOfMods ? ` · 모듈 ${d.numOfMods}` : ""}
                    </td>
                    <td>
                      <div className="user-actions">
                        {inst.iccid ? (
                          <button
                            type="button"
                            className="user-action-btn warn"
                            disabled={busy}
                            onClick={() => handleRelease(inst)}
                          >
                            {busy ? "…" : "ICCID 해제"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="admin-sites-del-btn"
                          disabled={busy}
                          onClick={() => handleDelete(inst)}
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
