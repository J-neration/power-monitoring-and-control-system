import AdminSitesLoader from "../../../../components/Admin/AdminSitesLoader";

export default function AdminSitesPage() {
  return (
    <main className="admin-iccid-page">
      <div className="admin-iccid-header">
        <h1 className="admin-iccid-title">현장 관리</h1>
        <p className="admin-iccid-sub">
          관리자 전용 · 현장·설치지점 등록 및 USIM ICCID 매핑 (19·20자리 상호 매칭)
        </p>
      </div>
      <AdminSitesLoader />
    </main>
  );
}
