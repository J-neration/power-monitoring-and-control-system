import AdminLoadingState from "../../../components/Admin/AdminLoadingState";

export default function AdminLoading() {
  return (
    <main className="admin-iccid-page">
      <AdminLoadingState label="관리자 패널 불러오는 중…" />
    </main>
  );
}
