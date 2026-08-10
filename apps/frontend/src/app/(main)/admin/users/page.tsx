import AdminUsersLoader from "../../../../components/Admin/AdminUsersLoader";

export default function AdminUsersPage() {
  return (
    <main className="admin-iccid-page">
      <div className="admin-iccid-header">
        <h1 className="admin-iccid-title">유저 관리</h1>
        <p className="admin-iccid-sub">
          관리자 전용 · 건설사 / 현장 담당자 계정 생성 및 관리
        </p>
      </div>
      <div className="admin-users-wrap">
        <AdminUsersLoader />
      </div>
    </main>
  );
}
