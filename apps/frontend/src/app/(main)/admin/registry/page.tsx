import AdminRegistryPanel from "../../../../components/Admin/AdminRegistryPanel";

/** 데이터는 AdminRegistryPanel 마운트 시 클라이언트에서 로드 (SSR 스트림 단절 방지) */
export default function AdminRegistryPage() {
  return (
    <main className="admin-iccid-page">
      <div className="admin-iccid-header">
        <h1 className="admin-iccid-title">마스터 데이터</h1>
        <p className="admin-iccid-sub">
          관리자 전용 · 건설사·역할 목록 관리 (유저·현장 등록 옵션)
        </p>
      </div>
      <AdminRegistryPanel initialClients={[]} initialRoles={[]} />
    </main>
  );
}
