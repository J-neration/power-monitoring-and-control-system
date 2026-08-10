import AdminIccidLoader from "../../../../components/Admin/AdminIccidLoader";

export default function AdminInstallationsIccidPage() {
  return (
    <main className="admin-iccid-page">
      <div className="admin-iccid-header">
        <h1 className="admin-iccid-title">USIM ICCID ↔ 설치지점</h1>
        <p className="admin-iccid-sub">
          관리자 전용 · HMI 수신은 등록된 ICCID로만 설치지점이 결정됩니다.
        </p>
      </div>
      <AdminIccidLoader />
    </main>
  );
}
