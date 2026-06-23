import AdminRegistryPanel from "../../../../components/Admin/AdminRegistryPanel";
import {
  fetchClientOptionsFromApi,
  fetchRoleOptionsFromApi,
} from "../../../../lib/api";

export default async function AdminRegistryPage() {
  const [clients, roles] = await Promise.all([
    fetchClientOptionsFromApi().catch(() => []),
    fetchRoleOptionsFromApi().catch(() => []),
  ]);

  return (
    <main className="admin-iccid-page">
      <div className="admin-iccid-header">
        <h1 className="admin-iccid-title">마스터 데이터</h1>
        <p className="admin-iccid-sub">
          관리자 전용 · 건설사·역할 목록 관리 (유저·현장 등록 옵션)
        </p>
      </div>
      <AdminRegistryPanel initialClients={clients} initialRoles={roles} />
    </main>
  );
}
